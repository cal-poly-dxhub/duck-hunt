import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { modelRoulettePool } from "@shared/config";
import { v4 as uuidv4 } from "uuid";
import {
  BaseEntity,
  docClient,
  DUCK_HUNT_TABLE_NAME,
  getCurrentTimestamp,
} from ".";

export interface TeamLevel extends BaseEntity {
  team_id: string;
  level_id: string;
  index: number;
  completed_at?: string;
  /** Model roulette: the model this team was locked to for THIS level. */
  model?: string;
}

// TEAM_LEVEL Operations
export class TeamLevelOperations {
  static async create(
    teamLevelData: Omit<TeamLevel, "id" | "created_at" | "updated_at">
  ): Promise<TeamLevel> {
    const teamLevel: TeamLevel = {
      id: uuidv4(),
      created_at: getCurrentTimestamp(),
      updated_at: getCurrentTimestamp(),
      ...teamLevelData,
    };

    const item = {
      PK: `TEAM#${teamLevel.team_id}`,
      SK: `LEVEL#${teamLevel.level_id}`,
      GSI1PK: `LEVEL#${teamLevel.level_id}`,
      GSI1SK: `TEAM#${teamLevel.team_id}`,
      ItemType: "TEAM_LEVEL",
      ...teamLevel,
    };

    await docClient.send(
      new PutCommand({
        TableName: DUCK_HUNT_TABLE_NAME,
        Item: item,
      })
    );

    return teamLevel;
  }

  static async getCurrentForTeam(teamId: string): Promise<TeamLevel> {
    try {
      const response = await docClient.send(
        new QueryCommand({
          TableName: DUCK_HUNT_TABLE_NAME,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
          FilterExpression: "attribute_not_exists(completed_at)",
          ExpressionAttributeValues: {
            ":pk": `TEAM#${teamId}`,
            ":sk": "LEVEL#",
          },
        })
      );

      console.log("INFO: Current team level response:", response);

      if (!response.Items || response.Items.length === 0) {
        // no items, check if there are any levels for the team
        const allTeamLevels = await this.getAllForTeam(teamId);

        if (!allTeamLevels.length) {
          console.error(`ERROR: No levels found for team ${teamId}.`);
          throw new Error(`No levels found for team: ${teamId}`);
        }

        // all levels are completed, return the last level
        const sortedLevels = allTeamLevels.sort((a, b) => a.index - b.index);

        // return last level
        return sortedLevels[sortedLevels.length - 1];
      }

      // Find the level with the minimum index (most efficient for small datasets)
      const currentLevel = response.Items.reduce((min, current) =>
        (current as TeamLevel).index < (min as TeamLevel).index ? current : min
      ) as TeamLevel;

      return currentLevel;
    } catch (error) {
      console.error(`Error fetching current level for team ${teamId}:`, error);
      throw new Error(`Failed to get current level for team: ${teamId}`);
    }
  }

  static async getAllForTeam(teamId: string): Promise<TeamLevel[]> {
    const teamLevels = await docClient.send(
      new QueryCommand({
        TableName: DUCK_HUNT_TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `TEAM#${teamId}`,
          ":sk": "LEVEL#",
        },
      })
    );

    if (!teamLevels.Items || teamLevels.Items.length === 0) {
      return [];
    }

    return teamLevels.Items as TeamLevel[];
  }

  static async markLevelAsCompleted(
    teamId: string,
    levelId: string
  ): Promise<void> {
    const currentTimestamp = getCurrentTimestamp();

    await docClient.send(
      new UpdateCommand({
        TableName: DUCK_HUNT_TABLE_NAME,
        Key: {
          PK: `TEAM#${teamId}`,
          SK: `LEVEL#${levelId}`,
        },
        UpdateExpression:
          "SET completed_at = :completedAt, updated_at = :updatedAt",
        ExpressionAttributeValues: {
          ":completedAt": currentTimestamp,
          ":updatedAt": currentTimestamp,
        },
      })
    );
  }

  /**
   * Model roulette (per team, per level): return the model locked in for this
   * team at this level, assigning a random one from the pool on the first
   * call. Uses a conditional write so concurrent first requests from teammates
   * can't split-assign — first writer wins, others read it. A team re-rolls a
   * fresh model at each new level.
   */
  static async getOrAssignModel(
    teamId: string,
    levelId: string
  ): Promise<string> {
    const key = { PK: `TEAM#${teamId}`, SK: `LEVEL#${levelId}` };

    // Fast path: already assigned for this level.
    const existing = await docClient.send(
      new GetCommand({ TableName: DUCK_HUNT_TABLE_NAME, Key: key })
    );
    if (existing.Item?.model) {
      return existing.Item.model as string;
    }

    // Pick a random model and try to claim it atomically.
    const candidate =
      modelRoulettePool[Math.floor(Math.random() * modelRoulettePool.length)];

    try {
      await docClient.send(
        new UpdateCommand({
          TableName: DUCK_HUNT_TABLE_NAME,
          Key: key,
          UpdateExpression: "SET #model = :m, updated_at = :u",
          ConditionExpression: "attribute_not_exists(#model)",
          ExpressionAttributeNames: { "#model": "model" },
          ExpressionAttributeValues: {
            ":m": candidate,
            ":u": getCurrentTimestamp(),
          },
        })
      );
      console.log(
        `INFO: Assigned model ${candidate} to team ${teamId} at level ${levelId}`
      );
      return candidate;
    } catch (error: any) {
      // Lost the race: another request assigned first. Read the winner.
      if (error?.name === "ConditionalCheckFailedException") {
        const after = await docClient.send(
          new GetCommand({ TableName: DUCK_HUNT_TABLE_NAME, Key: key })
        );
        if (after.Item?.model) {
          return after.Item.model as string;
        }
      }
      throw error;
    }
  }

  static async getNextLevel(
    teamId: string,
    currentLevelId: string
  ): Promise<TeamLevel | null> {
    const teamLevels = await this.getAllForTeam(teamId);
    const sortedTeamLevels = teamLevels.sort((a, b) => a.index - b.index);

    // find the current level index
    const currentLevelIndex = sortedTeamLevels.findIndex(
      (level) => level.level_id === currentLevelId
    );

    // if current level is the last one, return null
    if (currentLevelIndex === sortedTeamLevels.length - 1) {
      return null;
    }

    return sortedTeamLevels[currentLevelIndex + 1];
  }
}
