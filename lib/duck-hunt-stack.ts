import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { DuckHuntStackProps } from "../bin/duck-hunt";
import { AdminApiResources } from "./api/admin";
import { PublicApiResources } from "./api/public";
import { DatastoreResources } from "./datastore";
import { FrontendResources } from "./frontend";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

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
    const publicApiResources = new PublicApiResources(
      this,
      "PublicApiResources",
      {
        uniqueId,
        scavengerHuntTable: datastoreResources.scavengerHuntTable,
        photoBucket: datastoreResources.photoBucket,
      }
    );

    // ------------ admin api resources ------------
    const adminApiResources = new AdminApiResources(this, "AdminApiResources", {
      uniqueId,
    });

    // ------------ frontend resources ------------
    const frontendResources = new FrontendResources(this, "FrontendResources", {
      uniqueId,
      publicApi: publicApiResources.publicApi,
      photoBucket: datastoreResources.photoBucket,
    });

    // ------------ outputs ------------
    new cdk.CfnOutput(this, "PublicApiUrl", {
      value: publicApiResources.publicApi.url,
      description: "The URL of the public API",
      exportName: `PublicApiUrl-${uniqueId}`,
    });

    new cdk.CfnOutput(this, "AdminApiUrl", {
      value: adminApiResources.adminApi.url,
      description: "The URL of the admin API",
      exportName: `AdminApiUrl-${uniqueId}`,
    });

    new cdk.CfnOutput(this, "FrontendDistributionDomain", {
      value: frontendResources.distribution.distributionDomainName,
      description: "The domain name of the frontend distribution",
      exportName: `FrontendDistributionDomainUrl-${uniqueId}`,
    });
  }
}
