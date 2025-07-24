import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import {
  corsHeaders,
  MessageResponseBody,
  MessageRole,
  RequestHeaders,
  ResponseError,
} from "@shared/types";
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  S3Event,
} from "aws-lambda";
import { invokeBedrock, InvokeBedrockProps } from "@shared/invokeBedrock";

const s3Client = new S3Client({});
const dynamoClient = new DynamoDBClient({});

/**
 * create game lambda handler
 *
 * @param event {S3Event}
 */
export const handler = async (event: S3Event) => {
  console.log("INFO: Received event:", JSON.stringify(event, null, 2));

  try {
    return {
      statusCode: 200,
    };
  } catch (error) {
    console.error("ERROR: Failed to process request:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Failed to process request",
        displayMessage: "An error occurred while creating game from config.",
        details:
          error instanceof Error
            ? error.message
            : "Error caught in createGame lambda top level catch",
      }),
    };
  }
};
