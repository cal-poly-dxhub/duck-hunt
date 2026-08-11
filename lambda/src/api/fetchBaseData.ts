import { validateUUID } from "@shared/scripts";
import {
  corsHeaders,
  Message,
  RequestHeaders,
  ResponseError,
  UUID,
} from "@shared/types";
import { Level, LevelOperations } from "src/dynamo/level";
import { MessageOperations } from "src/dynamo/message";
import { TeamLevel, TeamLevelOperations } from "src/dynamo/teamLevel";
import { UserOperations } from "src/dynamo/user";

type BaseDataResponse = {
  currentTeamLevel: TeamLevel;
  currentLevel: Level;
  gameId: UUID;
  userMessages: Array<Message>;
};

/**
 * Fetch base data for given user and team.
 * Fetches current leve, next level, user messages for current level (not soft deleted)
 * @param headers {RequestHeaders}
 * @returns
 */
export const fetchBaseData = async (
  headers: RequestHeaders
): Promise<BaseDataResponse> => {
  console.log(
    "INFO: Fetching base data for: ",
    JSON.stringify(headers, null, 2)
  );

  // validate headers["user-id"] and headers["team-id"]
  if (!validateUUID(headers["user-id"])) {
    console.error(
      "ERROR: Invalid user ID in request headers:",
      headers["user-id"]
    );

    throw {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Invalid user-id header.",
        displayMessage: "The provided user ID is invalid. Contact support.",
        details: `Invalid user ID: ${headers["user-id"]}`,
      } as ResponseError),
    };
  } else if (!validateUUID(headers["team-id"])) {
    console.error(
      "ERROR: Invalid team ID in request headers:",
      headers["team-id"]
    );

    throw {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Invalid team-id header.",
        displayMessage:
          "The provided team ID is invalid. Try scanning your team duck again or contact support.",
        details: `Invalid team ID: ${headers["team-id"]}`,
      } as ResponseError),
    };
  }

  const currentTeamLevel = await TeamLevelOperations.getCurrentForTeam(
    headers["team-id"]
  );

  if (!currentTeamLevel) {
    console.error("ERROR: No current team level found for team.");
    throw {
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

  // Skip once set: the conditional write would fail on every ping (10s) for no gain.
  if (!currentTeamLevel.completed_at && !currentTeamLevel.started_at) {
    // Mirror only a winning write; on a lost race leave it unset so the next request reads the real value.
    const startedAt = await TeamLevelOperations.markLevelAsStarted(
      headers["team-id"] as UUID,
      currentTeamLevel.level_id as UUID
    );
    if (startedAt) {
      currentTeamLevel.started_at = startedAt;
    }
  }

  let currentUser = await UserOperations.getById(headers["user-id"] as UUID);

  if (!currentUser) {
    // Must await: a new user's first request previously failed because the
    // create had not landed before the re-read below (worked on refresh).
    currentUser = await UserOperations.create({
      id: headers["user-id"] as UUID,
      team_id: headers["team-id"] as UUID,
    });
  }

  if (!currentUser) {
    console.error("ERROR: User not found for user-id:", headers["user-id"]);
    throw {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "User not found.",
        displayMessage: "User not found. Contact support.",
        details: `No user found for user ID: ${headers["user-id"]}`,
      } as ResponseError),
    };
  }

  const currentLevel = await LevelOperations.getByLevelId(
    currentTeamLevel.level_id
  );

  if (!currentLevel) {
    console.error("ERROR: No current level found for team.");
    throw {
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

  const currentUserMessages = await MessageOperations.getForUserAtLevel(
    headers["user-id"],
    currentTeamLevel?.level_id
  );

  return {
    currentTeamLevel,
    userMessages: currentUserMessages,
    gameId: currentLevel.game_id as UUID,
    currentLevel,
  };
};
