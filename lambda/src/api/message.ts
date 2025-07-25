import {
  corsHeaders,
  MessageResponseBody,
  MessageRole,
  RequestHeaders,
  ResponseError,
  UUID,
} from "@shared/types";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { v4 } from "uuid";
import { invokeBedrockPersistToDynamo } from "../invokeBedrock";
import { fetchBaseData } from "./fetchBaseData";

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
  const eventBody = JSON.parse(event.body || "{}");

  if (!eventBody.message) {
    console.error("ERROR: No message found in request body.");
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "No message found.",
        displayMessage: "Please provide a message.",
        details: "No message found in request body.",
      } as ResponseError),
    };
  }

  try {
    const { currentLevel, gameId, currentTeamLevel, userMessages } =
      await fetchBaseData(headers);

    console.log(
      "INFO: Fetched base data:",
      JSON.stringify({ currentTeamLevel, userMessages }, null, 2)
    );

    if (!currentTeamLevel) {
      console.error("ERROR: No current team level found for team.");
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "No current team level found.",
          displayMessage:
            "You have completed all levels. Contact support for assistance.",
          details: "No current team level found for the team.",
        } as ResponseError),
      };
    }

    if (!currentLevel) {
      console.error("ERROR: No current level found for team.");
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "No current level found.",
          displayMessage:
            "You have completed all levels. Contact support for assistance.",
          details: "No current level found for the team.",
        } as ResponseError),
      };
    }

    if (userMessages[userMessages.length - 1].role === MessageRole.User) {
      console.warn("WARN: Last message is from user, removing it.");
      userMessages.pop(); // remove last message if it's from the user
      console.log(
        "INFO: Updated user messages after removing last user message:",
        JSON.stringify(userMessages, null, 2)
      );
    }

    if (
      new Date(currentTeamLevel.updated_at).getTime() <
      Date.now() - 10 * 60 * 1000
    ) {
      // been on level for <10 minutes
      const { bedrockResponseMessage } = await invokeBedrockPersistToDynamo({
        gameId: gameId,
        levelId: currentLevel.id as UUID,
        userId: headers["user-id"] as UUID,
        teamId: headers["team-id"] as UUID,
        newUserMessage: eventBody.message,
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
      new Date(currentTeamLevel.updated_at).getTime() <
      Date.now() - 15 * 60 * 1000
    ) {
      // been on level for >10 minutes, <15 minutes
      console.warn(
        "WARN: User has been on the level for more than 10 minutes."
      );
      // Pick a random easy clue from currentLevel.easyClues
      const easyClues = currentLevel.easyClues || [];
      const randomClue =
        easyClues[Math.floor(Math.random() * easyClues.length)];

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          message: {
            id: v4(),
            role: MessageRole.Assistant,
            content: randomClue,
            createdAt: new Date(),
          },
          mapLink: null,
        } as MessageResponseBody),
      };
    } else {
      // been on level for >15 minutes
      console.warn(
        "WARN: User has been on the level for more than 15 minutes."
      );
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          message: {
            id: v4(),
            role: MessageRole.Assistant,
            content:
              "You have been on this level for a while. Here's a link to the maps to help you out.",
            createdAt: new Date(),
          },
          mapLink: currentLevel.mapLink || null,
        } as MessageResponseBody),
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
            : "Error caught in message lambda top level catch",
      } as ResponseError),
    };
  }
};
