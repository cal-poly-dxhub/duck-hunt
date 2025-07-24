import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { validateUUID } from "@shared/scripts";
import {
  corsHeaders,
  LevelRequestBody,
  LevelResponseBody,
  MessageRole,
  RequestHeaders,
  ResponseError,
} from "@shared/types";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

const s3Client = new S3Client({});
const dynamoClient = new DynamoDBClient({});

/**
 * /level lambda handler
 * Handles requests when user scans a level duck or refreshes their page after scanning a level duck.
 * If no messages are found for the user at the current level, handler should return hardcoded assistant message.
 * Otherwise, handler should return the not deleted message history for the user at the current level.
 * @param event
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log("INFO: Received event:", JSON.stringify(event, null, 2));

  // validate request headers
  const headers = event.headers as unknown as RequestHeaders;

  // validate headers["user-id"] and headers["team-id"]
  if (!validateUUID(headers["user-id"])) {
    console.error(
      "ERROR: Invalid user ID in request headers:",
      headers["user-id"]
    );
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Invalid user-id header.",
        displayMessage: "The provided user ID is invalid. Contact support.",
        details: `Invalid user ID: ${headers["user-id"]}`,
      } as ResponseError),
    };
  } else if (!validateUUID(headers["team-id"])) {
    console.error(
      "ERROR: Invalid team ID in request headers:",
      headers["team-id"]
    );
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Invalid team-id header.",
        displayMessage:
          "The provided team ID is invalid. Try scanning your team duck.",
        details: `Invalid team ID: ${headers["team-id"]}`,
      } as ResponseError),
    };
  }

  try {
    // query dynamo for user
    // query dynamo for team

    const requestBody: LevelRequestBody = JSON.parse(event.body || "{}");

    // query dynamo for team's current level
    // if id matches a previous level, return nothing
    // if id matches current level, advance to next level
    // if id matches future level, return error

    // query dynamo for user's messages at this level

    // if latest message is from user, remove from message history
    // if messages do not alternate roles, fix

    // stub response
    const responseBody: LevelResponseBody = {
      currentLevel: crypto.randomUUID(),
      messageHistory: [
        {
          id: 1,
          role: MessageRole.User,
          content: "Hello",
          createdAt: new Date(),
        },
        {
          id: 2,
          role: MessageRole.Assistant,
          content: `This is a stub response for submitted level: ${
            requestBody.levelId || "unknown"
          }`,
          createdAt: new Date(),
        },
      ],
      requiresPhoto: true,
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(responseBody),
    };
  } catch (error) {
    console.error("ERROR: Failed to process request:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Failed to process request",
        displayMessage: "An error occurred while processing your request.",
        details:
          error instanceof Error
            ? error.message
            : "Error caught without message in top level catch",
      } as ResponseError),
    };
  }
};
