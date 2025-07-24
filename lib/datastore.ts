import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

export interface DatastoreResourcesProps {
  uniqueId: string;
  removalPolicy?: cdk.RemovalPolicy; // defaults to DESTROY
}

export class DatastoreResources extends Construct {
  public readonly scavengerHuntTable: dynamodb.Table;
  public readonly photoBucket: cdk.aws_s3.Bucket;

  constructor(scope: Construct, id: string, props: DatastoreResourcesProps) {
    super(scope, id);

    // DynamoDB Table for Scavenger Hunt Data
    this.scavengerHuntTable = new dynamodb.Table(
      this,
      `ScavengerHuntData-${props.uniqueId}`,
      {
        partitionKey: {
          name: "PK",
          type: dynamodb.AttributeType.STRING,
        },
        sortKey: {
          name: "SK",
          type: dynamodb.AttributeType.STRING,
        },
        removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.DESTROY,
        timeToLiveAttribute: "deleted_at", // enable soft delete
        tableName: `ScavengerHuntData-${props.uniqueId}`,
      }
    );

    // Define Global Secondary Indexes (GSIs)
    // GSI1: Primarily for lookups where GSI1PK (e.g., LEVEL#) is the partition key
    this.scavengerHuntTable.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: {
        name: "GSI1PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "GSI1SK",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI2: For other common access patterns not covered by PK/SK or GSI1
    this.scavengerHuntTable.addGlobalSecondaryIndex({
      indexName: "GSI2",
      partitionKey: {
        name: "GSI2PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "GSI2SK",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI3: For yet another set of access patterns
    this.scavengerHuntTable.addGlobalSecondaryIndex({
      indexName: "GSI3",
      partitionKey: {
        name: "GSI3PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "GSI3SK",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // S3 Bucket for Photos
    this.photoBucket = new cdk.aws_s3.Bucket(
      this,
      `PhotoBucket-${props.uniqueId}`,
      {
        removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
        bucketName: `photo-bucket-${props.uniqueId}`,
      }
    );
  }
}
