import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { Message, MessageRole, UUID } from "@shared/types";
import { LevelOperations } from "./dynamo/level";

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-west-2", // Default to us-west-2 for Claude 3.5 Haiku
});

const MODEL_ID = "anthropic.claude-3-5-haiku-20241022-v1:0";

export interface InvokeBedrockProps {
  levelId: UUID;
  messageHistory: Array<Message>;
}

export interface InvokeBedrockResponse {
  bedrockResponseMessage: Message<MessageRole.Assistant>; // {id} is latest id + 1
  bedrockFailed: boolean;
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
 * @param InvokeBedrockProps {InvokeBedrockProps}
 * @returns InvokeBedrockResponse {InvokeBedrockResponse}
 */
export const invokeBedrock = async ({
  levelId,
  messageHistory,
}: InvokeBedrockProps): Promise<InvokeBedrockResponse> => {
  try {
    // Get the last message ID for generating the next message ID
    const lastMessage =
      messageHistory.length > 0
        ? messageHistory[messageHistory.length - 1]
        : null;
    const nextMessageId = lastMessage ? lastMessage.id + 1 : 1;

    // Retrieve level data from DynamoDB using levelId
    const levelData = await LevelOperations.getByLevelId(levelId);

    if (!levelData) {
      throw new Error(`Level not found for ID: ${levelId}`);
    }

    // Build comprehensive system prompt from level data
    const systemPrompt = buildSystemPrompt(levelData);

    // Get max_tokens from level configuration, default to 512
    const maxTokens = levelData.max_tokens || 512;

    // Convert message history to Claude format
    const messages = messageHistory.map((msg) => ({
      role: msg.role === MessageRole.User ? "user" : "assistant",
      content: msg.content,
    }));

    // Prepare the request body for Claude 3.5 Haiku
    const requestBody = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: messages,
      temperature: 0.7,
    };

    // Invoke Bedrock with Claude 3.5 Haiku
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

    // Parse the response
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
      `Successfully invoked Bedrock for level ${levelId} with character: ${levelData.character.name}`
    );

    return {
      bedrockResponseMessage: responseMessage,
      bedrockFailed: false,
    };
  } catch (error) {
    console.error(`Bedrock invocation failed for level ${levelId}:`, error);

    // Return a fallback message on failure
    const lastMessage =
      messageHistory.length > 0
        ? messageHistory[messageHistory.length - 1]
        : null;
    const nextMessageId = lastMessage ? lastMessage.id + 1 : 1;

    const fallbackMessage: Message<MessageRole.Assistant> = {
      id: nextMessageId,
      role: MessageRole.Assistant,
      content:
        "I'm experiencing technical difficulties right now. Please try again in a moment.",
      createdAt: new Date(),
    };

    return {
      bedrockResponseMessage: fallbackMessage,
      bedrockFailed: true,
    };
  }
};
