export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "GET",
  "Content-Type": "application/json",
};

export enum MessageRole {
  User = "user",
  Assistant = "assistant",
}

export interface Message<T extends MessageRole = MessageRole> {
  role: T;
  content: string;
}

export interface ResponseError {
  error: string;
  displayMessage: string;
  details: string;
}

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  status?: number;
  error?: string;
}
