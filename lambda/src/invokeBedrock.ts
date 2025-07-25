import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { Message, MessageRole, UUID } from "@shared/types";
import { v4 } from "uuid";
import { LevelOperations } from "./dynamo/level";
import { MessageOperations } from "./dynamo/message";

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-west-2",
});

const MODEL_ID = "anthropic.claude-3-5-haiku-20241022-v1:0";

export interface InvokeBedrockPersistToDynamoProps {
  userId: UUID;
  teamId: UUID;
  levelId: UUID;
  gameId: UUID;
  newUserMessage: Message<MessageRole.User>;
}

export interface InvokeBedrockProps {
  levelId: UUID;
  messageHistory: Array<Message>;
}

export interface InvokeBedrockResponse {
  bedrockResponseMessage: Message<MessageRole.Assistant>;
}

/**
 * Build a comprehensive system prompt using level data
 */
const buildSystemPrompt = (levelData: any): string => {
  const { character, location, clues, easyClues } = levelData;

  let systemPrompt = character.systemPrompt;

  // Add location context
  if (location) {
    systemPrompt += ` You are currently at ${location.description}.`;
  }

  // Add game context
  systemPrompt += ` You are participating in a scavenger hunt game where players need to find specific locations and solve clues.`;

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

  systemPrompt += ` Stay in character while helping players with their scavenger hunt adventure. Be engaging and provide helpful guidance without giving away answers too easily.`;

  return systemPrompt;
};

/**
 * Invoke bedrock with message history and system prompt from s3
 */
const invokeBedrock = async ({
  levelId,
  messageHistory,
}: InvokeBedrockProps): Promise<InvokeBedrockResponse> => {
  const nextMessageId = v4() as UUID;

  try {
    const levelData = await LevelOperations.getByLevelId(levelId);

    if (!levelData) {
      // TODO: Return a clue from dynamo if level not found
      throw new Error(`Level not found for ID: ${levelId}`);
    }

    const systemPrompt = buildSystemPrompt(levelData);
    const maxTokens = levelData.max_tokens || 512;

    const messages = messageHistory.map((msg) => ({
      role: msg.role === MessageRole.User ? "user" : "assistant",
      content: msg.content,
    }));

    const requestBody = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: messages,
      temperature: 0.7,
    };

    const command = new InvokeModelCommand({
      modelId: MODEL_ID,
      body: JSON.stringify(requestBody),
      contentType: "application/json",
      accept: "application/json",
    });

    const response = await bedrockClient.send(command);

    if (!response.body) {
      throw new Error("No response body from Bedrock");
    }

    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    if (
      !responseBody.content ||
      !responseBody.content[0] ||
      !responseBody.content[0].text
    ) {
      throw new Error("Invalid response format from Bedrock");
    }

    const responseMessage: Message<MessageRole.Assistant> = {
      id: nextMessageId,
      role: MessageRole.Assistant,
      content: responseBody.content[0].text,
      createdAt: new Date(),
    };

    console.log(
      `INFO: Successfully invoked Bedrock for level ${levelId} with character: ${levelData.character.name}`
    );

    return {
      bedrockResponseMessage: responseMessage,
    };
  } catch (error) {
    console.error(
      `ERROR: Bedrock invocation failed for level ${levelId}:`,
      error
    );

    // TODO: If dynamo error, return hardcoded response
    const fallbackMessage: Message<MessageRole.Assistant> = {
      id: nextMessageId,
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

export const invokeBedrockPersistToDynamo = async ({
  gameId,
  levelId,
  userId,
  teamId,
  newUserMessage,
}: InvokeBedrockPersistToDynamoProps): Promise<InvokeBedrockResponse> => {
  try {
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
      // Continue anyway - we'll still try to get a response from Bedrock
    }

    // Invoke Bedrock with the message history
    const { bedrockResponseMessage } = await invokeBedrock({
      levelId,
      messageHistory,
    });

    // Persist Bedrock's response message to DynamoDB (regardless of whether it failed)
    try {
      await MessageOperations.create({
        game_id: gameId,
        user_id: userId,
        team_id: teamId,
        level_id: levelId,
        content: bedrockResponseMessage.content,
        role: bedrockResponseMessage.role,
      });
      console.log(
        `INFO: Persisted Bedrock response message for level ${levelId}`
      );
    } catch (error) {
      console.error(
        `ERROR: Failed to persist Bedrock response message for level ${levelId}:`,
        error
      );
      // Don't fail the entire operation if we can't persist the response
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
