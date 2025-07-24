import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import {
  BaseEntity,
  docClient,
  getCurrentTimestamp,
  getEpochTimestamp,
  DUCK_HUNT_TABLE_NAME,
} from ".";

export interface Photo extends BaseEntity {
  user_id: string;
  team_id: string;
  game_id: string;
  level_id: string;
  url: string;
}

// PHOTO Operations
export class PhotoOperations {
  static async create(
    photoData: Omit<Photo, "id" | "created_at" | "updated_at">
  ): Promise<Photo> {
    const photo: Photo = {
      id: uuidv4(),
      created_at: getCurrentTimestamp(),
      updated_at: getCurrentTimestamp(),
      ...photoData,
    };

    const timestamp = getEpochTimestamp();
    const sortKey = `PHOTO#${timestamp}#${photo.id}`;

    const item = {
      PK: `USER#${photo.user_id}`,
      SK: sortKey,
      GSI1PK: `TEAM#${photo.team_id}`,
      GSI1SK: sortKey,
      GSI2PK: `GAME#${photo.game_id}`,
      GSI2SK: sortKey,
      GSI3PK: `LEVEL#${photo.level_id}`,
      GSI3SK: sortKey,
      ItemType: "PHOTO",
      ...photo,
    };

    await docClient.send(
      new PutCommand({
        TableName: DUCK_HUNT_TABLE_NAME,
        Item: item,
      })
    );

    return photo;
  }

  static async getByUserId(userId: string, limit?: number): Promise<Photo[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: DUCK_HUNT_TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
          ":sk": "PHOTO#",
        },
        ScanIndexForward: false,
        Limit: limit,
      })
    );

    return (
      result.Items?.map((item) => {
        const {
          PK,
          SK,
          GSI1PK,
          GSI1SK,
          GSI2PK,
          GSI2SK,
          GSI3PK,
          GSI3SK,
          ItemType,
          ...photo
        } = item;
        return photo as Photo;
      }) || []
    );
  }

  static async getByTeamId(teamId: string, limit?: number): Promise<Photo[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: DUCK_HUNT_TABLE_NAME,
        IndexName: "GSI1",
        KeyConditionExpression:
          "GSI1PK = :gsi1pk AND begins_with(GSI1SK, :gsi1sk)",
        ExpressionAttributeValues: {
          ":gsi1pk": `TEAM#${teamId}`,
          ":gsi1sk": "PHOTO#",
        },
        ScanIndexForward: false,
        Limit: limit,
      })
    );

    return (
      result.Items?.map((item) => {
        const {
          PK,
          SK,
          GSI1PK,
          GSI1SK,
          GSI2PK,
          GSI2SK,
          GSI3PK,
          GSI3SK,
          ItemType,
          ...photo
        } = item;
        return photo as Photo;
      }) || []
    );
  }

  static async getByGameId(gameId: string, limit?: number): Promise<Photo[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: DUCK_HUNT_TABLE_NAME,
        IndexName: "GSI2",
        KeyConditionExpression:
          "GSI2PK = :gsi2pk AND begins_with(GSI2SK, :gsi2sk)",
        ExpressionAttributeValues: {
          ":gsi2pk": `GAME#${gameId}`,
          ":gsi2sk": "PHOTO#",
        },
        ScanIndexForward: false,
        Limit: limit,
      })
    );

    return (
      result.Items?.map((item) => {
        const {
          PK,
          SK,
          GSI1PK,
          GSI1SK,
          GSI2PK,
          GSI2SK,
          GSI3PK,
          GSI3SK,
          ItemType,
          ...photo
        } = item;
        return photo as Photo;
      }) || []
    );
  }

  static async getByLevelId(levelId: string, limit?: number): Promise<Photo[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: DUCK_HUNT_TABLE_NAME,
        IndexName: "GSI3",
        KeyConditionExpression:
          "GSI3PK = :gsi3pk AND begins_with(GSI3SK, :gsi3sk)",
        ExpressionAttributeValues: {
          ":gsi3pk": `LEVEL#${levelId}`,
          ":gsi3sk": "PHOTO#",
        },
        ScanIndexForward: false,
        Limit: limit,
      })
    );

    return (
      result.Items?.map((item) => {
        const {
          PK,
          SK,
          GSI1PK,
          GSI1SK,
          GSI2PK,
          GSI2SK,
          GSI3PK,
          GSI3SK,
          ItemType,
          ...photo
        } = item;
        return photo as Photo;
      }) || []
    );
  }
}
