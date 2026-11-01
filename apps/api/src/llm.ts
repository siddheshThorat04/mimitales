import type { Env } from "@mimitales/config";
import { GeminiLLMProvider, UnconfiguredLLMProvider, type LLMProvider } from "@mimitales/providers";

/** Picks the provider from the validated environment. Missing settings fail safe. */
export function createLLMProvider(env: Env): LLMProvider {
  if (env.LLM_PROVIDER === "gemini" && env.LLM_API_KEY && env.LLM_MODEL) {
    return new GeminiLLMProvider({ apiKey: env.LLM_API_KEY, model: env.LLM_MODEL });
  }
  return new UnconfiguredLLMProvider();
}