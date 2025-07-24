import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export interface GameResourcesProps {
  uniqueId: string;
  removalPolicy?: cdk.RemovalPolicy; // defaults to DESTROY
  duckHuntTable: cdk.aws_dynamodb.Table;
}

export class GameResources extends Construct {
  public readonly gameConfigBucket: cdk.aws_s3.Bucket;

  constructor(scope: Construct, id: string, props: GameResourcesProps) {
    super(scope, id);

    // s3 bucket for game configs
    this.gameConfigBucket = new cdk.aws_s3.Bucket(
      this,
      `DuckHuntGameConfigBucket-${props.uniqueId}`,
      {
        bucketName: `game-config-${props.uniqueId}`,
        removalPolicy: props.removalPolicy || cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
        cors: [
          {
            allowedMethods: [cdk.aws_s3.HttpMethods.GET],
            allowedOrigins: ["*"],
            allowedHeaders: ["*"],
          },
        ],
      }
    );

    // lambda to create game from game config
    const createGameLambda = new cdk.aws_lambda_nodejs.NodejsFunction(
      this,
      `CreateGameLambda-${props.uniqueId}`,
      {
        runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
        entry: "./lambda/src/createGame.ts",
        timeout: cdk.Duration.seconds(30),
        environment: {
          DUCK_HUNT_TABLE_NAME: props.duckHuntTable.tableName,
          GAME_CONFIG_BUCKET_NAME: this.gameConfigBucket.bucketName,
        },
        logGroup: new cdk.aws_logs.LogGroup(this, "CreateGameLambdaLogGroup", {
          logGroupName: `CreateGameLambdaLogGroup-${props.uniqueId}`,
          retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
          removalPolicy: props.removalPolicy || cdk.RemovalPolicy.DESTROY,
        }),
      }
    );

    // Grant permissions
    props.duckHuntTable.grantReadWriteData(createGameLambda);
    this.gameConfigBucket.grantRead(createGameLambda);

    // s3 trigger for lambda
    const s3Trigger = new cdk.aws_s3_notifications.LambdaDestination(
      createGameLambda
    );

    this.gameConfigBucket.addEventNotification(
      cdk.aws_s3.EventType.OBJECT_CREATED,
      s3Trigger
    );
  }
}
