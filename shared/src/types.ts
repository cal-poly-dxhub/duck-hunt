export type UUID = `${string}-${string}-${string}-${string}-${string}`;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "GET",
  "Content-Type": "application/json",
};

// error response schema
export interface ResponseError {
  error: string;
  displayMessage: string;
  details: string;
}

// request headers schema
export interface RequestHeaders {
  "Content-Type": string;
  "user-id": string;
  "team-id": string;
}

// ------------ message types ------------

export enum MessageRole {
  User = "user",
  Assistant = "assistant",
}

export interface Message<T extends MessageRole = MessageRole> {
  id: number;
  role: T;
  content: string;
  createdAt: Date;
}

// request body schema
export interface MessageRequestBody {
  message: Message<MessageRole.User>;
}

// response body schema
export interface MessageResponseBody {
  message: Message<MessageRole.Assistant>;
  mapLink: string | null;
}

// ------------ level response schema ------------

// request body schema for /level
export interface LevelRequestBody {
  levelId?: string;
}

// response body schema for /level
export interface LevelResponseBody {
  currentLevel: string;
  messageHistory: Message[];
  requiresPhoto: boolean;
}

// ------------ apiRequest response schema ------------

export type ApiResponse<T> =
  | { data: T; success: true; status: number; error: null }
  | { data: null; success: false; status: number; error: ResponseError };
