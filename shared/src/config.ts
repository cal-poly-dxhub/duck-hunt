// Bedrock / AI Config

export const bedrockConfig = {
  temperature: 0.7,
  defaultMaxTokens: 512,
  // Used only if a team somehow has no assigned model and assignment fails.
  fallbackModelId: "us.amazon.nova-2-lite-v1:0",
} as const;

/**
 * Model roulette pool. Each team is randomly assigned ONE of these on its
 * first Bedrock call, and keeps it for the rest of the game (see
 * TeamOperations.getOrAssignModel). Models are invoked via the Bedrock
 * Converse API, which normalizes requests/responses across providers, so the
 * pool can mix Anthropic, Meta, OpenAI-OSS, DeepSeek, Moonshot, Z.ai, etc.
 *
 * NOTE: these IDs must be exact Bedrock model / inference-profile IDs that are
 * enabled (and, for third-party models, marketplace-subscribed) in your
 * account and region, or InvokeModel/Converse will return an AccessDenied /
 * ValidationException for that team.
 */
export const modelRoulettePool: readonly string[] = [
  "us.amazon.nova-2-lite-v1:0",
  // "zai.glm-4.7",
  // "mistral.mistral-large-3-675b-instruct",
  "us.amazon.nova-micro-v1:0",
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
