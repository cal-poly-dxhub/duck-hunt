import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
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
