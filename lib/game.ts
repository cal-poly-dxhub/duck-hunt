import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

export interface GameResourcesProps {
  uniqueId: string;
  removalPolicy?: cdk.RemovalPolicy; // defaults to DESTROY
}

export class GameResources extends Construct {
  constructor(scope: Construct, id: string, props: GameResourcesProps) {
    super(scope, id);

    // s3 bucket for game configs

    // lambda to create game from game config

    // s3 trigger for lambda
  }
}
