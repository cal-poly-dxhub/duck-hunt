import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import {
  BaseEntity,
  docClient,
  getCurrentTimestamp,
  getEpochTimestamp,
  TABLE_NAME,
} from ".";

export interface Message extends BaseEntity {
  user_id: string;
  team_id: string;
  game_id: string;
  level_id: string;
  role: string;
  text: string;
}

// MESSAGE Operations
export class MessageOperations {
  static async create(
    messageData: Omit<Message, "id" | "created_at" | "updated_at">
  ): Promise<Message> {
    const message: Message = {
      id: uuidv4(),
      created_at: getCurrentTimestamp(),
      updated_at: getCurrentTimestamp(),
      ...messageData,
    };

    const timestamp = getEpochTimestamp();
    const sortKey = `MESSAGE#${timestamp}#${message.id}`;

    const item = {
      PK: `USER#${message.user_id}`,
      SK: sortKey,
      GSI1PK: `TEAM#${message.team_id}`,
      GSI1SK: sortKey,
      GSI2PK: `GAME#${message.game_id}`,
      GSI2SK: sortKey,
      GSI3PK: `LEVEL#${message.level_id}`,
      GSI3SK: sortKey,
      ItemType: "MESSAGE",
      ...message,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      })
    );

    return message;
  }

  static async getByUserId(userId: string, limit?: number): Promise<Message[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
          ":sk": "MESSAGE#",
        },
        ScanIndexForward: false, // Most recent first
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
          ...message
        } = item;
        return message as Message;
      }) || []
    );
  }

  static async getByTeamId(teamId: string, limit?: number): Promise<Message[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI1",
        KeyConditionExpression:
          "GSI1PK = :gsi1pk AND begins_with(GSI1SK, :gsi1sk)",
        ExpressionAttributeValues: {
          ":gsi1pk": `TEAM#${teamId}`,
          ":gsi1sk": "MESSAGE#",
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
          ...message
        } = item;
        return message as Message;
      }) || []
    );
  }

  static async getByGameId(gameId: string, limit?: number): Promise<Message[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI2",
        KeyConditionExpression:
          "GSI2PK = :gsi2pk AND begins_with(GSI2SK, :gsi2sk)",
        ExpressionAttributeValues: {
          ":gsi2pk": `GAME#${gameId}`,
          ":gsi2sk": "MESSAGE#",
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
          ...message
        } = item;
        return message as Message;
      }) || []
    );
  }

  static async getByLevelId(
    levelId: string,
    limit?: number
  ): Promise<Message[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI3",
        KeyConditionExpression:
          "GSI3PK = :gsi3pk AND begins_with(GSI3SK, :gsi3sk)",
        ExpressionAttributeValues: {
          ":gsi3pk": `LEVEL#${levelId}`,
          ":gsi3sk": "MESSAGE#",
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
          ...message
        } = item;
        return message as Message;
      }) || []
    );
  }
}
