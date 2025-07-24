import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { Message, MessageOperations } from "./message";
import { Photo, PhotoOperations } from "./photo";
import {
  CoordinateSnapshot,
  CoordinateSnapshotOperations,
} from "./coordinates";
import { TeamLevel, TeamLevelOperations } from "./teamLevel";
import { Game, GameOperations } from "./game";
import { Level, LevelOperations } from "./level";
import { Team, TeamOperations } from "./team";
import { User, UserOperations } from "./user";

// Environment variable for table name
export const DUCK_HUNT_TABLE_NAME = process.env.DUCK_HUNT_TABLE_NAME;

// Initialize DynamoDB client
export const client = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(client);

// Utility functions
export const getCurrentTimestamp = (): string => new Date().toISOString();
export const getEpochTimestamp = (): number => Math.floor(Date.now() / 1000);

export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
  deleted_at?: number;
}

// Utility class for complex queries
export class QueryUtils {
  // Get game with all its levels and teams
  static async getGameWithDetails(gameId: string): Promise<{
    game: Game | null;
    levels: Level[];
    teams: Team[];
  }> {
    const [game, levels, teams] = await Promise.all([
      GameOperations.getById(gameId),
      LevelOperations.getByGameId(gameId),
      TeamOperations.getByGameId(gameId),
    ]);

    return { game, levels, teams };
  }

  // Get team with all its users and progress
  static async getTeamWithDetails(
    gameId: string,
    teamId: string
  ): Promise<{
    team: Team | null;
    users: User[];
    progress: TeamLevel[];
  }> {
    const [team, users, progress] = await Promise.all([
      TeamOperations.getById(gameId, teamId),
      UserOperations.getByTeamId(teamId),
      TeamLevelOperations.getByTeamId(teamId),
    ]);

    return { team, users, progress };
  }

  // Get recent activity for a team (messages, photos, coordinates)
  static async getTeamActivity(
    teamId: string,
    limit: number = 50
  ): Promise<{
    messages: Message[];
    photos: Photo[];
    coordinates: CoordinateSnapshot[];
  }> {
    const [messages, photos, coordinates] = await Promise.all([
      MessageOperations.getByTeamId(teamId, limit),
      PhotoOperations.getByTeamId(teamId, limit),
      CoordinateSnapshotOperations.getByTeamId(teamId, limit),
    ]);

    return { messages, photos, coordinates };
  }

  // Batch operations for efficiency
  static async batchCreateTeamLevels(
    teamId: string,
    levelIds: string[]
  ): Promise<TeamLevel[]> {
    const teamLevels = levelIds.map((levelId, index) => ({
      team_id: teamId,
      level_id: levelId,
      index,
    }));

    const results = await Promise.all(
      teamLevels.map((teamLevel) => TeamLevelOperations.create(teamLevel))
    );

    return results;
  }
}
