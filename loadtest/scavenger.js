/**
 * Duck Hunt load test (k6).
 *
 * Simulates NUM_TEAMS concurrent players, each = one team, progressing through
 * ALL levels (which exercises ALL per-level models: Level 1 Gemma, 2 Llama,
 * 3 Nova, 4 GLM, 5 Claude Sonnet 4.6). Each virtual player:
 *   1. GETs its level (intro)         -> /api/level  (no levelId)
 *   2. sends a few chat messages       -> /api/message   (with think-time)
 *   3. pings coordinates periodically  -> /api/ping-coordinates
 *   4. scans the duck to advance       -> /api/level  (with current levelId)
 *   ...repeats through the final level.
 *
 * Throttle detection + per-(endpoint, levelPosition, model) metrics are tagged
 * so the summary shows exactly where/if anything throttled.
 *
 * Run (see loadtest/README.md):
 *   API_BASE_URL=https://xxxx.execute-api.us-west-2.amazonaws.com/prod/api \
 *   k6 run --env NUM_TEAMS=120 loadtest/scavenger.js
 */
import { check, sleep } from "k6";
import http from "k6/http";
import { Counter, Trend } from "k6/metrics";
import { SharedArray } from "k6/data";
import { scenario } from "k6/execution";

// ---- config ----
const API_BASE_URL = __ENV.API_BASE_URL;
const NUM_TEAMS = parseInt(__ENV.NUM_TEAMS || "120", 10);
const RAMP = __ENV.RAMP || "30s"; // time to ramp all VUs up
const HOLD = __ENV.HOLD || "5m"; // steady-state duration
const MSGS_PER_LEVEL = parseInt(__ENV.MSGS_PER_LEVEL || "3", 10);
const THINK_MIN = parseFloat(__ENV.THINK_MIN || "3"); // seconds between actions
const THINK_MAX = parseFloat(__ENV.THINK_MAX || "8");

if (!API_BASE_URL) throw new Error("API_BASE_URL env var is required");

// Model per level position (must match shared/src/config.ts levelModels), for
// tagging so the summary attributes load/throttles to the right model.
const LEVEL_MODELS = [
  "gemma-3-27b",
  "llama3-70b",
  "nova-lite",
  "glm-4.7",
  "claude-sonnet-4-6",
];

// Load the teams/routes produced by setup.mjs.
const TEAMS = new SharedArray("teams", () => {
  const data = JSON.parse(open("./targets.json"));
  return data.teams;
});

// ---- custom metrics ----
const throttles = new Counter("throttles"); // 429 / ThrottlingException / ProvisionedThroughputExceeded
const appErrors = new Counter("app_errors"); // non-2xx that aren't throttles
const bedrockFallbacks = new Counter("bedrock_fallbacks"); // "technical difficulties" responses
const reqByModel = new Counter("req_by_model");
const latByModel = new Trend("latency_by_model", true);

export const options = {
  scenarios: {
    players: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: RAMP, target: NUM_TEAMS },
        { duration: HOLD, target: NUM_TEAMS },
        { duration: "10s", target: 0 },
      ],
      gracefulStop: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"], // <2% hard failures
    "http_req_duration{endpoint:message}": ["p(95)<15000"],
    "http_req_duration{endpoint:level}": ["p(95)<15000"],
    "http_req_duration{endpoint:ping}": ["p(95)<2000"],
    throttles: ["count<1"], // ANY throttle fails the test
  },
};

function uuidv4() {
  // RFC4122-ish; only needs to be a valid-looking UUID for the user-id header.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function think() {
  sleep(THINK_MIN + Math.random() * (THINK_MAX - THINK_MIN));
}

// Detect throttling from status + body. API GW returns 429 for throttles;
// Lambda-surfaced Bedrock/DynamoDB throttles come back as 5xx with a telltale
// message in the body.
function classify(res, tags) {
  if (res.status === 429) {
    throttles.add(1, tags);
    return "throttle";
  }
  const body = res.body || "";
  if (
    res.status >= 500 &&
    /ThrottlingException|ProvisionedThroughputExceeded|TooManyRequests|Rate exceeded/i.test(
      body
    )
  ) {
    throttles.add(1, tags);
    return "throttle";
  }
  if (res.status >= 400) {
    appErrors.add(1, tags);
    return "error";
  }
  if (/experiencing technical difficulties/i.test(body)) {
    bedrockFallbacks.add(1, tags);
    return "fallback";
  }
  return "ok";
}

function post(path, body, headers, tags) {
  const res = http.post(`${API_BASE_URL}${path}`, JSON.stringify(body), {
    headers,
    tags,
  });
  const outcome = classify(res, tags);
  if (tags.model) {
    reqByModel.add(1, { model: tags.model });
    latByModel.add(res.timings.duration, { model: tags.model });
  }
  check(res, {
    "status ok": (r) => r.status >= 200 && r.status < 300,
    "not throttled": () => outcome !== "throttle",
  });
  return res;
}

export default function () {
  // Each VU maps to one team (mod, in case VUs > teams).
  const team = TEAMS[(scenario.iterationInTest + __VU) % TEAMS.length];
  const userId = uuidv4(); // one device per VU
  const headers = {
    "Content-Type": "application/json",
    "user-id": userId,
    "team-id": team.teamId,
  };

  // Progress through every level in the team's route.
  for (let pos = 0; pos < team.levelIds.length; pos++) {
    const levelId = team.levelIds[pos];
    const model = LEVEL_MODELS[pos] || `level-${pos + 1}`;
    const baseTags = { levelPosition: String(pos + 1), model };

    // 1. Land on the level (intro). No levelId => "current level" fetch.
    post("/level", {}, headers, { ...baseTags, endpoint: "level" });
    think();

    // 2. Chat a few times (this is what actually hits the model).
    for (let m = 0; m < MSGS_PER_LEVEL; m++) {
      post(
        "/message",
        {
          message: {
            id: uuidv4(),
            role: "user",
            content: `load test message ${m + 1} at level ${pos + 1}`,
            createdAt: new Date().toISOString(),
          },
        },
        headers,
        { ...baseTags, endpoint: "message" }
      );
      // Ping coordinates between messages (background load, like the real client).
      post(
        "/ping-coordinates",
        { latitude: 35.3 + Math.random() * 0.01, longitude: -120.66 },
        headers,
        { ...baseTags, endpoint: "ping" }
      );
      think();
    }

    // 3. Scan the duck to advance to the next level.
    post("/level", { levelId }, headers, {
      ...baseTags,
      endpoint: "level_advance",
    });
    think();
  }
}
