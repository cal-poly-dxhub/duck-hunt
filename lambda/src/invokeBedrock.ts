// TODO

import { Message, MessageRole, UUID } from "@shared/types";

export interface InvokeBedrockProps {
  levelId: UUID;
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
  levelId,
  messageHistory,
}: InvokeBedrockProps): Promise<InvokeBedrockResponse> => {
  const lastMessage = messageHistory[messageHistory.length - 1];
  const stubMessage: Message<MessageRole.Assistant> = {
    id: lastMessage ? lastMessage.id + 1 : 1,
    role: MessageRole.Assistant,
    content: `Stub bedrock response. Level id: ${levelId}. You most recently said: ${
      lastMessage ? lastMessage.content : "N/A"
    }.`,
    createdAt: new Date(),
  };

  return {
    bedrockResponseMessage: stubMessage,
    bedrockFailed: true,
  };
};
