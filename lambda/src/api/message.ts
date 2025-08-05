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

    if (
      userMessages.length > 0 &&
      userMessages[userMessages.length - 1].role === MessageRole.User
    ) {
      console.warn("WARN: Last message is from user, removing it.");

      await MessageOperations.delete(
        headers["user-id"] as UUID,
        userMessages[userMessages.length - 1].id as UUID
      );

      userMessages.pop(); // remove last message if it's from the user
      console.log(
        "INFO: Updated user messages after removing last user message:",
        JSON.stringify(userMessages, null, 2)
      );
    }

    // respond based on the time spent on the level
    // can use this as /message responds with MessageResponseBody
    return respondByLevelTime({
      gameId,
      userId: headers["user-id"] as UUID,
      teamId: headers["team-id"] as UUID,
      currentLevel,
      userMessage: eventBody.message,
    });
  } catch (error) {
    console.error("ERROR: Failed to process request:", error);
    console.error("ERROR: Error type:", typeof error);
    console.error("ERROR: Error constructor:", error?.constructor?.name);
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
