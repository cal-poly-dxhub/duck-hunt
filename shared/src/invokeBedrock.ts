// TODO

import { Message, MessageRole, UUID } from "./types";

export interface InvokeBedrockProps {
  systemPromptId: UUID;
  messageHistory: Array<Message>;
}

export interface InvokeBedrockResponse {
  bedrockResponseMessage: Message<MessageRole.Assistant>; // {id} is latest id + 1
  bedrockFailed: boolean;
}

/**
 * Invoke bedrock with message history and system prompt from s3
 * @param InvokeBedrockProps {InvokeBedrockProps}
 * @returns InvokeBedrockResponse {InvokeBedrockResponse}
 */
export const invokeBedrock = async ({
  systemPromptId,
  messageHistory,
}: InvokeBedrockProps): Promise<InvokeBedrockResponse> => {
  const stubMessage: Message<MessageRole.Assistant> = {
    id: messageHistory[-1].id + 1,
    role: MessageRole.Assistant,
    content: `Stub bedrock response. System prompt id: ${systemPromptId}. You most recently said: ${
      messageHistory.length > 0 ? messageHistory[-1].content : "N/A"
    }.`,
    createdAt: new Date(),
  };

  return {
    bedrockResponseMessage: stubMessage,
    bedrockFailed: true,
  };
};
