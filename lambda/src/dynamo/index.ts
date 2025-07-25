import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

// Environment variable for table name
export const DUCK_HUNT_TABLE_NAME = process.env.DUCK_HUNT_TABLE_NAME;

// Initialize DynamoDB client
export const client = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(client);

// Utility functions
export const getCurrentTimestamp = (): string => new Date().toISOString();
export const getEpochTimestamp = (): number => Math.floor(Date.now() / 1000);

export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
  deleted_at?: number;
}
