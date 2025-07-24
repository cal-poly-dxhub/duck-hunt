import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export interface AdminApiResourcesProps {
  uniqueId: string;
}

export class AdminApiResources extends Construct {
  public readonly adminApi: cdk.aws_apigateway.RestApi;

  constructor(scope: Construct, id: string, props: AdminApiResourcesProps) {
    super(scope, id);

    // reference stack if needed
    const stack = cdk.Stack.of(this);

    // api
    this.adminApi = new cdk.aws_apigateway.RestApi(this, "MeetingAuthApi", {
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

    // /api/admin resource
    const apiResource = this.adminApi.root
      .addResource("api")
      .addResource("admin");
  }
}
