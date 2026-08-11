// Bedrock / AI Config

export const bedrockConfig = {
  temperature: 0.7,
  defaultMaxTokens: 512,
  // Used when a level's position has no model mapping.
  fallbackModelId: "us.amazon.nova-lite-v1:0",
} as const;

/** Output-token floor per model: reasoning models spend tokens thinking before any text. */
export const modelMinMaxTokens: Readonly<Record<string, number>> = {
  "zai.glm-4.7": 2048,
};

/** Model per level POSITION (0-based route order); must be IDs enabled in your account. */
export const levelModels: readonly string[] = [
  "google.gemma-3-27b-it", // Level 1
  "meta.llama3-70b-instruct-v1:0", // Level 2
  "us.amazon.nova-lite-v1:0", // Level 3
  "zai.glm-4.7", // Level 4
  "us.anthropic.claude-sonnet-4-6", // Level 5 (shared final)
] as const;



// Adaptive hint timing Config

/** Minutes from a team's first message at a level: normal -> easy clue -> map link. */
export const levelTimeConfig = {
  easyClueThresholdMin: 10,
  mapLinkThresholdMin: 15,
} as const;

// Photos Config

export const photoConfig = {
  buildPhotoUrl: (bucket: string, key: string): string =>
    `https://${bucket}.s3.amazonaws.com/${key}`,
} as const;

// Frontend Config

export const frontendConfig = {
  /** How often (ms) the client pings its GPS coordinates to the backend. */
  coordinatePingIntervalMs: 10000,
} as const;
