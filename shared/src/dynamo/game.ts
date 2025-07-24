import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { BaseEntity, docClient, getCurrentTimestamp, TABLE_NAME } from ".";

export interface Game extends BaseEntity {
  name: string;
  description: string;
  levelsInGame?: number;
}

// GAME Operations
export class GameOperations {
  static async create(
    gameData: Omit<Game, "id" | "created_at" | "updated_at">
  ): Promise<Game> {
    const game: Game = {
      id: uuidv4(),
      created_at: getCurrentTimestamp(),
      updated_at: getCurrentTimestamp(),
      ...gameData,
    };

    const item = {
      PK: `GAME#${game.id}`,
      SK: "#METADATA",
      ItemType: "GAME",
      ...game,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      })
    );

    return game;
  }

  static async getById(gameId: string): Promise<Game | null> {
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `GAME#${gameId}`,
          SK: "#METADATA",
        },
      })
    );

    if (!result.Item) return null;

    const { PK, SK, ItemType, ...game } = result.Item;
    return game as Game;
  }

  static async update(
    gameId: string,
    updates: Partial<Omit<Game, "id" | "created_at">>
  ): Promise<Game> {
    const updateExpression = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    // Add updated_at
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
          SK: "#METADATA",
        },
        UpdateExpression: `SET ${updateExpression.join(", ")}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "ALL_NEW",
      })
    );

    const { PK, SK, ItemType, ...game } = result.Attributes!;
    return game as Game;
  }

  static async delete(gameId: string): Promise<void> {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `GAME#${gameId}`,
          SK: "#METADATA",
        },
      })
    );
  }
}
