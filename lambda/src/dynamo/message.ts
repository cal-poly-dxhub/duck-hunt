import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
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

  static async getForUserAtLevel(
    userId: string,
    levelId: string
  ): Promise<SharedMessage[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: DUCK_HUNT_TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        // TODO: Filter out deleted messages
        // FilterExpression: "attribute_not_exists(deleted_at)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
          ":sk": `MESSAGE#${levelId}#`,
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
}
