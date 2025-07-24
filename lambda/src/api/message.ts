import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { invokeBedrock, InvokeBedrockProps } from "../invokeBedrock";
import { validateUUID } from "@shared/scripts";
import {
  corsHeaders,
  MessageRequestBody,
  MessageResponseBody,
  MessageRole,
  RequestHeaders,
  ResponseError,
} from "@shared/types";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

const s3Client = new S3Client({});
const dynamoClient = new DynamoDBClient({});

/**
 * /message lambda handler
 * Handles incoming messages from users, validates headers, and returns a response.
 * If the user has not sent a message before, it returns a hardcoded assistant message.
 * If the user has sent messages, it processes the latest message and returns a response.
 * Checks the time since the user started the level and provides hint/map link if necessary.
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
    // query dynamo for team's current level

    // check how long since they started the level
    // if >10 min, return easy hint
    // if >15 min, return maps link

    // query dynamo for user's messages at this level

    // if latest message is from user, remove from message history
    // if messages do not alternate roles, fix

    const requestBody: MessageRequestBody = JSON.parse(event.body || "{}");
    if (!requestBody.message || !requestBody.message.content) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "Invalid request body.",
          displayMessage: "Please provide a valid message.",
          details: "Message content is required.",
        } as ResponseError),
      };
    }

    // build prompt from s3
    // invoke bedrock with prompt and user's (current level, not deleted) message history

    // process bedrock response
    // save response message to dynamo

    // TODO: replace with actual message history
    const STUBMessageHistory = [
      {
        id: 0,
        role: MessageRole.User,
        content: "Hello. Introduce yourself and your job.",
        createdAt: new Date(),
      },
      {
        id: 1,
        role: MessageRole.Assistant,
        content: "Hello, I am an assistant for duck hunt.",
        createdAt: new Date(),
      },
    ];

    const invokeBedrockProps: InvokeBedrockProps = {
      levelId: "00000000-0000-0000-0000-000000000000", // get from dyanmo
      messageHistory: STUBMessageHistory,
    };
    const { bedrockResponseMessage, bedrockFailed } = await invokeBedrock(
      invokeBedrockProps
    );

    if (bedrockFailed) {
      console.error("Bedrock failed");
      // TODO: handle bedrock failed?
    }

    // stub response
    const responseBody: MessageResponseBody = {
      message: bedrockResponseMessage,
      mapLink: null,
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
            : "Error caught in message lambda top level catch",
      } as ResponseError),
    };
  }
};
