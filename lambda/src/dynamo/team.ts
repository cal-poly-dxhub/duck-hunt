import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import {
  BaseEntity,
  docClient,
  DUCK_HUNT_TABLE_NAME,
  getCurrentTimestamp,
} from ".";

export interface Team extends BaseEntity {
  name: string;
  game_id: string;
}

// TEAM Operations
export class TeamOperations {
  static async create(
    teamData: Omit<Team, "id" | "created_at" | "updated_at">
  ): Promise<Team> {
    const team: Team = {
      id: uuidv4(),
      created_at: getCurrentTimestamp(),
      updated_at: getCurrentTimestamp(),
      ...teamData,
    };

    const item = {
      PK: `GAME#${team.game_id}`,
      SK: `TEAM#${team.id}`,
      ItemType: "TEAM",
      ...team,
    };

    await docClient.send(
      new PutCommand({
        TableName: DUCK_HUNT_TABLE_NAME,
        Item: item,
      })
    );

    return team;
  }

  static async getById(gameId: string, teamId: string): Promise<Team | null> {
    const result = await docClient.send(
      new GetCommand({
        TableName: DUCK_HUNT_TABLE_NAME,
        Key: {
          PK: `GAME#${gameId}`,
          SK: `TEAM#${teamId}`,
        },
      })
    );

    if (!result.Item) return null;

    const { PK, SK, ItemType, ...team } = result.Item;
    return team as Team;
  }

  static async getByGameId(gameId: string): Promise<Team[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: DUCK_HUNT_TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `GAME#${gameId}`,
          ":sk": "TEAM#",
        },
      })
    );

    return (
      result.Items?.map((item) => {
        const { PK, SK, ItemType, ...team } = item;
        return team as Team;
      }) || []
    );
  }

  static async update(
    gameId: string,
    teamId: string,
    updates: Partial<Omit<Team, "id" | "created_at" | "game_id">>
  ): Promise<Team> {
    const updateExpression = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    updates.updated_at = getCurrentTimestamp();

    for (const [key, value] of Object.entries(updates)) {
      updateExpression.push(`#${key} = :${key}`);
      expressionAttributeNames[`#${key}`] = key;
      expressionAttributeValues[`:${key}`] = value;
    }

    const result = await docClient.send(
      new UpdateCommand({
        TableName: DUCK_HUNT_TABLE_NAME,
        Key: {
          PK: `GAME#${gameId}`,
          SK: `TEAM#${teamId}`,
        },
        UpdateExpression: `SET ${updateExpression.join(", ")}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "ALL_NEW",
      })
    );

    const { PK, SK, ItemType, ...team } = result.Attributes!;
    return team as Team;
  }

  static async delete(gameId: string, teamId: string): Promise<void> {
    await docClient.send(
      new DeleteCommand({
        TableName: DUCK_HUNT_TABLE_NAME,
        Key: {
          PK: `GAME#${gameId}`,
          SK: `TEAM#${teamId}`,
        },
      })
    );
  }
}
