# Duck Hunt Load Test

Simulates concurrent players (default 120) each progressing through **all 5
levels**, which exercises **all 5 per-level models** (Gemma → Llama → Nova →
GLM → Claude Sonnet 4.6). Reports latency, errors, and — importantly — whether
anything **throttled and where** (DynamoDB / Lambda / Bedrock).

## Prerequisites

1. **Deploy the stack** with the DynamoDB on-demand fix (`BillingMode.PAY_PER_REQUEST`):
   ```bash
   ./scripts/deploy.sh -r us-west-2 -u dev-yourname
   ```
   > This fix is essential — without it the table defaults to 5 RCU/WCU and
   > throttles immediately, making the test meaningless.
2. **k6** installed: `brew install k6`
3. **AWS credentials** in your shell (`aws sts get-caller-identity` works).
4. The stack's **API base URL** (from CDK output / API Gateway console), ending
   in `/prod/api`.
5. **Install the helper deps** (for `setup.mjs` / `metrics.mjs`):
   ```bash
   cd loadtest && npm install
   ```

## Step 1 — create the load-test game

Generates a game with N teams (1 per virtual user), uploads it, and writes
`loadtest/targets.json` (team ids + each team's ordered level ids):

```bash
cd loadtest
UNIQUE_ID=dev-yourname AWS_REGION=us-west-2 node setup.mjs 120
```

## Step 2 — run the load test

```bash
API_BASE_URL=https://<api-id>.execute-api.us-west-2.amazonaws.com/prod/api \
  k6 run --env NUM_TEAMS=120 scavenger.js
```

Tunable env vars (all optional):

| Var | Default | Meaning |
|-----|---------|---------|
| `NUM_TEAMS` | 120 | concurrent virtual users |
| `RAMP` | 30s | ramp-up time to full load |
| `HOLD` | 5m | steady-state duration |
| `MSGS_PER_LEVEL` | 3 | chat messages per level (LLM calls) |
| `THINK_MIN`/`THINK_MAX` | 3 / 8 | seconds of think-time between actions |

### Reading the k6 summary
- **`throttles`** — ANY value > 0 means something rate-limited you. The test
  threshold fails if this is ≥ 1.
- **`bedrock_fallbacks`** — count of "technical difficulties" responses (a model
  failed/timed out/was truncated — not necessarily a throttle).
- **`req_by_model` / `latency_by_model`** — per-model request counts and latency,
  so you can see which model is slowest / most loaded.
- **`http_req_duration{endpoint:message}`** etc. — p95 latency per endpoint.

## Step 3 — confirm WHERE any throttling happened

k6 sees throttles from the client side; this pulls the server-side truth from
CloudWatch (DynamoDB / Lambda / API GW / Bedrock):

```bash
UNIQUE_ID=dev-yourname AWS_REGION=us-west-2 node metrics.mjs 20
```

Look for:
- **DynamoDB ReadThrottleEvents / WriteThrottleEvents > 0** → table capacity
  (should be 0 with on-demand; if not, the deploy didn't pick up the billing fix).
- **Lambda Throttles > 0** → hit the account concurrency limit (default 1000;
  request an increase, or set reserved concurrency).
- **Bedrock InvocationThrottles > 0** → a model's requests-per-minute quota;
  note it's account-wide here, so cross-reference `latency_by_model` /
  `req_by_model` from k6 to guess which model. Request a quota increase for that
  model in Service Quotas.

> Note: Lambda / API GW / Bedrock metrics are account-wide (no per-function
> dimension), so run against a **dedicated test account/stack** for clean
> numbers, or account for other traffic.

## Cleanup

The test creates lots of USER/MESSAGE/COORDINATE items and incurs **real
Bedrock cost**. When done, destroy the stack (or clear the table):

```bash
source .env && yarn cdk destroy
```

## Cost warning

A full 120-user run sends thousands of Bedrock Converse calls (incl. Claude
Sonnet 4.6 on the final level). Keep `HOLD` short and `MSGS_PER_LEVEL` low for
cheaper smoke runs; scale up only for the real capacity test.
