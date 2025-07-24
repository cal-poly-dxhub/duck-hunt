import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export interface PublicApiResourcesProps {
  uniqueId: string;
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
    this.publicApi = new cdk.aws_apigateway.RestApi(this, "MeetingAuthApi", {
      description: "API for video authentication",
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
      },
    });

    // /api/public resource
    const apiResource = this.publicApi.root
      .addResource("api")
      .addResource("public");

    // /api/public resource
    const messageResource = apiResource.addResource("message");
    const messageLambdaIntegration = new cdk.aws_apigateway.LambdaIntegration(
      new cdk.aws_lambda.Function(this, "MessageLambda", {
        runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
        code: cdk.aws_lambda.Code.fromAsset("lambda/dist/api/public"),
        handler: "message.handler",
        environment: {
          SCAVENGER_HUNT_TABLE: props.scavengerHuntTable.tableName,
          PHOTO_BUCKET: props.photoBucket.bucketName,
          PROMPT_BUCKET: props.promptBucket.bucketName,
        },
      })
    );
    messageResource.addMethod("POST", messageLambdaIntegration);
  }
}
