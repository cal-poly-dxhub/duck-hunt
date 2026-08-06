import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { bedrockConfig, modelMinMaxTokens } from "@shared/config";
import { stripReasoning } from "@shared/scripts";
import { Message, MessageRole, UUID } from "@shared/types";
import { v4 } from "uuid";
import { LevelOperations } from "./dynamo/level";
import { MessageOperations } from "./dynamo/message";
import { TeamLevelOperations } from "./dynamo/teamLevel";

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-west-2",
});

export interface InvokeBedrockPersistToDynamoProps {
  userId: UUID;
  teamId: UUID;
  levelId: UUID;
  gameId: UUID;
  newUserMessage: Message<MessageRole.User>;
}

export interface InvokeBedrockProps {
  levelId: UUID;
  modelId: string;
  messageHistory: Array<Message>;
}

export interface InvokeBedrockResponse {
  bedrockResponseMessage: Message<MessageRole.Assistant>;
  /** True when the response is a hardcoded fallback (model invocation failed). */
  isFallback?: boolean;
}

/**
 * Build a comprehensive system prompt using level data
 */
const buildSystemPrompt = (levelData: any): string => {
  const { character, location, clues, easyClues } = levelData;

  let systemPrompt = character.systemPrompt;

  // Add location context
  if (location) {
    systemPrompt += ` You are currently at ${location.description}. Do not give away this location under any circumstances.`;
  }

  // Add game context
  systemPrompt += ` You are participating in a scavenger hunt game where players need to find specific locations across Cal Poly SLO Campus.`;

  // Add clue context for the character to reference
  if (clues && clues.length > 0) {
    systemPrompt += ` The main clues for this location are: ${clues.join(
      ", "
    )}.`;
  }

  if (easyClues && easyClues.length > 0) {
    systemPrompt += ` If players seem stuck, you can provide easier hints like: ${easyClues.join(
      ", "
    )}.`;
  }

  // Simple instructions for brevity and character consistency
  systemPrompt += ` Keep your responses to 1-2 sentences. Be concise and engaging. Stay in character and focus on the scavenger hunt adventure. If players try unusual requests, respond as your character would naturally react.`;

  return systemPrompt;
};

/**
 * Invoke a Bedrock model via the Converse API. Converse normalizes the
 * request/response shape across model providers, so the same code path works
 * for the mixed per-level model set (Anthropic, Meta, OpenAI-OSS, Z.ai,
 * Amazon Nova, ...).
 */
const invokeBedrock = async ({
  levelId,
  modelId,
  messageHistory,
}: InvokeBedrockProps): Promise<InvokeBedrockResponse> => {
  const nextMessageId = v4() as UUID;

  try {
    const levelData = await LevelOperations.getByLevelId(levelId);

    if (!levelData) {
      throw new Error(`Level not found for ID: ${levelId}`);
    }

    const systemPrompt = buildSystemPrompt(levelData);
    // Raise to the model's floor: reasoning models truncate before emitting text at 512.
    const maxTokens = Math.max(
      levelData.max_tokens || bedrockConfig.defaultMaxTokens,
      modelMinMaxTokens[modelId] ?? 0
    );

    // Converse expects messages as { role, content: [{ text }] }.
    let messages = messageHistory.map((msg) => ({
      role: (msg.role === MessageRole.User ? "user" : "assistant") as
        | "user"
        | "assistant",
      content: [{ text: msg.content }],
    }));

    // Some models (e.g. Meta Llama 3) strictly require the conversation to
    // START with a user message and reject a leading assistant turn with
    // "A conversation must start with a user message." Drop any leading
    // assistant message(s) so history always begins with a user turn.
    while (messages.length > 0 && messages[0].role === "assistant") {
      messages = messages.slice(1);
    }

    const command = new ConverseCommand({
      modelId,
      system: [{ text: systemPrompt }],
      messages,
      inferenceConfig: {
        maxTokens,
        temperature: bedrockConfig.temperature,
      },
    });

    const response = await bedrockClient.send(command);

    // Extract the response text — ONLY from genuine `text` blocks. Reasoning
    // models return their chain-of-thought in separate `reasoningContent`
    // blocks; we must NEVER surface that to players. If a model returns only
    // reasoning (e.g. it was truncated before emitting the final answer), we
    // treat it as a failed invocation → fallback, rather than leaking the
    // internal monologue.
    const contentBlocks = response.output?.message?.content ?? [];
    let text: string | undefined;
    for (const block of contentBlocks) {
      if (block.text) {
        text = block.text;
        break;
      }
    }
    if (!text) {
      throw new Error(
        "Invalid response format from Bedrock Converse: no text block " +
          "(model may have returned only reasoning or been truncated)"
      );
    }

    // Strip any inline <think>...</think> reasoning so players only see the
    // final answer. If nothing remains (e.g. the answer was cut off while
    // still reasoning), treat it as a failed invocation → fallback.
    const cleanedText = stripReasoning(text);
    if (!cleanedText) {
      throw new Error(
        "Model returned only reasoning with no final answer (possibly truncated)"
      );
    }

    const responseMessage: Message<MessageRole.Assistant> = {
      id: nextMessageId,
      role: MessageRole.Assistant,
      content: cleanedText,
      createdAt: new Date(),
    };

    console.log(
      `INFO: Successfully invoked ${modelId} for level ${levelId} with character: ${levelData.character.name}`
    );

    return {
      bedrockResponseMessage: responseMessage,
    };
  } catch (error) {
    console.error(
      `ERROR: Bedrock invocation failed for level ${levelId} (model ${modelId}):`,
      error
    );

    const fallbackMessage: Message<MessageRole.Assistant> = {
      id: nextMessageId,
      role: MessageRole.Assistant,
      content:
        "I'm experiencing technical difficulties right now. Please try again in a moment.",
      createdAt: new Date(),
    };

    return {
      bedrockResponseMessage: fallbackMessage,
      isFallback: true,
    };
  }
};

