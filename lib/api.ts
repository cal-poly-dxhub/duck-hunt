import * as cdk from "aws-cdk-lib";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
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
    const messageLambda = new NodejsFunction(this, "MessageLambda", {
      runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
      entry: "lambda/src/api/message.ts",
      handler: "handler",
      bundling: {
        externalModules: ["@aws-sdk/*"],
        nodeModules: [],
      },
      timeout: cdk.Duration.seconds(30),
      environment: {
        DUCK_HUNT_TABLE_NAME: props.duckHuntTable.tableName,
      },
      logGroup: new cdk.aws_logs.LogGroup(this, "MessageLogGroup", {
        logGroupName: `MessageLambdaLogGroup-${props.uniqueId}`,
        retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
        removalPolicy: props.removalPolicy || cdk.RemovalPolicy.DESTROY,
      }),
    });
    props.duckHuntTable.grantReadWriteData(messageLambda);
    messageLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:ApplyGuardrail"],
        resources: ["*"],
      })
    );
    const messageLambdaIntegration = new cdk.aws_apigateway.LambdaIntegration(
      messageLambda
    );
    messageResource.addMethod("POST", messageLambdaIntegration);

    // /api/level resource
    const levelResource = apiResource.addResource("level");
    const levelLambda = new NodejsFunction(this, "LevelLambda", {
      runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
      entry: "lambda/src/api/level.ts",
      handler: "handler",
      bundling: {
        externalModules: ["@aws-sdk/*"],
        nodeModules: [],
      },
      timeout: cdk.Duration.seconds(30),
      environment: {
        DUCK_HUNT_TABLE_NAME: props.duckHuntTable.tableName,
      },
      logGroup: new cdk.aws_logs.LogGroup(this, "LevelLogGroup", {
        logGroupName: `LevelLambdaLogGroup-${props.uniqueId}`,
        retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
        removalPolicy: props.removalPolicy || cdk.RemovalPolicy.DESTROY,
      }),
    });
    props.duckHuntTable.grantReadWriteData(levelLambda);
    levelLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:ApplyGuardrail"],
        resources: ["*"],
      })
    );
    const levelLambdaIntegration = new cdk.aws_apigateway.LambdaIntegration(
      levelLambda
    );
    levelResource.addMethod("POST", levelLambdaIntegration);

    // /api/clear-chat resource
    const clearChatResource = apiResource.addResource("clear-chat");
    const clearChatLambda = new NodejsFunction(this, "ClearChatLambda", {
      runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
      entry: "lambda/src/api/clearChat.ts",
      handler: "handler",
      bundling: {
        externalModules: ["@aws-sdk/*"],
        nodeModules: [],
      },
      timeout: cdk.Duration.seconds(30),
      environment: {
        DUCK_HUNT_TABLE_NAME: props.duckHuntTable.tableName,
      },
      logGroup: new cdk.aws_logs.LogGroup(this, "ClearChatLogGroup", {
        logGroupName: `ClearChatLambdaLogGroup-${props.uniqueId}`,
        retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
        removalPolicy: props.removalPolicy || cdk.RemovalPolicy.DESTROY,
      }),
    });
    props.duckHuntTable.grantReadWriteData(clearChatLambda);
    clearChatLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:ApplyGuardrail"],
        resources: ["*"],
      })
    );
    const clearChatLambdaIntegration = new cdk.aws_apigateway.LambdaIntegration(
      clearChatLambda
    );
    clearChatResource.addMethod("POST", clearChatLambdaIntegration);

    // /api/ping-coordinates resource
    const pingCoordinatesResource = apiResource.addResource("ping-coordinates");
    const pingCoordinatesLambda = new NodejsFunction(
      this,
      "PingCoordinatesLambda",
      {
        runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
        entry: "lambda/src/api/pingCoordinates.ts",
        handler: "handler",
        bundling: {
          externalModules: ["@aws-sdk/*"],
          nodeModules: [],
        },
        environment: {
          DUCK_HUNT_TABLE_NAME: props.duckHuntTable.tableName,
        },
        logGroup: new cdk.aws_logs.LogGroup(this, "PingCoordinatesLogGroup", {
          logGroupName: `PingCoordinatesLambdaLogGroup-${props.uniqueId}`,
          retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
          removalPolicy: props.removalPolicy || cdk.RemovalPolicy.DESTROY,
        }),
      }
    );
    props.duckHuntTable.grantReadWriteData(pingCoordinatesLambda);
    const pingCoordinatesLambdaIntegration =
      new cdk.aws_apigateway.LambdaIntegration(pingCoordinatesLambda);
    pingCoordinatesResource.addMethod("POST", pingCoordinatesLambdaIntegration);

    const uploadPhotoResource = apiResource.addResource("upload-photo");
    const uploadPhotoLambda = new NodejsFunction(this, "UploadPhotoLambda", {
      runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
      entry: "lambda/src/api/uploadPhoto.ts",
      handler: "handler",
      bundling: {
        externalModules: ["@aws-sdk/*"],
        nodeModules: [],
      },
      timeout: cdk.Duration.seconds(30),
      environment: {
        DUCK_HUNT_TABLE_NAME: props.duckHuntTable.tableName,
        PHOTO_BUCKET: props.photoBucket.bucketName,
      },
      logGroup: new cdk.aws_logs.LogGroup(this, "UploadPhotoLogGroup", {
        logGroupName: `UploadPhotoLambdaLogGroup-${props.uniqueId}`,
        retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
        removalPolicy: props.removalPolicy || cdk.RemovalPolicy.DESTROY,
      }),
    });
    props.duckHuntTable.grantReadWriteData(uploadPhotoLambda);
    props.photoBucket.grantReadWrite(uploadPhotoLambda);
    const uploadPhotoLambdaIntegration =
      new cdk.aws_apigateway.LambdaIntegration(uploadPhotoLambda);
    uploadPhotoResource.addMethod("POST", uploadPhotoLambdaIntegration);
  }
}
