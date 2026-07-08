// Bedrock / AI Config

export const bedrockConfig = {
  temperature: 0.7,
  defaultMaxTokens: 512,
  // Used if a level's position has no model mapping (e.g. more levels than
  // entries in levelModels, or an out-of-range index).
  fallbackModelId: "us.amazon.nova-lite-v1:0",
} as const;

/**
 * Fixed model per level POSITION, shared by all teams. Indexed by the team's
 * route order (TEAM_LEVEL.index, 0-based): entry [0] is every team's 1st stop,
 * entry [1] the 2nd, ... and the last entry is the shared final level.
 *
 * The physical location at each position differs per team (routes are
 * randomized), but the MODEL is the same for a given position across all teams.
 *
 * NOTE: these must be exact Bedrock model / inference-profile IDs enabled
 * (and, for third-party models, marketplace-subscribed) in your account and
 * region, or Converse returns AccessDenied / ValidationException.
 */
export const levelModels: readonly string[] = [
  "google.gemma-3-27b-it", // Level 1
  "meta.llama3-70b-instruct-v1:0", // Level 2
  "us.amazon.nova-lite-v1:0", // Level 3
  "zai.glm-4.7", // Level 4
  "us.anthropic.claude-sonnet-4-6", // Level 5 (shared final)
] as const;



// Adaptive hint timing Config

/**
 * Time thresholds (in minutes) that drive the adaptive hint system,
 * measured from the team's first message at the current level:
 *   - below `easyClueThresholdMin`            -> normal AI response
 *   - between the two thresholds              -> a random easy clue
 *   - above `mapLinkThresholdMin`             -> the location's map link
 */
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
