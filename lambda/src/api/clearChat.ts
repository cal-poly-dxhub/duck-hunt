import {
  corsHeaders,
  MessageResponseBody,
  MessageRole,
  RequestHeaders,
  ResponseError,
  UUID,
} from "@shared/types";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { MessageOperations } from "src/dynamo/message";
import { respondByLevelTime } from "src/respondByLevelTime";
import { v4 } from "uuid";
import { fetchBaseData } from "./fetchBaseData";

/**
 * /clear-chat lambda handler
 * Handles requests when the user clears the chat.
 * Soft deletes all messages for the user at the current level.
 * Returns the hardcoded initial message for the level.
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

    if (currentTeamLevel.completed_at) {
      const messageResponse: MessageResponseBody = {
        message: {
          id: v4() as UUID,
          role: MessageRole.Assistant,
          content: "Congratulations! You have completed the Duck Hunt!",
          createdAt: new Date(),
        },
        mapLink: null,
      };

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(messageResponse),
      };
    }

    console.log(
      "INFO: Soft deleting current level messages for user:",
      headers["user-id"]
    );

    await MessageOperations.softDeleteCurrentLevelMessages(
      headers["user-id"] as UUID,
      currentLevel.id as UUID
    );

    // respond based on the time spent on the level
    // can use this as /clearChat responds with MessageResponseBody
    return respondByLevelTime({
      gameId,
      userId: headers["user-id"] as UUID,
      teamId: headers["team-id"] as UUID,
      currentLevel,
      userMessage: {
        id: v4() as UUID,
        role: MessageRole.User,
        content: "Hello. Introduce yourself and your job.",
        createdAt: new Date(),
      },
    });
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
            : "Error caught in clearChat lambda top level catch",
      } as ResponseError),
    };
  }
};
