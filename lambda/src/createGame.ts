import { S3Event } from "aws-lambda";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4, validate as validateUUID } from "uuid";
import { GameOperations } from "./dynamo/game";
import { TeamOperations } from "./dynamo/team";
import { LevelOperations } from "./dynamo/level";
import { TeamLevelOperations } from "./dynamo/teamLevel";

const s3Client = new S3Client({});

// Validation interfaces
interface GameConfig {
  id?: string;
  name: string;
  description: string;
  teams: TeamConfig[];
  levelsInGame?: number;
  levels: LevelConfig[];
}

interface TeamConfig {
  id?: string;
  name: string;
}

interface LevelConfig {
  id?: string;
  levelName: string;
  character: {
    name: string;
    systemPrompt: string;
  };
  location: {
    description: string;
    latitude: number;
    longitude: number;
  };
  clues: string[];
  easyClues: string[];
  mapLink: string;
  max_tokens: number;
}

interface ValidationError {
  field: string;
  message: string;
}

class GameConfigValidator {
  private errors: ValidationError[] = [];

  validate(config: any): GameConfig {
    this.errors = [];

    // Validate root object
    if (!config || typeof config !== "object") {
      throw new Error("Config must be a valid object");
    }

    // Validate required fields
    if (
      !config.name ||
      typeof config.name !== "string" ||
      config.name.trim() === ""
    ) {
      this.addError(
        "name",
        "Game name is required and must be a non-empty string"
      );
    }

    if (
      !config.description ||
      typeof config.description !== "string" ||
      config.description.trim() === ""
    ) {
      this.addError(
        "description",
        "Game description is required and must be a non-empty string"
      );
    }

    // Validate teams array
    if (!Array.isArray(config.teams) || config.teams.length === 0) {
      this.addError(
        "teams",
        "Teams array is required and must contain at least one team"
      );
    } else {
      config.teams.forEach((team: any, index: number) => {
        this.validateTeam(team, index);
      });
    }

    // Validate levels array
    if (!Array.isArray(config.levels) || config.levels.length === 0) {
      this.addError(
        "levels",
        "Levels array is required and must contain at least one level"
      );
    } else {
      config.levels.forEach((level: any, index: number) => {
        this.validateLevel(level, index);
      });
    }

    // Validate levelsInGame
    if (config.levelsInGame !== undefined) {
      if (!Number.isInteger(config.levelsInGame) || config.levelsInGame <= 0) {
        this.addError(
          "levelsInGame",
          "levelsInGame must be a positive integer"
        );
      } else if (config.levels && config.levelsInGame > config.levels.length) {
        this.addError(
          "levelsInGame",
          "levelsInGame cannot be greater than the number of available levels"
        );
      }
    }

    // Validate optional ID
    if (config.id && !validateUUID(config.id)) {
      this.addError("id", "Game ID must be a valid UUIDv4");
    }

    if (this.errors.length > 0) {
      throw new Error(
        `Validation failed: ${this.errors
          .map((e) => `${e.field}: ${e.message}`)
          .join("; ")}`
      );
    }

    // Set defaults and return validated config
    return {
      ...config,
      id: config.id || uuidv4(),
      levelsInGame: config.levelsInGame || config.levels.length,
      teams: config.teams.map((team: any) => ({
        ...team,
        id: team.id || uuidv4(),
      })),
      levels: config.levels.map((level: any) => ({
        ...level,
        id: level.id || uuidv4(),
      })),
    };
  }

  private validateTeam(team: any, index: number): void {
    const prefix = `teams[${index}]`;

    if (!team || typeof team !== "object") {
      this.addError(prefix, "Team must be an object");
      return;
    }

    if (
      !team.name ||
      typeof team.name !== "string" ||
      team.name.trim() === ""
    ) {
      this.addError(
        `${prefix}.name`,
        "Team name is required and must be a non-empty string"
      );
    }

    if (team.id && !validateUUID(team.id)) {
      this.addError(`${prefix}.id`, "Team ID must be a valid UUIDv4");
    }
  }

