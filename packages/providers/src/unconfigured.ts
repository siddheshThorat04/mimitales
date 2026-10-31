import { LLMError, type LLMProvider, type LLMResponse } from "./llm";

/** Placeholder used until a real provider is configured: every call fails safely. */
export class UnconfiguredLLMProvider implements LLMProvider {
  readonly name = "unconfigured";

  async generateResponse(): Promise<LLMResponse> {
    throw new LLMError("No LLM provider is configured", "provider");
  }
}