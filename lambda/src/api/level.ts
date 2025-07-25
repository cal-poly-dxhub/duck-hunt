import {
  corsHeaders,
  LevelResponseBody,
  Message,
  MessageRole,
  RequestHeaders,
  ResponseError,
  UUID,
} from "@shared/types";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { Level } from "src/dynamo/level";
import { MessageOperations } from "src/dynamo/message";
import { TeamLevel, TeamLevelOperations } from "src/dynamo/teamLevel";
import { invokeBedrockPersistToDynamo } from "src/invokeBedrock";
import { v4 } from "uuid";
import { fetchBaseData } from "./fetchBaseData";

interface RespondByLevelTimeLevelResponseProps {
  gameId: UUID;
  userId: UUID;
  teamId: UUID;
  messageHistory: Message<MessageRole>[];
  currentTeamLevel: TeamLevel;
  currentLevel: Level;
}

/**
 * Respond to a level time event with the appropriate level response.
 * @param param0 {RespondByLevelTimeLevelResponseProps}
 * @returns {Promise<APIGatewayProxyResult>}
 */
const respondByLevelTimeLevelResponse = async ({
  gameId,
  userId,
  teamId,
  messageHistory,
  currentTeamLevel,
  currentLevel,
}: RespondByLevelTimeLevelResponseProps): Promise<APIGatewayProxyResult> => {
  console.log("INFO: Responding by level time (level response) with:", {
    gameId,
    userId,
    teamId,
    messageHistory,
    currentTeamLevel,
    currentLevel,
  });

  const firstTeamMessageForCurrentLevel =
    await MessageOperations.getFirstMessageForTeamAndLevel(
      teamId,
      currentLevel.id as UUID
    );

  const minutesOnLevel = firstTeamMessageForCurrentLevel
    ? Math.floor(
        (Date.now() -
          new Date(firstTeamMessageForCurrentLevel.createdAt).getTime()) /
          (60 * 1000)
      )
    : 0;

  console.log(
    "INFO: First team message for current level:",
    firstTeamMessageForCurrentLevel
  );

  console.log("INFO: Minutes on level:", minutesOnLevel);
  if (minutesOnLevel < 10) {
    if (!firstTeamMessageForCurrentLevel) {
      console.warn("WARN: No messages found for team at current level.");
    } else {
      const minutesOnLevel = Math.floor(
        (Date.now() -
          new Date(firstTeamMessageForCurrentLevel.createdAt).getTime()) /
          (60 * 1000)
      );
      console.log(
        "INFO: Team has been on level for:",
        minutesOnLevel,
        "minutes"
      );
    }

    if (messageHistory.length > 0) {
      console.warn(
        "INFO: User has messages at current level, returning existing messages."
      );

      const levelResponse: LevelResponseBody = {
        currentTeamLevel: currentTeamLevel.id as UUID,
        messageHistory: messageHistory.slice(1), // omit first user message
        requiresPhoto: false,
        mapLink: null,
      };

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(levelResponse),
      };
    }

    const newUserMessage: Message<MessageRole.User> = {
      id: v4() as UUID,
      role: MessageRole.User,
      content: "Hello. Introduce yourself and your job.",
      createdAt: new Date(),
    };

    // been on level for <10 minutes
    const { bedrockResponseMessage } = await invokeBedrockPersistToDynamo({
      gameId,
      levelId: currentLevel.id as UUID,
      userId,
      teamId,
      newUserMessage,
    });

    // sending bad message
    const levelResponse: LevelResponseBody = {
      currentTeamLevel: currentTeamLevel.id as UUID,
      messageHistory: [
        ...messageHistory,
        newUserMessage,
        bedrockResponseMessage,
      ].slice(1), // omit first user message
      requiresPhoto: false,
      mapLink: null,
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(levelResponse),
    };
  } else if (minutesOnLevel > 10 && minutesOnLevel <= 15) {
    // been on level for >10 minutes, <15 minutes
    console.warn(
      "WARN: User has been on the level for more than 10 minutes (<15 minutes)."
    );

    // Pick a random easy clue from currentLevel.easyClues
    const easyClues = currentLevel.easyClues || [];
    const randomClue = easyClues[Math.floor(Math.random() * easyClues.length)];
    const randomClueMessage: Message<MessageRole.Assistant> = {
      id: v4() as UUID,
      role: MessageRole.Assistant,
      content: "Here's a clue to help you out: " + randomClue,
      createdAt: new Date(),
    };

    const easyClueLevelResponse: LevelResponseBody = {
      currentTeamLevel: currentTeamLevel.id as UUID,
      messageHistory: [...messageHistory, randomClueMessage].slice(
        messageHistory.length > 0 ? 1 : 0
      ), // omit first user message if history exists
      requiresPhoto: false,
      mapLink: null,
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(easyClueLevelResponse),
    };
  } else {
    // been on level for >15 minutes
    console.warn("WARN: User has been on the level for more than 15 minutes.");

    const hardMessage: Message<MessageRole.Assistant> = {
      id: v4() as UUID,
      role: MessageRole.Assistant,
      content:
        "You have been on this level for a while. Here is a link to help you out: " +
        currentLevel.mapLink,
      createdAt: new Date(),
    };

    const mapLinkLevelResponse: LevelResponseBody = {
      currentTeamLevel: currentLevel.id as UUID,
      messageHistory: [...messageHistory, hardMessage].slice(
        messageHistory.length > 0 ? 1 : 0
      ), // omit first user message if history exists
      requiresPhoto: false,
      mapLink: currentLevel.mapLink,
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(mapLinkLevelResponse),
    };
  }
};

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

      // cant use respondByLevelTime here because /level responds with LevelResponseBody
      return respondByLevelTimeLevelResponse({
        gameId,
        userId: headers["user-id"] as UUID,
        teamId: headers["team-id"] as UUID,
        messageHistory: userMessages,
        currentTeamLevel,
        currentLevel,
      });
    }

    const allTeamLevels = await TeamLevelOperations.getAllForTeam(
      headers["team-id"] as UUID
    );

    console.log("INFO: All team levels:", allTeamLevels);

    const completedLevels = allTeamLevels.filter(
      (level) => level.completed_at !== null
    );

    if (eventBody.levelId === currentLevel.id) {
      console.log(
        "INFO: Level ID matches current level, advancing team to next level."
      );

      // mark current level as completed
      await TeamLevelOperations.markLevelAsCompleted(
        headers["team-id"] as UUID,
        currentLevel.id as UUID
      );

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

      await TeamLevelOperations.markLevelAsStarted(
        headers["team-id"] as UUID,
        newCurrentLevel.id as UUID
      );

      // otherwise, more levels to go
      const newCurrentUserMessages = await MessageOperations.getForUserAtLevel(
        headers["user-id"] as UUID,
        newCurrentLevel.id as UUID
      );

      console.log(
        "INFO: Found " +
          newCurrentUserMessages.length +
          " messages for user at new level."
      );

      if (newCurrentUserMessages.length > 0) {
        const responseBody: LevelResponseBody = {
          currentTeamLevel: currentTeamLevel.id as UUID,
          messageHistory: newCurrentUserMessages.slice(1), // omit first user message
          requiresPhoto: true,
          mapLink: null,
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

      console.log(
        "INFO: Invoking Bedrock with new user message:",
        newUserMessage
      );

      const { bedrockResponseMessage } = await invokeBedrockPersistToDynamo({
        gameId: gameId,
        levelId: newCurrentLevel.id as UUID,
        userId: headers["user-id"] as UUID,
        teamId: headers["team-id"] as UUID,
        newUserMessage,
      });

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          messageHistory: [bedrockResponseMessage],
          currentTeamLevel: currentTeamLevel.id as UUID,
          requiresPhoto: true,
        } as LevelResponseBody),
      };
    } else if (
      completedLevels.some((level) => level.id === eventBody.levelId)
    ) {
      console.warn(
        "WARN: Level ID already completed:",
        eventBody.levelId,
        "Completed levels:",
        completedLevels.map((level) => level.id)
      );

      // cant use respondByLevelTime here because /level responds with LevelResponseBody
      return respondByLevelTimeLevelResponse({
        gameId,
        userId: headers["user-id"] as UUID,
        teamId: headers["team-id"] as UUID,
        messageHistory: userMessages,
        currentTeamLevel,
        currentLevel,
      });
    } else {
      console.warn(
        "WARN: Wrong level ID provided:",
        eventBody.levelId,
        "Current level:",
        currentLevel.id
      );

      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "Wrong level ID provided",
          displayMessage:
            "You are at the wrong location. Try to find a location that better matches the clues. Scan another duck to continue.",
          details: `Received wrong level id: ${eventBody.levelId}`,
        } as ResponseError),
      };
    }
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
