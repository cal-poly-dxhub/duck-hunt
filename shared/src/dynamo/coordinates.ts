import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import {
  BaseEntity,
  docClient,
  getCurrentTimestamp,
  getEpochTimestamp,
  TABLE_NAME,
} from ".";

export interface CoordinateSnapshot extends BaseEntity {
  user_id: string;
  team_id: string;
  latitude: number;
  longitude: number;
}

// COORDINATE_SNAPSHOT Operations
export class CoordinateSnapshotOperations {
  static async create(
    coordinateData: Omit<CoordinateSnapshot, "id" | "created_at" | "updated_at">
  ): Promise<CoordinateSnapshot> {
    const coordinate: CoordinateSnapshot = {
      id: uuidv4(),
      created_at: getCurrentTimestamp(),
      updated_at: getCurrentTimestamp(),
      ...coordinateData,
    };

    const timestamp = getEpochTimestamp();
    const sortKey = `COORDINATE_SNAPSHOT#\${timestamp}#\${coordinate.id}`;

    const item = {
      PK: `USER#\${coordinate.user_id}`,
      SK: sortKey,
      GSI1PK: `TEAM#\${coordinate.team_id}`,
      GSI1SK: sortKey,
      ItemType: "COORDINATE_SNAPSHOT",
      ...coordinate,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      })
    );

    return coordinate;
  }

  static async getByUserId(
    userId: string,
    limit?: number
  ): Promise<CoordinateSnapshot[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `USER#\${userId}`,
          ":sk": "COORDINATE_SNAPSHOT#",
        },
        ScanIndexForward: false,
        Limit: limit,
      })
    );

    return (
      result.Items?.map((item) => {
        const { PK, SK, GSI1PK, GSI1SK, ItemType, ...coordinate } = item;
        return coordinate as CoordinateSnapshot;
      }) || []
    );
  }

  static async getByTeamId(
    teamId: string,
    limit?: number
  ): Promise<CoordinateSnapshot[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI1",
        KeyConditionExpression:
          "GSI1PK = :gsi1pk AND begins_with(GSI1SK, :gsi1sk)",
        ExpressionAttributeValues: {
          ":gsi1pk": `TEAM#\${teamId}`,
          ":gsi1sk": "COORDINATE_SNAPSHOT#",
        },
        ScanIndexForward: false,
        Limit: limit,
      })
    );

    return (
      result.Items?.map((item) => {
        const { PK, SK, GSI1PK, GSI1SK, ItemType, ...coordinate } = item;
        return coordinate as CoordinateSnapshot;
      }) || []
    );
  }

  static async getLatestByUserId(
    userId: string
  ): Promise<CoordinateSnapshot | null> {
    const coordinates = await this.getByUserId(userId, 1);
    return coordinates.length > 0 ? coordinates[0] : null;
  }

  static async getLatestByTeamId(
    teamId: string
  ): Promise<CoordinateSnapshot[]> {
    return await this.getByTeamId(teamId, 10); // Get latest 10 coordinates for the team
  }
}
