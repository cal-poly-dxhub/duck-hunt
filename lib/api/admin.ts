import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export interface PublicApiResourcesProps {}

export class PublicApiResources extends Construct {
  public readonly publicApi: cdk.aws_apigateway.RestApi;

  constructor(
    scope: Construct,
    id: string,
    props: PublicApiResourcesProps = {}
  ) {
    super(scope, id);

    // reference stack
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
  }
}
