import {
  corsHeaders,
  MessageResponseBody,
  MessageRole,
  UUID,
} from "@shared/types";
import { APIGatewayProxyResult } from "aws-lambda";
import { v4 } from "uuid";
import { Level } from "./dynamo/level";
import { MessageOperations } from "./dynamo/message";
import { invokeBedrockPersistToDynamo } from "./invokeBedrock";

export interface RespondByLevelTimeProps {
  gameId: UUID;
  userId: UUID;
  teamId: UUID;
  currentLevel: Level;
}

/**
 * Respond to the user based on the time spent on the current level.
 * Uses the first message for the team at the current level to determine how long the team has been on the level.
 * @param param0 {RespondByLevelTimeProps}
 * @returns {Promise<APIGatewayProxyResult>}
 */
export const respondByLevelTime = async ({
  gameId,
  userId,
  teamId,
  currentLevel,
}: RespondByLevelTimeProps): Promise<APIGatewayProxyResult> => {
  console.log("INFO: Responding by level time (message response) with:", {
    gameId,
    userId,
    teamId,
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
      console.log("INFO: User has been on the level for less than 10 minutes.");
    }

    // been on level for <10 minutes
    const { bedrockResponseMessage } = await invokeBedrockPersistToDynamo({
      gameId,
      levelId: currentLevel.id as UUID,
      userId,
      teamId,
      newUserMessage: {
        id: v4() as UUID,
        role: MessageRole.User,
        content: "Hello. Introduce yourself and your job.",
        createdAt: new Date(),
      },
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: {
          id: v4(),
          role: MessageRole.Assistant,
          content: bedrockResponseMessage.content,
          createdAt: new Date(),
        },
        mapLink: null,
      } as MessageResponseBody),
    };
  } else if (minutesOnLevel > 10 && minutesOnLevel <= 15) {
    console.warn(
      "WARN: User has been on the level for more than 10 minutes (<15 minutes)."
    );

    // Pick a random easy clue from currentLevel.easyClues
    const easyClues = currentLevel.easyClues || [];
    const randomClue = easyClues[Math.floor(Math.random() * easyClues.length)];

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: {
          id: v4(),
          role: MessageRole.Assistant,
          content: "Here's a clue to help you out: " + randomClue,
          createdAt: new Date(),
        },
        mapLink: null,
      } as MessageResponseBody),
    };
  } else {
    // been on level for >15 minutes
    console.warn("WARN: User has been on the level for more than 15 minutes.");

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: {
          id: v4(),
          role: MessageRole.Assistant,
          content:
            "You have been on this level for a while. Here's a link to the maps to help you out: " +
            currentLevel.mapLink,
          createdAt: new Date(),
        },
        mapLink: currentLevel.mapLink || null,
      } as MessageResponseBody),
    };
  }
};
