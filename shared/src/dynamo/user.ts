import { BaseEntity, docClient, getCurrentTimestamp, TABLE_NAME } from ".";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

export interface User extends BaseEntity {
  team_id: string;
}

// USER Operations
export class UserOperations {
  static async create(
    userData: Omit<User, "id" | "created_at" | "updated_at">
  ): Promise<User> {
    const user: User = {
      id: uuidv4(),
      created_at: getCurrentTimestamp(),
      updated_at: getCurrentTimestamp(),
      ...userData,
    };

    const item = {
      PK: `TEAM#\${user.team_id}`,
      SK: `USER#\${user.id}`,
      GSI1PK: `USER#\${user.id}`,
      GSI1SK: "#METADATA",
      ItemType: "USER",
      ...user,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      })
    );

    return user;
  }

  static async getById(userId: string): Promise<User | null> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :gsi1pk",
        ExpressionAttributeValues: {
          ":gsi1pk": `USER#\${userId}`,
        },
      })
    );

    if (!result.Items || result.Items.length === 0) return null;

    const { PK, SK, GSI1PK, GSI1SK, ItemType, ...user } = result.Items[0];
    return user as User;
  }

  static async getByTeamId(teamId: string): Promise<User[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `TEAM#\${teamId}`,
          ":sk": "USER#",
        },
      })
    );

    return (
      result.Items?.map((item) => {
        const { PK, SK, GSI1PK, GSI1SK, ItemType, ...user } = item;
        return user as User;
      }) || []
    );
  }

  static async update(
    teamId: string,
    userId: string,
    updates: Partial<Omit<User, "id" | "created_at" | "team_id">>
  ): Promise<User> {
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
          SK: `USER#\${userId}`,
        },
        UpdateExpression: `SET \${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "ALL_NEW",
      })
    );

    const { PK, SK, GSI1PK, GSI1SK, ItemType, ...user } = result.Attributes!;
    return user as User;
  }

  static async delete(teamId: string, userId: string): Promise<void> {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `TEAM#\${teamId}`,
          SK: `USER#\${userId}`,
        },
      })
    );
  }
}
