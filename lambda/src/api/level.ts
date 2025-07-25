import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import {
  corsHeaders,
  LevelResponseBody,
  MessageRole,
  RequestHeaders,
  ResponseError,
  UUID,
} from "@shared/types";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { invokeBedrockPersistToDynamo } from "src/invokeBedrock";
import { v4 } from "uuid";
import { fetchBaseData } from "./fetchBaseData";

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
  try {
    const { currentLevel, gameId, currentTeamLevel, userMessages } =
      await fetchBaseData(headers);

    // TODO: acual level logic

    // query dynamo for team's current level
    // if id matches a previous level, return nothing
    // if id matches current level, advance to next level
    // if id matches future level, return error

    // query dynamo for user's messages at this level

    // if latest message is from user, remove from message history
    // if messages do not alternate roles, fix

    if (userMessages.length > 0) {
      const responseBody: LevelResponseBody = {
        currentLevel: crypto.randomUUID(),
        messageHistory: userMessages,
        requiresPhoto: true,
      };

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(responseBody),
      };
    }

    const newUserMessage = {
      id: v4() as UUID,
      role: MessageRole.User as MessageRole.User,
      content: "Hello. Introduce yourself and your job.",
      createdAt: new Date(),
    };

    const { bedrockResponseMessage } = await invokeBedrockPersistToDynamo({
      gameId: gameId,
      levelId: currentLevel.id as UUID,
      userId: headers["user-id"] as UUID,
      teamId: headers["team-id"] as UUID,
      newUserMessage,
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        messageHistory: [newUserMessage, bedrockResponseMessage],
        currentLevel: currentLevel.id as UUID,
        requiresPhoto: false,
      } as LevelResponseBody),
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
            : "Error caught in level lambda top level catch",
      } as ResponseError),
    };
  }
};
