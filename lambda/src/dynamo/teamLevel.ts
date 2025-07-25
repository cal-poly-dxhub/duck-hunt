import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
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

  static async getCurrentForTeam(teamId: string): Promise<TeamLevel | null> {
    // query for all team levels for the team
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
      throw new Error(`No team levels found for team: ${teamId}`);
    }

    // filter out completed levels
    const currentLevels = (teamLevels.Items || []).filter(
      (level) => !(level as TeamLevel).completed_at
    );

    if (currentLevels.length === 0) {
      // all levels are completed
      return null;
    }

    // sort team levels by index
    const sortedLevels = currentLevels.sort(
      (a, b) => (a as TeamLevel).index - (b as TeamLevel).index
    );

    // return the first level (current level)
    return sortedLevels[0] as TeamLevel;
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
      new PutCommand({
        TableName: DUCK_HUNT_TABLE_NAME,
        Item: {
          PK: `TEAM#${teamId}`,
          SK: `LEVEL#${levelId}`,
          GSI1PK: `LEVEL#${levelId}`,
          GSI1SK: `TEAM#${teamId}`,
          ItemType: "TEAM_LEVEL",
          completed_at: currentTimestamp,
          updated_at: currentTimestamp,
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
