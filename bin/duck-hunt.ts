#!/opt/homebrew/opt/node/bin/node
import * as cdk from "aws-cdk-lib";
import "dotenv/config";
import { DuckHuntStack } from "../lib/duck-hunt-stack";

export interface DuckHuntStackProps extends cdk.StackProps {
  uniqueId: string;
}

if (!process.env.UNIQUE_ID) {
  throw Error("UNIQUE_ID must be set in the environment");
}

const app = new cdk.App();

new DuckHuntStack(app, `DuckHuntStack-${process.env.UNIQUE_ID}`, {
  uniqueId: process.env.UNIQUE_ID,
} as DuckHuntStackProps);
