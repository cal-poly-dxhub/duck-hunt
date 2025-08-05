import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { S3Event } from "aws-lambda";
import { v4 as uuidv4 } from "uuid";
import { Game, GameOperations } from "./dynamo/game";
import { Level, LevelOperations } from "./dynamo/level";
import { Team, TeamOperations } from "./dynamo/team";
import { TeamLevelOperations } from "./dynamo/teamLevel";

const s3Client = new S3Client({});

// Validation interfaces - matching schema exactly

interface ValidationError {
  field: string;
  message: string;
}

class GameConfigValidator {
  private errors: ValidationError[] = [];

  validate(config: any): Omit<Game, "created_at" | "updated_at"> {
    this.errors = [];

    // Validate root object
    if (!config || typeof config !== "object") {
      throw new Error("Config must be a valid object");
    }

    // Validate teams array (REQUIRED)
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

    // Validate levels array (REQUIRED)
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

    // Validate levelsInGame (OPTIONAL)
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

    if (this.errors.length > 0) {
      throw new Error(
        `Validation failed: ${this.errors
          .map((e) => `${e.field}: ${e.message}`)
          .join("; ")}`
      );
    }

    // Set defaults and return validated config
    return {
      id: config.id || uuidv4(),
      teams: config.teams.map((team: any) => ({
        ...team,
        id: team.id || uuidv4(),
      })),
      levelsInGame: config.levelsInGame ?? config.levels.length,
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

    // name is REQUIRED
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
  }

  private validateLevel(level: any, index: number): void {
    const prefix = `levels[${index}]`;

    if (!level || typeof level !== "object") {
      this.addError(prefix, "Level must be an object");
      return;
    }

    // levelName is REQUIRED
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

    // mapLink is REQUIRED
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

    // max_tokens is REQUIRED and must be positive integer
    if (!Number.isInteger(level.max_tokens) || level.max_tokens <= 0) {
      this.addError(
        `${prefix}.max_tokens`,
        "max_tokens must be a positive integer"
      );
    }

    // character object is REQUIRED
    if (!level.character || typeof level.character !== "object") {
      this.addError(`${prefix}.character`, "Character object is required");
    } else {
      // character.name is REQUIRED
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

      // character.systemPrompt is REQUIRED
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

    // location object is REQUIRED
    if (!level.location || typeof level.location !== "object") {
      this.addError(`${prefix}.location`, "Location object is required");
    } else {
      // location.description is REQUIRED
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

      // location.latitude is REQUIRED and must be valid range
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

      // location.longitude is REQUIRED and must be valid range
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

    // clues array is REQUIRED with at least 3 elements
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

    // easyClues array is REQUIRED with at least 2 elements
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

    // Create the game - only with levelsInGame field according to DynamoDB schema
    const game = await GameOperations.create({
      ...validatedConfig,
      levelsInGame:
        validatedConfig.levelsInGame ?? validatedConfig.levels.length,
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
        })
      )
    );
    console.log(`INFO: Created ${createdTeams.length} teams`);

    // Create team-level assignments
    const teamLevelAssignments = await this.createTeamLevelAssignments(
      createdTeams,
      createdLevels,
      validatedConfig.levelsInGame ?? validatedConfig.levels.length
    );

    // Log URLs and level occurrence counts
    this.logGameUrls(createdTeams, createdLevels, teamLevelAssignments);

    return {
      gameId: game.id,
      message: `Successfully created game with ${createdTeams.length} teams and ${createdLevels.length} levels`,
    };
  }

  private async createTeamLevelAssignments(
    teams: Team[],
    levels: Level[],
    levelsInGame: number
  ): Promise<{ teamId: string; levelId: string; index: number }[]> {
    console.log("INFO: Creating team-level assignments");

    // The last level is the final level for all teams
    const finalLevel = levels[levels.length - 1];
    const availableLevels = levels.slice(0, -1); // All levels except the final one
    const allAssignments: { teamId: string; levelId: string; index: number }[] =
      [];

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

      // Track assignments for URL logging
      teamLevels.forEach((level, index) => {
        allAssignments.push({
          teamId: team.id,
          levelId: level.id,
          index: index,
        });
      });

      console.log(
        `INFO: Created ${teamLevels.length} level assignments for team ${team.name}`
      );
    }

    return allAssignments;
  }

  private logGameUrls(
    teams: Team[],
    levels: Level[],
    teamLevelAssignments: { teamId: string; levelId: string; index: number }[]
  ): void {
    console.log("==============================================");
    console.log("Game ID:", teams[0].game_id);

    // Log team URLs
    console.log("TEAM URLS:");
    teams.forEach((team) => {
      console.log(
        `team ${team.name} url: https://${process.env.FRONTEND_CLOUDFRONT_URL}?team-id=${team.id}`
      );
    });

    console.log("");

    // Count level occurrences
    const levelOccurrences = new Map<string, number>();
    teamLevelAssignments.forEach((assignment) => {
      const currentCount = levelOccurrences.get(assignment.levelId) || 0;
      levelOccurrences.set(assignment.levelId, currentCount + 1);
    });

    // Log level URLs with occurrence counts and level names
    console.log("LEVEL URLS:");
    levels.forEach((level) => {
      const occurrences = levelOccurrences.get(level.id) || 0;
      console.log(
        `level ${level.levelName} url: https://${process.env.FRONTEND_CLOUDFRONT_URL}?level-id=${level.id} x${occurrences} occurrences`
      );
    });

    // now create a json object of all the data and log it

    const gameData = {
      gameId: teams[0].game_id,
      teams: teams.map((team) => ({
        id: team.id,
        name: team.name,
        url: `${process.env.FRONTEND_CLOUDFRONT_URL}?team-id=${team.id}`,
      })),
      levels: levels.map((level) => ({
        id: level.id,
        name: level.levelName,
        url: `${process.env.FRONTEND_CLOUDFRONT_URL}?level-id=${level.id}`,
        occurrences: levelOccurrences.get(level.id) || 0,
      })),
    };

    console.log("==============================================");
    console.log("Game Data:", JSON.stringify(gameData, null, 2));
    console.log("==============================================");
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
