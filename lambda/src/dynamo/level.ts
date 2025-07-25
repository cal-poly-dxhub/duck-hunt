import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import {
  BaseEntity,
  docClient,
  DUCK_HUNT_TABLE_NAME,
  getCurrentTimestamp,
} from ".";

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
        TableName: DUCK_HUNT_TABLE_NAME,
        Item: item,
      })
    );

    return level;
  }

  // New method to get level by ID alone using GSI1
  static async getByLevelId(levelId: string): Promise<Level | null> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: DUCK_HUNT_TABLE_NAME,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :gsi1pk",
        ExpressionAttributeValues: {
          ":gsi1pk": `LEVEL#${levelId}`,
        },
        Limit: 1,
      })
    );

    if (!result.Items || result.Items.length === 0) return null;

    const { PK, SK, GSI1PK, GSI1SK, ItemType, ...level } = result.Items[0];
    return level as Level;
  }
}