export const invokeBedrockPersistToDynamo = async ({
  gameId,
  levelId,
  userId,
  teamId,
  newUserMessage,
}: InvokeBedrockPersistToDynamoProps): Promise<InvokeBedrockResponse> => {
  try {
    // Fixed model per level position (same mapping for all teams). Resolved
    // from the team's route order; self-falls back internally on any error.
    const modelId = await TeamLevelOperations.getModelForLevel(teamId, levelId);

    // Get existing message history from DynamoDB
    let messageHistory: Array<Message> = [];

    try {
      messageHistory = await MessageOperations.getForUserAtLevel(
        userId,
        levelId
      );
    } catch (error) {
      console.warn(
        `Could not retrieve message history for level ${levelId}:`,
        error
      );
      // Continue with empty message history
    }

    // Persist new user message to DynamoDB
    try {
      await MessageOperations.create({
        game_id: gameId,
        user_id: userId,
        team_id: teamId,
        level_id: levelId,
        content: newUserMessage.content,
        role: newUserMessage.role,
      });
      messageHistory.push(newUserMessage);

      console.log(`INFO: Persisted user message for level ${levelId}`);
    } catch (error) {
      console.error(
        `ERROR: Failed to persist user message for level ${levelId}:`,
        error
      );
      // Continue anyway - we'll still try to get a response from the model
    }

    // Invoke the team's model with the message history
    const { bedrockResponseMessage, isFallback } = await invokeBedrock({
      levelId,
      modelId,
      messageHistory,
    });

    // Persist even fallbacks: an unpersisted reply leaves consecutive user turns, which Converse rejects.
    try {
      await MessageOperations.create({
        game_id: gameId,
        user_id: userId,
        team_id: teamId,
        level_id: levelId,
        content: bedrockResponseMessage.content,
        role: bedrockResponseMessage.role,
        ...(isFallback ? { is_fallback: true } : {}),
      });
      console.log(
        `INFO: Persisted model response message for level ${levelId}`
      );
    } catch (error) {
      console.error(
        `ERROR: Failed to persist model response message for level ${levelId}:`,
        error
      );
    }

    return { bedrockResponseMessage };
  } catch (error) {
    console.error(
      `ERROR: invokeBedrockPersistToDynamo failed for level ${levelId}:`,
      error
    );

    // Return a hardcoded fallback response
    const fallbackMessage: Message<MessageRole.Assistant> = {
      id: v4() as UUID,
      role: MessageRole.Assistant,
      content:
        "I'm experiencing technical difficulties right now. Please try again in a moment.",
      createdAt: new Date(),
    };

    return {
      bedrockResponseMessage: fallbackMessage,
    };
  }
};