  private validateLevel(level: any, index: number): void {
    const prefix = `levels[${index}]`;

    if (!level || typeof level !== "object") {
      this.addError(prefix, "Level must be an object");
      return;
    }

    // Validate required string fields
    if (
      !level.levelName ||
      typeof level.levelName !== "string" ||
      level.levelName.trim() === ""
    ) {
      this.addError(
        `${prefix}.levelName`,
        "Level name is required and must be a non-empty string"
      );
    }

    if (
      !level.mapLink ||
      typeof level.mapLink !== "string" ||
      level.mapLink.trim() === ""
    ) {
      this.addError(
        `${prefix}.mapLink`,
        "Map link is required and must be a non-empty string"
      );
    }

    // Validate max_tokens
    if (!Number.isInteger(level.max_tokens) || level.max_tokens <= 0) {
      this.addError(
        `${prefix}.max_tokens`,
        "max_tokens must be a positive integer"
      );
    }

    // Validate character object
    if (!level.character || typeof level.character !== "object") {
      this.addError(`${prefix}.character`, "Character object is required");
    } else {
      if (
        !level.character.name ||
        typeof level.character.name !== "string" ||
        level.character.name.trim() === ""
      ) {
        this.addError(
          `${prefix}.character.name`,
          "Character name is required and must be a non-empty string"
        );
      }
      if (
        !level.character.systemPrompt ||
        typeof level.character.systemPrompt !== "string" ||
        level.character.systemPrompt.trim() === ""
      ) {
        this.addError(
          `${prefix}.character.systemPrompt`,
          "Character system prompt is required and must be a non-empty string"
        );
      }
    }

    // Validate location object
    if (!level.location || typeof level.location !== "object") {
      this.addError(`${prefix}.location`, "Location object is required");
    } else {
      if (
        !level.location.description ||
        typeof level.location.description !== "string" ||
        level.location.description.trim() === ""
      ) {
        this.addError(
          `${prefix}.location.description`,
          "Location description is required and must be a non-empty string"
        );
      }
      if (
        typeof level.location.latitude !== "number" ||
        level.location.latitude < -90 ||
        level.location.latitude > 90
      ) {
        this.addError(
          `${prefix}.location.latitude`,
          "Latitude must be a number between -90 and 90"
        );
      }
      if (
        typeof level.location.longitude !== "number" ||
        level.location.longitude < -180 ||
        level.location.longitude > 180
      ) {
        this.addError(
          `${prefix}.location.longitude`,
          "Longitude must be a number between -180 and 180"
        );
      }
    }

    // Validate clues array
    if (!Array.isArray(level.clues) || level.clues.length < 3) {
      this.addError(
        `${prefix}.clues`,
        "Clues must be an array with at least 3 elements"
      );
    } else {
      level.clues.forEach((clue: any, clueIndex: number) => {
        if (!clue || typeof clue !== "string" || clue.trim() === "") {
          this.addError(
            `${prefix}.clues[${clueIndex}]`,
            "Each clue must be a non-empty string"
          );
        }
      });
    }

    // Validate easyClues array
    if (!Array.isArray(level.easyClues) || level.easyClues.length < 2) {
      this.addError(
        `${prefix}.easyClues`,
        "Easy clues must be an array with at least 2 elements"
      );
    } else {
      level.easyClues.forEach((clue: any, clueIndex: number) => {
        if (!clue || typeof clue !== "string" || clue.trim() === "") {
          this.addError(
            `${prefix}.easyClues[${clueIndex}]`,
            "Each easy clue must be a non-empty string"
          );
        }
      });
    }

    // Validate optional ID
    if (level.id && !validateUUID(level.id)) {
      this.addError(`${prefix}.id`, "Level ID must be a valid UUIDv4");
    }
  }

  private addError(field: string, message: string): void {
    this.errors.push({ field, message });
  }
}

class GameCreationService {
  private validator = new GameConfigValidator();

