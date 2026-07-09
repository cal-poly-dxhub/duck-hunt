#!/usr/bin/env node
/**
 * Post-run CloudWatch metrics puller. Answers "did it throttle, and WHERE?"
 * by pulling throttle/error/concurrency metrics for the window you ran the
 * load test in, across DynamoDB, Lambda, API Gateway, and Bedrock.
 *
 * Usage:
 *   UNIQUE_ID=dev-sshreyy AWS_REGION=us-west-2 node loadtest/metrics.mjs [minutesBack]
 *
 * minutesBack defaults to 20 (covers a typical run + ramp/cooldown).
 */
import {
  CloudWatchClient,
  GetMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";

const REGION = process.env.AWS_REGION || "us-west-2";
const UNIQUE_ID = process.env.UNIQUE_ID;
const MINUTES_BACK = parseInt(process.argv[2] || "20", 10);

if (!UNIQUE_ID) {
  console.error("ERROR: UNIQUE_ID env var is required.");
  process.exit(1);
}

const cw = new CloudWatchClient({ region: REGION });
const TABLE = `ScavengerHuntData-${UNIQUE_ID}`;
const now = new Date();
const start = new Date(now.getTime() - MINUTES_BACK * 60 * 1000);

// The 3 Bedrock-invoking lambdas share function-name prefixes; we match by the
// logical id fragment CDK uses. We query Lambda metrics by a wildcard-ish
// approach using the known log-group-derived names is not possible via metrics,
// so we pull the AWS/Lambda account-wide throttles too.
const queries = [
  // ---- DynamoDB: throttling is the #1 suspect ----
  metric("ddb_read_throttle", "AWS/DynamoDB", "ReadThrottleEvents", "Sum", [
    { Name: "TableName", Value: TABLE },
  ]),
  metric("ddb_write_throttle", "AWS/DynamoDB", "WriteThrottleEvents", "Sum", [
    { Name: "TableName", Value: TABLE },
  ]),
  metric(
    "ddb_throttled_requests",
    "AWS/DynamoDB",
    "ThrottledRequests",
    "Sum",
    [{ Name: "TableName", Value: TABLE }]
  ),
  metric("ddb_consumed_read", "AWS/DynamoDB", "ConsumedReadCapacityUnits", "Sum", [
    { Name: "TableName", Value: TABLE },
  ]),
  metric(
    "ddb_consumed_write",
    "AWS/DynamoDB",
    "ConsumedWriteCapacityUnits",
    "Sum",
    [{ Name: "TableName", Value: TABLE }]
  ),

  // ---- Lambda: account-wide throttles + concurrency (no dimension filter,
  // so this reflects the whole account; scope to a test account for accuracy) ----
  metric("lambda_throttles", "AWS/Lambda", "Throttles", "Sum", []),
  metric("lambda_errors", "AWS/Lambda", "Errors", "Sum", []),
  metric(
    "lambda_concurrent",
    "AWS/Lambda",
    "ConcurrentExecutions",
    "Maximum",
    []
  ),

  // ---- API Gateway ----
  metric("apigw_5xx", "AWS/ApiGateway", "5XXError", "Sum", []),
  metric("apigw_4xx", "AWS/ApiGateway", "4XXError", "Sum", []),
  metric("apigw_count", "AWS/ApiGateway", "Count", "Sum", []),

  // ---- Bedrock: invocation throttles (account-wide across models) ----
  metric(
    "bedrock_throttles",
    "AWS/Bedrock",
    "InvocationThrottles",
    "Sum",
    []
  ),
  metric("bedrock_invocations", "AWS/Bedrock", "Invocations", "Sum", []),
  metric(
    "bedrock_client_errors",
    "AWS/Bedrock",
    "InvocationClientErrors",
    "Sum",
    []
  ),
];

function metric(id, namespace, metricName, stat, dimensions) {
  return {
    Id: id,
    MetricStat: {
      Metric: { Namespace: namespace, MetricName: metricName, Dimensions: dimensions },
      Period: 60,
      Stat: stat,
    },
    ReturnData: true,
  };
}

function sum(values) {
  return (values || []).reduce((a, b) => a + b, 0);
}
function max(values) {
  return (values || []).length ? Math.max(...values) : 0;
}

async function main() {
  const res = await cw.send(
    new GetMetricDataCommand({
      StartTime: start,
      EndTime: now,
      ScanBy: "TimestampDescending",
      MetricDataQueries: queries,
    })
  );

  const byId = {};
  for (const r of res.MetricDataResults || []) byId[r.Id] = r.Values || [];

  const line = (label, val, warn) =>
    `  ${warn && val > 0 ? "⚠️ " : "   "}${label.padEnd(30)} ${val}`;

  console.log(`\n===== Load-test metrics (last ${MINUTES_BACK} min) =====`);
  console.log(`Table: ${TABLE} | Region: ${REGION}\n`);

  console.log("DynamoDB:");
  console.log(line("ReadThrottleEvents", sum(byId.ddb_read_throttle), true));
  console.log(line("WriteThrottleEvents", sum(byId.ddb_write_throttle), true));
  console.log(line("ThrottledRequests", sum(byId.ddb_throttled_requests), true));
  console.log(line("ConsumedRead (total)", Math.round(sum(byId.ddb_consumed_read))));
  console.log(line("ConsumedWrite (total)", Math.round(sum(byId.ddb_consumed_write))));

  console.log("\nLambda (account-wide):");
  console.log(line("Throttles", sum(byId.lambda_throttles), true));
  console.log(line("Errors", sum(byId.lambda_errors), true));
  console.log(line("Max ConcurrentExecutions", max(byId.lambda_concurrent)));

  console.log("\nAPI Gateway (account-wide):");
  console.log(line("Count", sum(byId.apigw_count)));
  console.log(line("4XXError", sum(byId.apigw_4xx), true));
  console.log(line("5XXError", sum(byId.apigw_5xx), true));

  console.log("\nBedrock (account-wide):");
  console.log(line("Invocations", sum(byId.bedrock_invocations)));
  console.log(line("InvocationThrottles", sum(byId.bedrock_throttles), true));
  console.log(line("InvocationClientErrors", sum(byId.bedrock_client_errors), true));

  const throttled =
    sum(byId.ddb_read_throttle) +
    sum(byId.ddb_write_throttle) +
    sum(byId.ddb_throttled_requests) +
    sum(byId.lambda_throttles) +
    sum(byId.bedrock_throttles);
  console.log(
    `\n${throttled > 0 ? "⚠️  THROTTLING DETECTED" : "✅ No throttling detected"} (total throttle events: ${throttled})\n`
  );
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
