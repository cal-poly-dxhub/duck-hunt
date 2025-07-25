import { DeleteCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { Message as SharedMessage } from "@shared/types";
import { v4 as uuidv4 } from "uuid";
import {
  BaseEntity,
  docClient,
  DUCK_HUNT_TABLE_NAME,
  getCurrentTimestamp,
  getEpochTimestamp,
} from ".";

export interface Message extends BaseEntity {
  user_id: string;
  team_id: string;
  game_id: string;
  level_id: string;
  role: string;
  content: string;
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
        TableName: DUCK_HUNT_TABLE_NAME,
        Item: item,
      })
    );

    return message;
  }

  static async softDeleteCurrentLevelMessages(
    userId: string,
    levelId: string
  ): Promise<void> {
    const timestamp = getEpochTimestamp();
    const sortKeyPrefix = `MESSAGE#`;

    const result = await docClient.send(
      new QueryCommand({
        TableName: DUCK_HUNT_TABLE_NAME,
        IndexName: "GSI3",
        KeyConditionExpression: "GSI3PK = :gsi3pk AND begins_with(GSI3SK, :sk)",
        ExpressionAttributeValues: {
          ":gsi3pk": `LEVEL#${levelId}`,
          ":sk": sortKeyPrefix,
        },
      })
    );

    if (!result.Items || result.Items.length === 0) {
      console.warn(
        `No messages found for user ${userId} at level ${levelId} to soft delete.`
      );
      return;
    }

    const { UpdateCommand } = await import("@aws-sdk/lib-dynamodb");
    const updatePromises = result.Items.map((item) => {
      return docClient.send(
        new UpdateCommand({
          TableName: DUCK_HUNT_TABLE_NAME,
          Key: {
            PK: item.PK,
            SK: item.SK,
          },
          UpdateExpression: "SET deleted_at = :deletedAt",
          ExpressionAttributeValues: {
            ":deletedAt": timestamp,
          },
        })
      );
    });

    await Promise.all(updatePromises);
  }

  static async delete(userId: string, messageId: string): Promise<void> {
    const timestamp = getEpochTimestamp();
    const sortKey = `MESSAGE#${timestamp}#${messageId}`;

    await docClient.send(
      new DeleteCommand({
        TableName: DUCK_HUNT_TABLE_NAME,
        Key: {
          PK: `USER#${userId}`,
          SK: sortKey,
        },
      })
    );
  }

  static async getForUserAtLevel(
    userId: string,
    levelId: string
  ): Promise<SharedMessage[]> {
    const sortKeyPrefix = "MESSAGE#";
    const result = await docClient.send(
      new QueryCommand({
        TableName: DUCK_HUNT_TABLE_NAME,
        IndexName: "GSI3",
        KeyConditionExpression: "GSI3PK = :gsi3pk AND begins_with(GSI3SK, :sk)",
        FilterExpression: "PK = :pk AND attribute_not_exists(deleted_at)",
        ExpressionAttributeValues: {
          ":gsi3pk": `LEVEL#${levelId}`,
          ":sk": sortKeyPrefix,
          ":pk": `USER#${userId}`,
        },
      })
    );

    console.log("INFO: Fetched messages for user at level:", {
      userId,
      levelId,
      count: result.Count,
    });

    return (
      result.Items?.map((item) => {
        const { id, created_at, role, content } = item;

        console.log("DEBUG: DynamoDB Message item:", item);

        return {
          id,
          createdAt: created_at,
          role,
          content,
        };
      }) || []
    );
  }

  static async getFirstMessageForTeamAndLevel(
    teamId: string,
    levelId: string
  ): Promise<SharedMessage | null> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: DUCK_HUNT_TABLE_NAME,
        IndexName: "GSI1",
        KeyConditionExpression:
          "GSI1PK = :gsi1pk AND begins_with(GSI1SK, :gsi1sk)",
        FilterExpression: "GSI2PK = :gsi2pk",
        ExpressionAttributeValues: {
          ":gsi1pk": `TEAM#${teamId}`,
          ":gsi1sk": "MESSAGE#",
          ":gsi2pk": `GAME#${levelId}`,
        },
      })
    );

    const sortedItems = result.Items?.sort((a, b) => {
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });

    console.log("INFO: Sorted messages for team at level:", sortedItems);

    if (!sortedItems || sortedItems.length === 0) {
      console.warn(`No messages found for team ${teamId} at level ${levelId}.`);
      return null;
    }

    const firstMessage = sortedItems[0];
    return {
      id: firstMessage.id,
      createdAt: firstMessage.created_at,
      role: firstMessage.role,
      content: firstMessage.content,
    };
  }
}
