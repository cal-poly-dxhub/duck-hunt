import * as cdk from "aws-cdk-lib";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import { bedrockConfig, levelModels } from "../shared/src/config";

export interface ApiResourcesProps {
  uniqueId: string;
  removalPolicy?: cdk.RemovalPolicy;
  duckHuntTable: cdk.aws_dynamodb.Table;
  photoBucket: cdk.aws_s3.Bucket;
}

// Region-prefixed ids (us.*, eu.*, ...) are cross-region inference profiles, not plain models.
const INFERENCE_PROFILE_PREFIX = /^(us|eu|apac|jp|au|ca|sa|global)\./;

/**
 * Least-privilege resources for bedrock:InvokeModel: exactly the models in
 * levelModels plus the fallback. A cross-region inference profile needs both the
 * profile ARN and the underlying foundation model in every destination region.
 */
const bedrockModelArns = (stack: cdk.Stack): string[] => {
  const modelIds = Array.from(
    new Set<string>([...levelModels, bedrockConfig.fallbackModelId])
  );

  return modelIds.flatMap((modelId) =>
    INFERENCE_PROFILE_PREFIX.test(modelId)
      ? [
          `arn:${cdk.Aws.PARTITION}:bedrock:${stack.region}:${stack.account}:inference-profile/${modelId}`,
          `arn:${cdk.Aws.PARTITION}:bedrock:*::foundation-model/${modelId.replace(
            INFERENCE_PROFILE_PREFIX,
            ""
          )}`,
        ]
      : [
          `arn:${cdk.Aws.PARTITION}:bedrock:${stack.region}::foundation-model/${modelId}`,
        ]
  );
};

export class ApiResources extends Construct {
  public readonly api: cdk.aws_apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiResourcesProps) {
    super(scope, id);

    // reference stack if needed
    const stack = cdk.Stack.of(this);

    // Only the models in levelModels — see bedrockModelArns.
    const bedrockArns = bedrockModelArns(stack);

    // Env vars shared by the API Lambdas.
    const lambdaEnv = {
      DUCK_HUNT_TABLE_NAME: props.duckHuntTable.tableName,
    };

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
        forceDockerBundling: false,
      },
      timeout: cdk.Duration.seconds(30),
      environment: lambdaEnv,
      logGroup: new cdk.aws_logs.LogGroup(this, "MessageLogGroup", {
        logGroupName: `MessageLambdaLogGroup-${props.uniqueId}`,
        retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
        removalPolicy: props.removalPolicy || cdk.RemovalPolicy.DESTROY,
      }),
    });
    props.duckHuntTable.grantReadWriteData(messageLambda);
    messageLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: bedrockArns,
      }),
    );
    const messageLambdaIntegration = new cdk.aws_apigateway.LambdaIntegration(
      messageLambda,
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
        forceDockerBundling: false,
      },
      timeout: cdk.Duration.seconds(30),
      environment: lambdaEnv,
      logGroup: new cdk.aws_logs.LogGroup(this, "LevelLogGroup", {
        logGroupName: `LevelLambdaLogGroup-${props.uniqueId}`,
        retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
        removalPolicy: props.removalPolicy || cdk.RemovalPolicy.DESTROY,
      }),
    });
    props.duckHuntTable.grantReadWriteData(levelLambda);
    levelLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: bedrockArns,
      }),
    );
    const levelLambdaIntegration = new cdk.aws_apigateway.LambdaIntegration(
      levelLambda,
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
        forceDockerBundling: false,
      },
      timeout: cdk.Duration.seconds(30),
      environment: lambdaEnv,
      logGroup: new cdk.aws_logs.LogGroup(this, "ClearChatLogGroup", {
        logGroupName: `ClearChatLambdaLogGroup-${props.uniqueId}`,
        retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
        removalPolicy: props.removalPolicy || cdk.RemovalPolicy.DESTROY,
      }),
    });
    props.duckHuntTable.grantReadWriteData(clearChatLambda);
    clearChatLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: bedrockArns,
      }),
    );
    const clearChatLambdaIntegration = new cdk.aws_apigateway.LambdaIntegration(
      clearChatLambda,
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
          forceDockerBundling: false,
        },
        environment: {
          DUCK_HUNT_TABLE_NAME: props.duckHuntTable.tableName,
        },
        logGroup: new cdk.aws_logs.LogGroup(this, "PingCoordinatesLogGroup", {
          logGroupName: `PingCoordinatesLambdaLogGroup-${props.uniqueId}`,
          retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
          removalPolicy: props.removalPolicy || cdk.RemovalPolicy.DESTROY,
        }),
      },
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
        forceDockerBundling: false,
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
