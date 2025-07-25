import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  corsHeaders,
  RequestHeaders,
  ResponseError,
  UUID,
} from "@shared/types";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { CoordinateSnapshotOperations } from "src/dynamo/coordinates";
import { fetchBaseData } from "./fetchBaseData";

const dynamoClient = new DynamoDBClient({});

/**
 * /ping-coordinates lambda handler
 * Handles requests when the frontend pings the server with coordinates.
 * Enters the coordinates into dynamoDB.
 * @param event
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log("INFO: Received event:", JSON.stringify(event, null, 2));

  // validate request headers
  const headers = event.headers as unknown as RequestHeaders;
  const eventBody = JSON.parse(event.body || "{}");

  if (!eventBody.latitude || !eventBody.longitude) {
    console.error("ERROR: Missing latitude or longitude in request body");
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Invalid request",
        displayMessage: "Latitude and longitude are required.",
        details: "Latitude and longitude must be provided in the request body.",
      } as ResponseError),
    };
  }

  try {
    await fetchBaseData(headers);

    CoordinateSnapshotOperations.create({
      user_id: headers["user-id"] as UUID,
      team_id: headers["team-id"] as UUID,
      latitude: eventBody.latitude,
      longitude: eventBody.longitude,
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: "Coordinates received and processed successfully.",
      }),
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
            : "Error caught in pingCoordinates lambda in top level catch",
      } as ResponseError),
    };
  }
};
