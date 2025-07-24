import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { BaseEntity, docClient, getCurrentTimestamp, TABLE_NAME } from ".";

export interface Character {
  name: string;
  systemPrompt: string;
}

export interface Location {
  description: string;
  latitude: number;
  longitude: number;
}

export interface Level extends BaseEntity {
  game_id: string;
  levelName: string;
  character: Character;
  location: Location;
  clues: string[];
  easyClues: string[];
  mapLink: string;
  max_tokens: number;
}

// LEVEL Operations
export class LevelOperations {
  static async create(
    levelData: Omit<Level, "id" | "created_at" | "updated_at">
  ): Promise<Level> {
    const level: Level = {
      id: uuidv4(),
      created_at: getCurrentTimestamp(),
      updated_at: getCurrentTimestamp(),
      ...levelData,
    };

    const item = {
      PK: `GAME#${level.game_id}`,
      SK: `LEVEL#${level.id}`,
      GSI1PK: `LEVEL#${level.id}`,
      GSI1SK: `GAME#${level.game_id}`,
      ItemType: "LEVEL",
      ...level,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      })
    );

    return level;
  }

  static async getById(gameId: string, levelId: string): Promise<Level | null> {
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `GAME#${gameId}`,
          SK: `LEVEL#${levelId}`,
        },
      })
    );

    if (!result.Item) return null;

    const { PK, SK, GSI1PK, GSI1SK, ItemType, ...level } = result.Item;
    return level as Level;
  }

  static async getByGameId(gameId: string): Promise<Level[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `GAME#${gameId}`,
          ":sk": "LEVEL#",
        },
      })
    );

    return (
      result.Items?.map((item) => {
        const { PK, SK, GSI1PK, GSI1SK, ItemType, ...level } = item;
        return level as Level;
      }) || []
    );
  }

  static async update(
    gameId: string,
    levelId: string,
    updates: Partial<Omit<Level, "id" | "created_at" | "game_id">>
  ): Promise<Level> {
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
        TableName: TABLE_NAME,
        Key: {
          PK: `GAME#${gameId}`,
          SK: `LEVEL#${levelId}`,
        },
        UpdateExpression: `SET ${updateExpression.join(", ")}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "ALL_NEW",
      })
    );

    const { PK, SK, GSI1PK, GSI1SK, ItemType, ...level } = result.Attributes!;
    return level as Level;
  }

  static async delete(gameId: string, levelId: string): Promise<void> {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `GAME#${gameId}`,
          SK: `LEVEL#${levelId}`,
        },
      })
    );
  }
}
