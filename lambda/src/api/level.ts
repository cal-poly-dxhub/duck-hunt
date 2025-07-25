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
import { TeamLevelOperations } from "src/dynamo/teamLevel";
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
  const eventBody = JSON.parse(event.body || "{}");

  try {
    const { currentLevel, gameId, currentTeamLevel, userMessages } =
      await fetchBaseData(headers);

    console.log(
      "INFO: Current Level:",
      currentLevel,
      "Level ID from request:",
      eventBody.levelId
    );

    if (!eventBody.levelId) {
      console.log(
        "INFO: No levelId provided in request body, returning current level data."
      );

      if (userMessages.length > 0) {
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            messageHistory: userMessages,
            currentTeamLevel: currentTeamLevel.id as UUID,
            requiresPhoto: true,
          } as LevelResponseBody),
        };
      }

      const hardcodedMessage = {
        id: v4() as UUID,
        role: MessageRole.User as MessageRole.User,
        content: "Hello. Introduce yourself and your job.",
        createdAt: new Date(),
      };

      console.log(
        "INFO: No messages found. Invoking Bedrock with hardcoded user message:",
        hardcodedMessage
      );

      const { bedrockResponseMessage } = await invokeBedrockPersistToDynamo({
        gameId: gameId as UUID,
        levelId: currentLevel.id as UUID,
        userId: headers["user-id"] as UUID,
        teamId: headers["team-id"] as UUID,
        newUserMessage: hardcodedMessage,
      });

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          messageHistory: [hardcodedMessage, bedrockResponseMessage],
          currentTeamLevel: currentTeamLevel.id as UUID,
          requiresPhoto: false,
        } as LevelResponseBody),
      };
    }

    const allTeamLevels = await TeamLevelOperations.getAllForTeam(
      headers["team-id"] as UUID
    );

    console.log("INFO: All team levels:", allTeamLevels);

    // TODO: actual level logic
    // if id matches a previous level, return nothing
    // if id matches current level, advance to next level
    // if id matches future level, return error

    const completedLevels = allTeamLevels.filter(
      (level) => level.completed_at !== null
    );

    if (completedLevels.some((level) => level.id === eventBody.levelId)) {
      console.warn(
        "WARN: Level ID already completed:",
        eventBody.levelId,
        "Completed levels:",
        completedLevels.map((level) => level.id)
      );

      return {
        statusCode: 208,
        headers: corsHeaders,
        body: JSON.stringify({
          messageHistory: userMessages,
          currentTeamLevel: currentTeamLevel.id as UUID,
          requiresPhoto: false,
        } as LevelResponseBody),
      };
    } else if (eventBody.levelId === currentLevel.id) {
      console.log(
        "INFO: Level ID matches current level, proceeding with level logic."
      );

      // mark current level as completed
      await TeamLevelOperations.markLevelAsCompleted(
        headers["team-id"] as UUID,
        currentLevel.id as UUID
      );

      console.log("INFO: Current level marked as completed:", currentLevel.id);

      const newCurrentLevel = await TeamLevelOperations.getNextLevel(
        headers["team-id"] as UUID,
        currentLevel.id as UUID
      );

      if (newCurrentLevel === null) {
        console.warn(
          "LOG: No next level found, all levels completed for team.",
          headers["team-id"]
        );

        return {
          statusCode: 202,
          headers: corsHeaders,
          body: JSON.stringify({
            messageHistory: [
              {
                id: v4() as UUID,
                role: MessageRole.Assistant,
                content: "Congratulations! You have completed the Duck Hunt!",
                createdAt: new Date(),
              },
            ],
            currentTeamLevel: currentTeamLevel.id as UUID,
            requiresPhoto: true,
          } as LevelResponseBody),
        };
      }
    }

    // if more levels to go
    if (userMessages.length > 0) {
      const responseBody: LevelResponseBody = {
        currentTeamLevel: currentTeamLevel.id as UUID,
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

    // TODO: is it reaching this?
    console.log(
      "INFO: Invoking Bedrock with new user message:",
      newUserMessage
    );

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
        currentTeamLevel: currentTeamLevel.id as UUID,
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
