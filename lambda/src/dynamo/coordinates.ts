import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import {
  BaseEntity,
  docClient,
  DUCK_HUNT_TABLE_NAME,
  getCurrentTimestamp,
  getEpochTimestamp,
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
    const sortKey = `COORDINATE_SNAPSHOT#${timestamp}#${coordinate.id}`;

    const item = {
      PK: `USER#${coordinate.user_id}`,
      SK: sortKey,
      GSI1PK: `TEAM#${coordinate.team_id}`,
      GSI1SK: sortKey,
      ItemType: "COORDINATE_SNAPSHOT",
      ...coordinate,
    };

    await docClient.send(
      new PutCommand({
        TableName: DUCK_HUNT_TABLE_NAME,
        Item: item,
      })
    );

    return coordinate;
  }
}