  async createGameFromConfig(
    config: any
  ): Promise<{ gameId: string; message: string }> {
    console.log("INFO: Starting game creation from config");

    // Validate the configuration
    const validatedConfig = this.validator.validate(config);
    console.log("INFO: Configuration validated successfully");

    // Create the game
    const game = await GameOperations.create({
      name: validatedConfig.name,
      description: validatedConfig.description,
      levelsInGame: validatedConfig.levelsInGame,
    });
    console.log(`INFO: Created game with ID: ${game.id}`);

    // Create all levels
    const createdLevels = await Promise.all(
      validatedConfig.levels.map((levelConfig) =>
        LevelOperations.create({
          game_id: game.id,
          levelName: levelConfig.levelName,
          character: levelConfig.character,
          location: levelConfig.location,
          clues: levelConfig.clues,
          easyClues: levelConfig.easyClues,
          mapLink: levelConfig.mapLink,
          max_tokens: levelConfig.max_tokens,
        })
      )
    );
    console.log(`INFO: Created ${createdLevels.length} levels`);

    // Create all teams
    const createdTeams = await Promise.all(
      validatedConfig.teams.map((teamConfig) =>
        TeamOperations.create({
          name: teamConfig.name,
          game_id: game.id,
          difficulty_level: "normal", // Default difficulty
        })
      )
    );
    console.log(`INFO: Created ${createdTeams.length} teams`);

    // Create team-level assignments
    await this.createTeamLevelAssignments(
      createdTeams,
      createdLevels,
      validatedConfig.levelsInGame ?? validatedConfig.levels.length
    );

    return {
      gameId: game.id,
      message: `Successfully created game "${game.name}" with ${createdTeams.length} teams and ${createdLevels.length} levels`,
    };
  }

  private async createTeamLevelAssignments(
    teams: any[],
    levels: any[],
    levelsInGame: number
  ): Promise<void> {
    console.log("INFO: Creating team-level assignments");

    // The last level is the final level for all teams
    const finalLevel = levels[levels.length - 1];
    const availableLevels = levels.slice(0, -1); // All levels except the final one

    for (const team of teams) {
      let teamLevels: any[] = [];

      if (levelsInGame === levels.length) {
        // Team plays all levels in order
        teamLevels = levels;
      } else {
        // Team gets a subset of levels plus the final level
        const levelsNeeded = levelsInGame - 1; // Subtract 1 for the final level

        if (levelsNeeded > 0) {
          // Randomly select levels from available levels (excluding final)
          const shuffledLevels = [...availableLevels].sort(
            () => Math.random() - 0.5
          );
          const selectedLevels = shuffledLevels.slice(0, levelsNeeded);
          teamLevels = [...selectedLevels, finalLevel];
        } else {
          // Only the final level
          teamLevels = [finalLevel];
        }
      }

      // Create team-level records with proper indexing
      const teamLevelPromises = teamLevels.map((level, index) =>
        TeamLevelOperations.create({
          team_id: team.id,
          level_id: level.id,
          index: index,
        })
      );

      await Promise.all(teamLevelPromises);
      console.log(
        `INFO: Created ${teamLevels.length} level assignments for team ${team.name}`
      );
    }
  }
}

/**
 * create game lambda handler
 * @param event {S3Event}
 */
export const handler = async (event: S3Event) => {
  console.log("INFO: Received event:", JSON.stringify(event, null, 2));

  try {
    const gameService = new GameCreationService();
    const results = [];

    // Process each S3 record
    for (const record of event.Records) {
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

      console.log(`INFO: Processing file: ${key} from bucket: ${bucket}`);

      // Get the file from S3
      const getObjectCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const s3Response = await s3Client.send(getObjectCommand);

      if (!s3Response.Body) {
        throw new Error(`No content found in S3 object: ${key}`);
      }

      // Read and parse the JSON content
      const fileContent = await s3Response.Body.transformToString();
      let gameConfig;

      try {
        gameConfig = JSON.parse(fileContent);
      } catch (parseError) {
        throw new Error(
          `Invalid JSON in file ${key}: ${
            parseError instanceof Error
              ? parseError.message
              : "Unknown parse error"
          }`
        );
      }

      // Create the game from the configuration
      const result = await gameService.createGameFromConfig(gameConfig);
      results.push({
        file: key,
        ...result,
      });

      console.log(
        `INFO: Successfully processed file: ${key}, Game ID: ${result.gameId}`
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Successfully processed all game configurations",
        results: results,
      }),
    };
  } catch (error) {
    console.error("ERROR: Failed to process request:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to process request",
        displayMessage: "An error occurred while creating game from config.",
        details:
          error instanceof Error
            ? error.message
            : "Error caught in createGame lambda top level catch",
      }),
    };
  }
};
