import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export interface ApiResourcesProps {
  uniqueId: string;
  removalPolicy?: cdk.RemovalPolicy;
  duckHuntTable: cdk.aws_dynamodb.Table;
  photoBucket: cdk.aws_s3.Bucket;
}

export class ApiResources extends Construct {
  public readonly api: cdk.aws_apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiResourcesProps) {
    super(scope, id);

    // reference stack if needed
    const stack = cdk.Stack.of(this);

    // api
    this.api = new cdk.aws_apigateway.RestApi(this, "PublicApi", {
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

    // /api resource
    const apiResource = this.api.root.addResource("api");

    // /api/message resource
    const messageResource = apiResource.addResource("message");
    const messageLambdaIntegration = new cdk.aws_apigateway.LambdaIntegration(
      new cdk.aws_lambda.Function(this, "MessageLambda", {
        runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
        code: cdk.aws_lambda.Code.fromAsset("lambda/dist/api"),
        handler: "message.handler",
        environment: {
          DUCK_HUNT_TABLE_NAME: props.duckHuntTable.tableName,
        },
        logGroup: new cdk.aws_logs.LogGroup(this, "MessageLogGroup", {
          logGroupName: `MessageLambdaLogGroup-${props.uniqueId}`,
          retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
          removalPolicy: props.removalPolicy || cdk.RemovalPolicy.DESTROY,
        }),
      })
    );
    messageResource.addMethod("POST", messageLambdaIntegration);

    // /api/level resource
    const levelResource = apiResource.addResource("level");
    const levelLambdaIntegration = new cdk.aws_apigateway.LambdaIntegration(
      new cdk.aws_lambda.Function(this, "LevelLambda", {
        runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
        code: cdk.aws_lambda.Code.fromAsset("lambda/dist/api"),
        handler: "level.handler",
        environment: {
          DUCK_HUNT_TABLE_NAME: props.duckHuntTable.tableName,
        },
        logGroup: new cdk.aws_logs.LogGroup(this, "LevelLogGroup", {
          logGroupName: `LevelLambdaLogGroup-${props.uniqueId}`,
          retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
          removalPolicy: props.removalPolicy || cdk.RemovalPolicy.DESTROY,
        }),
      })
    );
    levelResource.addMethod("POST", levelLambdaIntegration);

    // /api/clear-chat resource
    const clearChatResource = apiResource.addResource("clear-chat");
    const clearChatLambdaIntegration = new cdk.aws_apigateway.LambdaIntegration(
      new cdk.aws_lambda.Function(this, "ClearChatLambda", {
        runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
        code: cdk.aws_lambda.Code.fromAsset("lambda/dist/api"),
        handler: "clearChat.handler",
        environment: {
          DUCK_HUNT_TABLE_NAME: props.duckHuntTable.tableName,
        },
        logGroup: new cdk.aws_logs.LogGroup(this, "ClearChatLogGroup", {
          logGroupName: `ClearChatLambdaLogGroup-${props.uniqueId}`,
          retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
          removalPolicy: props.removalPolicy || cdk.RemovalPolicy.DESTROY,
        }),
      })
    );
    clearChatResource.addMethod("POST", clearChatLambdaIntegration);

    // /api/ping-coordinates resource
    const pingCoordinatesResource = apiResource.addResource("ping-coordinates");
    const pingCoordinatesLambdaIntegration =
      new cdk.aws_apigateway.LambdaIntegration(
        new cdk.aws_lambda.Function(this, "PingCoordinatesLambda", {
          runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
          code: cdk.aws_lambda.Code.fromAsset("lambda/dist/api"),
          handler: "pingCoordinates.handler",
          environment: {
            DUCK_HUNT_TABLE_NAME: props.duckHuntTable.tableName,
          },
          logGroup: new cdk.aws_logs.LogGroup(this, "PingCoordinatesLogGroup", {
            logGroupName: `PingCoordinatesLambdaLogGroup-${props.uniqueId}`,
            retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
            removalPolicy: props.removalPolicy || cdk.RemovalPolicy.DESTROY,
          }),
        })
      );
    pingCoordinatesResource.addMethod("POST", pingCoordinatesLambdaIntegration);

    // /api/upload-photo resource
    // const uploadPhotoResource = apiResource.addResource("upload-photo");
    // const uploadPhotoLambdaIntegration = new cdk.aws_apigateway.LambdaIntegration(
    //   new cdk.aws_lambda.Function(this, "UploadPhotoLambda", {
    //     runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
    //     code: cdk.aws_lambda.Code.fromAsset("lambda/dist/api"),
    //     handler: "uploadPhoto.handler",
    //     environment: {
    //       DUCK_HUNT_TABLE_NAME: props.duckHuntTable.tableName,
    //       PHOTO_BUCKET: props.photoBucket.bucketName,
    //     },
    //   })
    // );
    // uploadPhotoResource.addMethod("POST", uploadPhotoLambdaIntegration);
  }
}
