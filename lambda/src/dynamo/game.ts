import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import {
  BaseEntity,
  docClient,
  DUCK_HUNT_TABLE_NAME,
  getCurrentTimestamp,
} from ".";
import { Level } from "./level";
import { Team } from "./team";

export interface Game extends BaseEntity {
  levelsInGame?: number;
  teams: Array<Team>;
  levels: Array<Level>;
  /** Team id of the first team to complete the hunt (set atomically, once). */
  winner_team_id?: string;
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
        TableName: DUCK_HUNT_TABLE_NAME,
        Item: item,
      })
    );

    return game;
  }

  static async getById(gameId: string): Promise<Game | null> {
    const result = await docClient.send(
      new GetCommand({
        TableName: DUCK_HUNT_TABLE_NAME,
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
        TableName: DUCK_HUNT_TABLE_NAME,
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

  /**
   * Atomically claim the "winner" slot for a game. The FIRST team to call this
   * wins (its id is stored via a conditional write); every later caller loses
   * the race. Returns the winning team id either way, so callers can compare it
   * to their own team id to decide win vs. finish screen. Idempotent: a team
   * that already won and calls again still reads itself as the winner.
   */
  static async claimWinner(
    gameId: string,
    teamId: string
  ): Promise<string> {
    try {
      const result = await docClient.send(
        new UpdateCommand({
          TableName: DUCK_HUNT_TABLE_NAME,
          Key: { PK: `GAME#${gameId}`, SK: "#METADATA" },
          UpdateExpression:
            "SET winner_team_id = :teamId, updated_at = :updatedAt",
          ConditionExpression: "attribute_not_exists(winner_team_id)",
          ExpressionAttributeValues: {
            ":teamId": teamId,
            ":updatedAt": getCurrentTimestamp(),
          },
          ReturnValues: "ALL_NEW",
        })
      );
      console.log(`INFO: Team ${teamId} WON game ${gameId}`);
      return result.Attributes?.winner_team_id as string;
    } catch (error: any) {
      // Someone already won. Read who.
      if (error?.name === "ConditionalCheckFailedException") {
        const game = await this.getById(gameId);
        return (game?.winner_team_id as string) ?? teamId;
      }
      throw error;
    }
  }

  static async delete(gameId: string): Promise<void> {
    await docClient.send(
      new DeleteCommand({
        TableName: DUCK_HUNT_TABLE_NAME,
        Key: {
          PK: `GAME#${gameId}`,
          SK: "#METADATA",
        },
      })
    );
  }
}
