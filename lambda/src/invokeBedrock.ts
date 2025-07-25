import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  ApplyGuardrailCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { Message, MessageRole, UUID } from "@shared/types";
import { v4 } from "uuid";
import { LevelOperations } from "./dynamo/level";
import { MessageOperations } from "./dynamo/message";

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-west-2",
});

const MODEL_ID = "anthropic.claude-3-5-haiku-20241022-v1:0";

// Guardrail configuration
const GUARDRAIL_ID = process.env.GUARDRAIL_ID || "qi5egvtmehhe";
const GUARDRAIL_VERSION = process.env.GUARDRAIL_VERSION || "DRAFT";

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
 * Apply guardrails to content
 */
const applyGuardrails = async (
  content: string,
  source: "INPUT" | "OUTPUT"
): Promise<{
  isBlocked: boolean;
  filteredContent?: string;
  reason?: string;
}> => {
  // Skip guardrail check if not configured
  if (!GUARDRAIL_ID) {
    console.warn("Guardrail ID not configured, skipping guardrail check");
    return { isBlocked: false, filteredContent: content };
  }

  try {
    const command = new ApplyGuardrailCommand({
      guardrailIdentifier: GUARDRAIL_ID,
      guardrailVersion: GUARDRAIL_VERSION,
      source: source,
      content: [
        {
          text: {
            text: content,
          },
        },
      ],
    });

    const response = await bedrockClient.send(command);

    // Check if content was blocked
    const isBlocked = response.action === "GUARDRAIL_INTERVENED";

    if (isBlocked) {
      console.log(
        `Guardrail blocked ${source.toLowerCase()} content:`,
        response.actionReason
      );
      return {
        isBlocked: true,
        reason:
          response.actionReason || "Content blocked by guardrail policies",
      };
    }

    // Get filtered content if available
    const filteredContent = response.outputs?.[0]?.text || content;

    console.log(`Guardrail approved ${source.toLowerCase()} content`);
    return { isBlocked: false, filteredContent };
  } catch (error) {
    console.error(
      `Error applying guardrails to ${source.toLowerCase()} content:`,
      error
    );
    // Don't block content if guardrail check fails - log and continue
    return { isBlocked: false, filteredContent: content };
  }
};

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

  systemPrompt += ` Stay in character while helping players with their scavenger hunt adventure. Be engaging and provide helpful guidance without giving away answers too easily. Keep responses relatively short.`;

  return systemPrompt;
};

/**
 * Invoke bedrock with message history and system prompt from s3
 */
const invokeBedrock = async ({
  levelId,
  messageHistory,
}: InvokeBedrockProps): Promise<InvokeBedrockResponse> => {
  console.log(
    `INFO: Invoking Bedrock for level ${levelId} with ${messageHistory.length} message(s)`
  );
  const nextMessageId = v4() as UUID;

  try {
    const levelData = await LevelOperations.getByLevelId(levelId);
    if (!levelData) {
      // TODO: Return a clue from dynamo if level not found
      throw new Error(`Level not found for ID: ${levelId}`);
    }

    const systemPrompt = buildSystemPrompt(levelData);
    const maxTokens = levelData.max_tokens || 128;

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

    console.log(
      `INFO: Sending request to Bedrock with system prompt and ${messages.length} message(s)`
    );

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

    console.log(`INFO: Received response from Bedrock:`, responseBody);

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

    // Apply guardrails to the LLM response
    const guardrailCheck = await applyGuardrails(
      responseMessage.content,
      "OUTPUT"
    );

    if (guardrailCheck.isBlocked) {
      console.log(
        `INFO: LLM response blocked by guardrails for level ${levelId}:`,
        guardrailCheck.reason
      );

      // Return a safe fallback message
      const safeResponseMessage: Message<MessageRole.Assistant> = {
        id: nextMessageId,
        role: MessageRole.Assistant,
        content:
          "I'm sorry, but I can't provide that response. Let me help you with your scavenger hunt in a different way.",
        createdAt: new Date(),
      };

      return {
        bedrockResponseMessage: safeResponseMessage,
      };
    }

    // Use filtered content if available
    if (
      guardrailCheck.filteredContent &&
      guardrailCheck.filteredContent !== responseMessage.content
    ) {
      responseMessage.content = guardrailCheck.filteredContent;
      console.log(
        `INFO: LLM response content filtered by guardrails for level ${levelId}`
      );
    }

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
    // Apply guardrails to user input first
    const userInputGuardrailCheck = await applyGuardrails(
      newUserMessage.content,
      "INPUT"
    );

    if (userInputGuardrailCheck.isBlocked) {
      console.log(
        `INFO: User message blocked by guardrails for level ${levelId}:`,
        userInputGuardrailCheck.reason
      );

      // Return a response indicating the message was blocked
      const blockedResponseMessage: Message<MessageRole.Assistant> = {
        id: v4() as UUID,
        role: MessageRole.Assistant,
        content:
          "I can't process that message due to content policies. Please rephrase your question or comment, and I'll be happy to help with your scavenger hunt!",
        createdAt: new Date(),
      };

      return {
        bedrockResponseMessage: blockedResponseMessage,
      };
    }

    // Use filtered content if available
    let processedUserMessage = { ...newUserMessage };
    if (
      userInputGuardrailCheck.filteredContent &&
      userInputGuardrailCheck.filteredContent !== newUserMessage.content
    ) {
      processedUserMessage.content = userInputGuardrailCheck.filteredContent;
      console.log(
        `INFO: User message content filtered by guardrails for level ${levelId}`
      );
    }

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

    // Persist new user message to DynamoDB (use original content for storage)
    try {
      await MessageOperations.create({
        game_id: gameId,
        user_id: userId,
        team_id: teamId,
        level_id: levelId,
        content: newUserMessage.content, // Store original user content
        role: newUserMessage.role,
      });
      messageHistory.push(processedUserMessage); // Use filtered content for LLM

      console.log(`INFO: Persisted user message for level ${levelId}`);
    } catch (error) {
      console.error(
        `ERROR: Failed to persist user message for level ${levelId}:`,
        error
      );
      // Continue anyway - we'll still try to get a response from Bedrock
    }

    // Invoke Bedrock with the message history (including filtered user message)
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
