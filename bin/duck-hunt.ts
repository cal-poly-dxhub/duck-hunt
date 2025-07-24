#!/opt/homebrew/opt/node/bin/node
import * as cdk from "aws-cdk-lib";
import { DuckHuntStack } from "../lib/duck-hunt-stack";

export interface DuckHuntStackProps extends cdk.StackProps {
  uniqueId: string;
}

const uniqueId = process.env.UNIQUE_ID || "prod-1";

const app = new cdk.App();

new DuckHuntStack(app, `DuckHuntStack-${uniqueId}`, {
  uniqueId,
} as DuckHuntStackProps);
