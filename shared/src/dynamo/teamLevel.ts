import { BaseEntity, docClient, getCurrentTimestamp, TABLE_NAME } from ".";
import {
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

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
      PK: `TEAM#\${teamLevel.team_id}`,
      SK: `LEVEL#\${teamLevel.level_id}`,
      GSI1PK: `LEVEL#\${teamLevel.level_id}`,
      GSI1SK: `TEAM#\${teamLevel.team_id}`,
      ItemType: "TEAM_LEVEL",
      ...teamLevel,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      })
    );

    return teamLevel;
  }

  static async getByTeamId(teamId: string): Promise<TeamLevel[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `TEAM#\${teamId}`,
          ":sk": "LEVEL#",
        },
      })
    );

    return (
      result.Items?.map((item) => {
        const { PK, SK, GSI1PK, GSI1SK, ItemType, ...teamLevel } = item;
        return teamLevel as TeamLevel;
      }) || []
    );
  }

  static async getByLevelId(levelId: string): Promise<TeamLevel[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :gsi1pk",
        ExpressionAttributeValues: {
          ":gsi1pk": `LEVEL#\${levelId}`,
        },
      })
    );

    return (
      result.Items?.map((item) => {
        const { PK, SK, GSI1PK, GSI1SK, ItemType, ...teamLevel } = item;
        return teamLevel as TeamLevel;
      }) || []
    );
  }

  static async update(
    teamId: string,
    levelId: string,
    updates: Partial<
      Omit<TeamLevel, "id" | "created_at" | "team_id" | "level_id">
    >
  ): Promise<TeamLevel> {
    const updateExpression = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    updates.updated_at = getCurrentTimestamp();

    for (const [key, value] of Object.entries(updates)) {
      updateExpression.push(`#\${key} = :\${key}`);
      expressionAttributeNames[`#\${key}`] = key;
      expressionAttributeValues[`:\${key}`] = value;
    }

    const result = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `TEAM#\${teamId}`,
          SK: `LEVEL#\${levelId}`,
        },
        UpdateExpression: `SET \${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "ALL_NEW",
      })
    );

    const { PK, SK, GSI1PK, GSI1SK, ItemType, ...teamLevel } =
      result.Attributes!;
    return teamLevel as TeamLevel;
  }

  static async delete(teamId: string, levelId: string): Promise<void> {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `TEAM#\${teamId}`,
          SK: `LEVEL#\${levelId}`,
        },
      })
    );
  }
}
