// TypeScript interfaces for CLI commands
export interface JWTPayload {
  id: number;
  email: string;
  username: string;
  accessLevel: string;
  iat?: number;
  exp?: number;
}

export interface User {
  id: number;
  email: string;
  username: string;
  accessLevel: string;
}

export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
    extensions?: Record<string, unknown>;
  }>;
  extensions?: Record<string, unknown>;
}

export interface CommandOptions {
  [key: string]: unknown;
}

export interface CLIError {
  message: string;
  code?: string | number;
  details?: unknown;
}

export interface CLIResponse {
  success: boolean;
  data?: unknown;
  error?: CLIError;
}

export interface SQSMessage {
  messageId?: string;
  body?: string;
  attributes?: Record<string, unknown>;
  messageAttributes?: Record<string, unknown>;
}
