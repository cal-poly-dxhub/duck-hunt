import { levelTimeConfig } from "@shared/config";
import {
  corsHeaders,
  MessageResponseBody,
  MessageRole,
  UUID,
} from "@shared/types";
import { APIGatewayProxyResult } from "aws-lambda";
import { v4 } from "uuid";
import { Level } from "./dynamo/level";
import { invokeBedrockPersistToDynamo } from "./invokeBedrock";

export interface RespondByLevelTimeProps {
  gameId: UUID;
  userId: UUID;
  teamId: UUID;
  currentLevel: Level;
  /** TEAM_LEVEL.started_at for the current level; required so callers can't silently omit it. */
  startedAt: string | undefined;
  userMessage: {
    id: UUID;
    role: MessageRole.User;
    content: string;
    createdAt: Date;
  };
}

/**
 * Respond to the user based on the time spent on the current level.
 * Uses the team's started_at for the current level to determine how long the team has been on the level.
 * @param param0 {RespondByLevelTimeProps}
 * @returns {Promise<APIGatewayProxyResult>}
 */
export const respondByLevelTime = async ({
  gameId,
  userId,
  teamId,
  currentLevel,
  startedAt,
  userMessage,
}: RespondByLevelTimeProps): Promise<APIGatewayProxyResult> => {
  console.log("INFO: Responding by level time (message response) with:", {
    gameId,
    userId,
    teamId,
    currentLevel,
  });

  // started_at, not the first message: that query pairs Limit 1 with a filter, so it returns null past level 1.
  const minutesOnLevel = startedAt
    ? Math.floor((Date.now() - new Date(startedAt).getTime()) / (60 * 1000))
    : 0;

  console.log("INFO: Minutes on level:", minutesOnLevel);

  if (minutesOnLevel < levelTimeConfig.easyClueThresholdMin) {
    if (!startedAt) {
      console.warn("WARN: No started_at recorded for team at current level.");
    } else {
      console.log(
        `INFO: User has been on the level for less than ${levelTimeConfig.easyClueThresholdMin} minutes.`
      );
    }

    // been on level for <10 minutes
    const { bedrockResponseMessage } = await invokeBedrockPersistToDynamo({
      gameId,
      levelId: currentLevel.id as UUID,
      userId,
      teamId,
      newUserMessage: userMessage,
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
  } else if (
    minutesOnLevel > levelTimeConfig.easyClueThresholdMin &&
    minutesOnLevel <= levelTimeConfig.mapLinkThresholdMin
  ) {
    console.warn(
      `WARN: User has been on the level for more than ${levelTimeConfig.easyClueThresholdMin} minutes (<${levelTimeConfig.mapLinkThresholdMin} minutes).`
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
    // been on level for > mapLinkThresholdMin minutes
    console.warn(
      `WARN: User has been on the level for more than ${levelTimeConfig.mapLinkThresholdMin} minutes.`
    );

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
