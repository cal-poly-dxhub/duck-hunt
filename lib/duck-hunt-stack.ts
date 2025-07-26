import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { DuckHuntStackProps } from "../bin/duck-hunt";
import { ApiResources } from "./api";
import { DatastoreResources } from "./datastore";
import { FrontendResources } from "./frontend";
import { GameResources } from "./game";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

const REMOVAL_POLICY = cdk.RemovalPolicy.DESTROY;

export class DuckHuntStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DuckHuntStackProps) {
    super(scope, id, props);

    const { uniqueId } = props;

    // ------------ database ------------
    const datastoreResources = new DatastoreResources(
      this,
      "DatastoreResources",
      {
        uniqueId,
      }
    );

    // ------------ public api resources ------------
    const apiResources = new ApiResources(this, "PublicApiResources", {
      uniqueId,
      removalPolicy: REMOVAL_POLICY,
      duckHuntTable: datastoreResources.duckHuntTable,
      photoBucket: datastoreResources.photoBucket,
    });

    // ------------ frontend resources ------------
    const frontendResources = new FrontendResources(this, "FrontendResources", {
      uniqueId,
      removalPolicy: REMOVAL_POLICY,
      api: apiResources.api,
      photoBucket: datastoreResources.photoBucket,
    });

    // ------------ game resources ------------
    const gameResources = new GameResources(this, "GameResources", {
      uniqueId,
      removalPolicy: REMOVAL_POLICY,
      duckHuntTable: datastoreResources.duckHuntTable,
      frontendDistribution: frontendResources.distribution,
    });

    // ------------ outputs ------------
    new cdk.CfnOutput(this, "PublicApiUrl", {
      value: apiResources.api.url,
      description: "The URL of the public API",
      exportName: `PublicApiUrl-${uniqueId}`,
    });

    new cdk.CfnOutput(this, "FrontendDistributionDomain", {
      value: frontendResources.distribution.distributionDomainName,
      description: "The domain name of the frontend distribution",
      exportName: `FrontendDistributionDomainUrl-${uniqueId}`,
    });
  }
}
