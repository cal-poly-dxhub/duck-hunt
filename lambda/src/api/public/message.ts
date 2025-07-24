import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import {
  corsHeaders,
  Message,
  MessageRole,
  ResponseError,
} from "@shared/types";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

// request headers schema
interface RequestHeaders {
  "Content-Type": string;
  "user-id": string;
  "team-id": string;
}

// request body schema
interface RequestBody {
  message: Message<MessageRole.User>;
}

// response body schema
interface ResponseBody {
  message: Message<MessageRole.Assistant>;
  mapLink: string | null;
}

const s3Client = new S3Client({});
const dynamoClient = new DynamoDBClient({});

/**
 * /message lambda handler
 * Handles incoming messages from users, validates headers, and returns a response.
 * @param event
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log("INFO: Received event:", JSON.stringify(event, null, 2));

  // validate request headers
  const headers = event.headers as unknown as RequestHeaders;
  if (!headers["user-id"]) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Missing user-id header.",
        displayMessage: "No valid user ID provided. Contact support.",
        details: "No user ID provided in request headers.",
      } as ResponseError),
    };
  } else if (!headers["team-id"]) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Missing team-id header.",
        displayMessage:
          "No valid team ID provided. Try scanning your team duck.",
        details: "No team ID provided in request headers.",
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

    const requestBody: RequestBody = JSON.parse(event.body || "{}");
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

    // stub response
    const responseBody: ResponseBody = {
      message: {
        role: MessageRole.Assistant,
        content:
          "This is a stub response for /message endpoint. You said: " +
          requestBody.message.content,
      },
      mapLink: null,
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(responseBody),
    };
  } catch (error) {
    console.error("ERROR: Failed to generate presigned URL:", error);
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
