import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export interface PublicApiResourcesProps {
  uniqueId: string;
  removalPolicy?: cdk.RemovalPolicy;
  scavengerHuntTable: cdk.aws_dynamodb.Table;
  photoBucket: cdk.aws_s3.Bucket;
  promptBucket: cdk.aws_s3.Bucket;
}

export class PublicApiResources extends Construct {
  public readonly publicApi: cdk.aws_apigateway.RestApi;

  constructor(scope: Construct, id: string, props: PublicApiResourcesProps) {
    super(scope, id);

    // reference stack if needed
    const stack = cdk.Stack.of(this);

    // api
    this.publicApi = new cdk.aws_apigateway.RestApi(this, "PublicApi", {
      description: "API for frontend public requests",
      deployOptions: {
        stageName: "prod",
        loggingLevel: cdk.aws_apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        // TODO: restrict in production
        allowOrigins: cdk.aws_apigateway.Cors.ALL_ORIGINS,
        allowMethods: cdk.aws_apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          ...cdk.aws_apigateway.Cors.DEFAULT_HEADERS,
          "user-id",
          "team-id",
        ],
      },
    });

    // /api/public resource
    const apiResource = this.publicApi.root
      .addResource("api")
      .addResource("public");

    // /api/public/message resource
    const messageResource = apiResource.addResource("message");
    const messageLambdaIntegration = new cdk.aws_apigateway.LambdaIntegration(
      new cdk.aws_lambda.Function(this, "MessageLambda", {
        runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
        code: cdk.aws_lambda.Code.fromAsset("lambda/dist/api/public"),
        handler: "message.handler",
        environment: {
          SCAVENGER_HUNT_TABLE: props.scavengerHuntTable.tableName,
          PROMPT_BUCKET: props.promptBucket.bucketName,
        },
        logGroup: new cdk.aws_logs.LogGroup(this, "MessageLogGroup", {
          logGroupName: `/aws/lambda/${stack.stackName}-MessageLambda`,
          retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
          removalPolicy: props.removalPolicy || cdk.RemovalPolicy.DESTROY,
        }),
      })
    );
    messageResource.addMethod("POST", messageLambdaIntegration);

    // /api/public/level resource
    const levelResource = apiResource.addResource("level");
    const levelLambdaIntegration = new cdk.aws_apigateway.LambdaIntegration(
      new cdk.aws_lambda.Function(this, "LevelLambda", {
        runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
        code: cdk.aws_lambda.Code.fromAsset("lambda/dist/api/public"),
        handler: "level.handler",
        environment: {
          SCAVENGER_HUNT_TABLE: props.scavengerHuntTable.tableName,
          PROMPT_BUCKET: props.promptBucket.bucketName,
        },
        logGroup: new cdk.aws_logs.LogGroup(this, "LevelLogGroup", {
          logGroupName: `/aws/lambda/${stack.stackName}-LevelLambda`,
          retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
          removalPolicy: props.removalPolicy || cdk.RemovalPolicy.DESTROY,
        }),
      })
    );
    levelResource.addMethod("POST", levelLambdaIntegration);

    // /api/public/clear-chat resource
    const clearChatResource = apiResource.addResource("clear-chat");
    const clearChatLambdaIntegration = new cdk.aws_apigateway.LambdaIntegration(
      new cdk.aws_lambda.Function(this, "ClearChatLambda", {
        runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
        code: cdk.aws_lambda.Code.fromAsset("lambda/dist/api/public"),
        handler: "clearChat.handler",
        environment: {
          SCAVENGER_HUNT_TABLE: props.scavengerHuntTable.tableName,
          PROMPT_BUCKET: props.promptBucket.bucketName,
        },
        logGroup: new cdk.aws_logs.LogGroup(this, "ClearChatLogGroup", {
          logGroupName: `/aws/lambda/${stack.stackName}-ClearChatLambda`,
          retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
          removalPolicy: props.removalPolicy || cdk.RemovalPolicy.DESTROY,
        }),
      })
    );
    clearChatResource.addMethod("POST", clearChatLambdaIntegration);

    // /api/public/ping-coordinates resource
    const pingCoordinatesResource = apiResource.addResource("ping-coordinates");
    const pingCoordinatesLambdaIntegration =
      new cdk.aws_apigateway.LambdaIntegration(
        new cdk.aws_lambda.Function(this, "PingCoordinatesLambda", {
          runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
          code: cdk.aws_lambda.Code.fromAsset("lambda/dist/api/public"),
          handler: "pingCoordinates.handler",
          environment: {
            SCAVENGER_HUNT_TABLE: props.scavengerHuntTable.tableName,
          },
          logGroup: new cdk.aws_logs.LogGroup(this, "PingCoordinatesLogGroup", {
            logGroupName: `/aws/lambda/${stack.stackName}-PingCoordinatesLambda`,
            retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
            removalPolicy: props.removalPolicy || cdk.RemovalPolicy.DESTROY,
          }),
        })
      );
    pingCoordinatesResource.addMethod("POST", pingCoordinatesLambdaIntegration);

    // /api/public/upload-photo resource
    // const uploadPhotoResource = apiResource.addResource("upload-photo");
    // const uploadPhotoLambdaIntegration = new cdk.aws_apigateway.LambdaIntegration(
    //   new cdk.aws_lambda.Function(this, "UploadPhotoLambda", {
    //     runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
    //     code: cdk.aws_lambda.Code.fromAsset("lambda/dist/api/public"),
    //     handler: "uploadPhoto.handler",
    //     environment: {
    //       SCAVENGER_HUNT_TABLE: props.scavengerHuntTable.tableName,
    //       PHOTO_BUCKET: props.photoBucket.bucketName,
    //     },
    //   })
    // );
    // uploadPhotoResource.addMethod("POST", uploadPhotoLambdaIntegration);
  }
}
