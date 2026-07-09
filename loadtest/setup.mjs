#!/usr/bin/env node
/**
 * Load-test setup: create a dedicated game with N teams (one per virtual user),
 * upload it to the game-config bucket, wait for the CreateGame Lambda to
 * populate DynamoDB, then read the generated team-ids and per-team ordered
 * level-ids out of CloudWatch into loadtest/targets.json (consumed by k6).
 *
 * Why a dedicated game: 1 virtual user = 1 team means every VU solo-progresses
 * with no shared-state interference, so all 5 levels (and thus all 5 models)
 * get exercised deterministically.
 *
 * Usage:
 *   UNIQUE_ID=dev-sshreyy AWS_REGION=us-west-2 node loadtest/setup.mjs [numTeams]
 *
 * Requires: AWS creds in env, and the stack already deployed.
 */
import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGION = process.env.AWS_REGION || "us-west-2";
const UNIQUE_ID = process.env.UNIQUE_ID;
const NUM_TEAMS = parseInt(process.argv[2] || "120", 10);

if (!UNIQUE_ID) {
  console.error("ERROR: UNIQUE_ID env var is required.");
  process.exit(1);
}

const CONFIG_BUCKET = `game-config-${UNIQUE_ID}`;
const LOG_GROUP = `CreateGameLambdaLogGroup-${UNIQUE_ID}`;
const CONFIG_KEY = `loadtest-${Date.now()}.json`;

const s3 = new S3Client({ region: REGION });
const logs = new CloudWatchLogsClient({ region: REGION });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Resolve the game config. Order: CONFIG_PATH env → parent-of-repo config.json
// (where this project keeps it) → repo config.json → repo example-config.json.
function resolveConfigPath() {
  const candidates = [
    process.env.CONFIG_PATH,
    join(__dirname, "..", "..", "config.json"), // Projects/Duck Hunt/config.json
    join(__dirname, "..", "config.json"), // repo root
    join(__dirname, "..", "example-config.json"),
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      `No config found. Set CONFIG_PATH, or place config.json. Tried:\n  ${candidates.join(
        "\n  "
      )}`
    );
  }
  return found;
}

// Build a config with NUM_TEAMS teams, reusing the real levels from config.json
// (so the per-level model mapping is exercised exactly as in production).
function buildConfig() {
  const configPath = resolveConfigPath();
  console.log(`INFO: Using game config: ${configPath}`);
  const base = JSON.parse(readFileSync(configPath, "utf8"));
  const teams = Array.from({ length: NUM_TEAMS }, (_, i) => ({
    name: `LoadTest Team ${String(i + 1).padStart(3, "0")}`,
  }));
  return { ...base, teams };
}

async function uploadConfig(config) {
  console.log(
    `INFO: Uploading load-test config (${config.teams.length} teams) to s3://${CONFIG_BUCKET}/${CONFIG_KEY}`
  );
  await s3.send(
    new PutObjectCommand({
      Bucket: CONFIG_BUCKET,
      Key: CONFIG_KEY,
      Body: JSON.stringify(config),
      ContentType: "application/json",
    })
  );
}

// Pull the "Game Data:" JSON blob that CreateGame logs. It contains team ids +
// urls and level ids + urls. We also need each team's ORDERED level route; that
// isn't in the JSON blob, so we parse the per-team "route" the Lambda logs.
async function fetchGameData(startTime) {
  // Retry: CreateGame runs async after upload; logs take a few seconds.
  for (let attempt = 1; attempt <= 20; attempt++) {
    await sleep(3000);
    const events = [];
    let nextToken;
    do {
      const res = await logs.send(
        new FilterLogEventsCommand({
          logGroupName: LOG_GROUP,
          startTime,
          nextToken,
        })
      );
      events.push(...(res.events || []));
      nextToken = res.nextToken;
    } while (nextToken);

    const joined = events.map((e) => e.message).join("\n");
    const marker = joined.lastIndexOf("Game Data:");
    if (marker === -1) {
      console.log(`  ...waiting for CreateGame logs (attempt ${attempt}/20)`);
      continue;
    }
    // Extract the JSON object after "Game Data:".
    const after = joined.slice(marker + "Game Data:".length);
    const start = after.indexOf("{");
    if (start === -1) continue;
    // Balance braces to find the end of the JSON object.
    let depth = 0;
    let end = -1;
    for (let i = start; i < after.length; i++) {
      if (after[i] === "{") depth++;
      else if (after[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end === -1) continue;
    try {
      return JSON.parse(after.slice(start, end));
    } catch (e) {
      console.log("  ...Game Data JSON not complete yet, retrying");
    }
  }
  throw new Error(
    `Timed out waiting for CreateGame output in ${LOG_GROUP}. Check the Lambda logs.`
  );
}

async function main() {
  const config = buildConfig();
  const startTime = Date.now() - 5000;
  await uploadConfig(config);
  console.log("INFO: Waiting for CreateGame Lambda to populate DynamoDB...");
  const gameData = await fetchGameData(startTime);

  // gameData.teams[].route is [{ order, levelName }]; map levelName -> level id.
  const levelIdByName = new Map(gameData.levels.map((l) => [l.name, l.id]));

  const targets = {
    gameId: gameData.gameId,
    apiBaseUrl: process.env.API_BASE_URL || null, // filled by run script if unset
    // Ordered level id list per team (the route the player must scan through).
    teams: gameData.teams.map((t) => ({
      teamId: t.id,
      name: t.name,
      levelIds: (t.route || [])
        .sort((a, b) => a.order - b.order)
        .map((stop) => levelIdByName.get(stop.levelName))
        .filter(Boolean),
    })),
  };

  const outPath = join(__dirname, "targets.json");
  writeFileSync(outPath, JSON.stringify(targets, null, 2));
  console.log(
    `INFO: Wrote ${targets.teams.length} teams to ${outPath} (gameId ${targets.gameId}).`
  );
  const sample = targets.teams[0];
  console.log(
    `INFO: Sample team "${sample.name}" route has ${sample.levelIds.length} levels.`
  );
  if (sample.levelIds.length === 0) {
    console.warn(
      "WARN: No level ids in routes. Ensure createGame logs per-team routes (TEAM ROUTES / route field)."
    );
  }
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
