export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMInput {
  messages: LLMMessage[];
  maxOutputTokens: number;
  timeoutMs: number;
  /** Ask the provider for JSON-only output where it supports that. */
  jsonOutput?: boolean;
}

export interface LLMResponse {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface LLMProvider {
  readonly name: string;
  generateResponse(input: LLMInput): Promise<LLMResponse>;
}

export type LLMErrorKind = "timeout" | "rate_limit" | "provider" | "invalid_response";

export class LLMError extends Error {
  constructor(
    message: string,
    readonly kind: LLMErrorKind,
  ) {
    super(message);
    this.name = "LLMError";
  }
}