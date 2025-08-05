import {
  ApplyGuardrailCommand,
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

const MODEL_ID_1 = "anthropic.claude-3-5-haiku-20241022-v1:0";
const MODEL_ID_2 = "anthropic.claude-3-haiku-20240307-v1:0";

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
 * Process Bedrock response and apply guardrails
 */
const processBedrockResponse = async (
  response: any,
  messageId: UUID
): Promise<Message<MessageRole.Assistant>> => {
  if (!response.body) {
    throw new Error("No response body from Bedrock");
  }

  const responseBody = JSON.parse(new TextDecoder().decode(response.body));

  if (!responseBody.content?.[0]?.text) {
    throw new Error("Invalid response format from Bedrock");
  }

  let responseMessage: Message<MessageRole.Assistant> = {
    id: messageId,
    role: MessageRole.Assistant,
    content: responseBody.content[0].text,
    createdAt: new Date(),
  };

  // Apply guardrails to the LLM response
  const guardrailCheck = await applyGuardrails(
    responseMessage.content,
    "OUTPUT"
  );

  if (guardrailCheck.isBlocked) {
    console.log(
      `INFO: LLM response blocked by guardrails:`,
      guardrailCheck.reason
    );

    responseMessage.content =
      "I'm sorry, but I can't provide that response. Let me help you with your scavenger hunt in a different way.";
  } else if (
    guardrailCheck.filteredContent &&
    guardrailCheck.filteredContent !== responseMessage.content
  ) {
    responseMessage.content = guardrailCheck.filteredContent;
    console.log(`INFO: LLM response content filtered by guardrails`);
  }

  return responseMessage;
};

/**
 * Get a clue from DynamoDB as fallback
 */
const getClueFromDynamo = async (
  levelData: any,
  messageId: UUID
): Promise<Message<MessageRole.Assistant> | null> => {
  try {
    // Try to get an easy clue first, then regular clues
    const availableClues = [
      ...(levelData.easyClues || []),
      ...(levelData.clues || []),
    ];

    if (availableClues.length === 0) {
      return null;
    }

    // Pick a random clue
    const randomClue =
      availableClues[Math.floor(Math.random() * availableClues.length)];

    // Include character context if available
    const characterName = levelData.character?.name || "Guide";
    const clueMessage: Message<MessageRole.Assistant> = {
      id: messageId,
      role: MessageRole.Assistant,
      content: `*${characterName} offers a helpful hint* ${randomClue}`,
      createdAt: new Date(),
    };

    // Apply guardrails to the clue as well
    const guardrailCheck = await applyGuardrails(clueMessage.content, "OUTPUT");

    if (guardrailCheck.isBlocked) {
      return null; // Don't return blocked clues
    }

    if (guardrailCheck.filteredContent) {
      clueMessage.content = guardrailCheck.filteredContent;
    }

    return clueMessage;
  } catch (error) {
    console.error("Error getting clue from DynamoDB:", error);
    return null;
  }
};

/**
 * Invoke bedrock with proper fallback chain
 */
const invokeBedrock = async ({
  levelId,
  messageHistory,
}: InvokeBedrockProps): Promise<InvokeBedrockResponse> => {
  const nextMessageId = v4() as UUID;

  try {
    const levelData = await LevelOperations.getByLevelId(levelId);

    if (!levelData) {
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

    // Try primary model first
    try {
      console.log(
        `INFO: Invoking Bedrock with primary model ${MODEL_ID_1} for level ${levelId}`
      );

      const command = new InvokeModelCommand({
        modelId: MODEL_ID_1,
        body: JSON.stringify(requestBody),
        contentType: "application/json",
        accept: "application/json",
      });

      const response = await bedrockClient.send(command);
      const responseMessage = await processBedrockResponse(
        response,
        nextMessageId
      );

      console.log(
        `INFO: Successfully invoked primary model for level ${levelId}`
      );
      return { bedrockResponseMessage: responseMessage };
    } catch (primaryError) {
      console.warn(
        `WARN: Primary model ${MODEL_ID_1} failed for level ${levelId}:`,
        primaryError
      );

      // Try fallback model
      try {
        console.log(
          `INFO: Falling back to secondary model ${MODEL_ID_2} for level ${levelId}`
        );

        const fallbackCommand = new InvokeModelCommand({
          modelId: MODEL_ID_2,
          body: JSON.stringify(requestBody),
          contentType: "application/json",
          accept: "application/json",
        });

        const fallbackResponse = await bedrockClient.send(fallbackCommand);
        const responseMessage = await processBedrockResponse(
          fallbackResponse,
          nextMessageId
        );

        console.log(
          `INFO: Successfully invoked fallback model for level ${levelId}`
        );
        return { bedrockResponseMessage: responseMessage };
      } catch (fallbackError) {
        console.warn(
          `WARN: Fallback model ${MODEL_ID_2} also failed for level ${levelId}:`,
          fallbackError
        );

        // Both models failed, try to get a clue from DynamoDB
        try {
          console.log(
            `INFO: Both models failed, attempting to get clue from DynamoDB for level ${levelId}`
          );

          const clueMessage = await getClueFromDynamo(levelData, nextMessageId);
          if (clueMessage) {
            console.log(
              `INFO: Successfully retrieved clue from DynamoDB for level ${levelId}`
            );
            return { bedrockResponseMessage: clueMessage };
          }
        } catch (clueError) {
          console.error(
            `ERROR: Failed to get clue from DynamoDB for level ${levelId}:`,
            clueError
          );
        }

        // All fallbacks failed, throw to trigger final error message
        throw new Error(
          `All Bedrock models and DynamoDB clue retrieval failed for level ${levelId}`
        );
      }
    }
  } catch (error) {
    console.error(
      `ERROR: All fallback mechanisms failed for level ${levelId}:`,
      error
    );

    // Final fallback - hardcoded error message
    const errorMessage: Message<MessageRole.Assistant> = {
      id: nextMessageId,
      role: MessageRole.Assistant,
      content:
        "I'm experiencing some technical difficulties right now. Please try again in a moment.",
      createdAt: new Date(),
    };

    return { bedrockResponseMessage: errorMessage };
  }
};

export const invokeBedrockPersistToDynamo = async ({
  gameId,
  levelId,
  userId,
  teamId,
  newUserMessage,
}: InvokeBedrockPersistToDynamoProps): Promise<InvokeBedrockResponse> => {
  let assistantMessage: Message<MessageRole.Assistant>;

  try {
    // Apply guardrails to user input first
    const userInputGuardrailCheck = await applyGuardrails(
      newUserMessage.content,
      "INPUT"
    );

    let processedUserMessage = { ...newUserMessage };
    let shouldSaveUserMessage = true;

    if (userInputGuardrailCheck.isBlocked) {
      console.log(
        `INFO: User message blocked by guardrails for level ${levelId}:`,
        userInputGuardrailCheck.reason
      );

      // Create blocked response but still save the original user message
      assistantMessage = {
        id: v4() as UUID,
        role: MessageRole.Assistant,
        content:
          "I can't process that message due to content policies. Please rephrase your question or comment, and I'll be happy to help with your scavenger hunt!",
        createdAt: new Date(),
      };
    } else {
      // Use filtered content if available
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

      // Add the processed user message to history for LLM
      messageHistory.push(processedUserMessage);

      // Invoke Bedrock with the message history (including filtered user message)
      const { bedrockResponseMessage } = await invokeBedrock({
        levelId,
        messageHistory,
      });

      assistantMessage = bedrockResponseMessage;
    }

    // ALWAYS save user message to DynamoDB (original content)
    try {
      await MessageOperations.create({
        game_id: gameId,
        user_id: userId,
        team_id: teamId,
        level_id: levelId,
        content: newUserMessage.content, // Always store original user content
        role: newUserMessage.role,
      });
      console.log(`INFO: Persisted user message for level ${levelId}`);
    } catch (error) {
      console.error(
        `ERROR: Failed to persist user message for level ${levelId}:`,
        error
      );
      // Continue - we still want to save the assistant message and return response
    }

    // ALWAYS save assistant message to DynamoDB
    try {
      await MessageOperations.create({
        game_id: gameId,
        user_id: userId,
        team_id: teamId,
        level_id: levelId,
        content: assistantMessage.content,
        role: assistantMessage.role,
      });
      console.log(`INFO: Persisted assistant message for level ${levelId}`);
    } catch (error) {
      console.error(
        `ERROR: Failed to persist assistant message for level ${levelId}:`,
        error
      );
      // Don't fail the operation - we still return the response
    }

    return { bedrockResponseMessage: assistantMessage };
  } catch (error) {
    console.error(
      `ERROR: invokeBedrockPersistToDynamo failed for level ${levelId}:`,
      error
    );

    // Create final fallback response
    const fallbackMessage: Message<MessageRole.Assistant> = {
      id: v4() as UUID,
      role: MessageRole.Assistant,
      content:
        "I'm experiencing technical difficulties right now. Please try again in a moment.",
      createdAt: new Date(),
    };

    // ALWAYS try to save user message even in error case
    try {
      await MessageOperations.create({
        game_id: gameId,
        user_id: userId,
        team_id: teamId,
        level_id: levelId,
        content: newUserMessage.content,
        role: newUserMessage.role,
      });
      console.log(
        `INFO: Persisted user message in error case for level ${levelId}`
      );
    } catch (saveError) {
      console.error(
        `ERROR: Failed to persist user message in error case for level ${levelId}:`,
        saveError
      );
    }

    // ALWAYS try to save assistant message even in error case
    try {
      await MessageOperations.create({
        game_id: gameId,
        user_id: userId,
        team_id: teamId,
        level_id: levelId,
        content: fallbackMessage.content,
        role: fallbackMessage.role,
      });
      console.log(
        `INFO: Persisted fallback assistant message for level ${levelId}`
      );
    } catch (saveError) {
      console.error(
        `ERROR: Failed to persist fallback assistant message for level ${levelId}:`,
        saveError
      );
    }

    return { bedrockResponseMessage: fallbackMessage };
  }
};
