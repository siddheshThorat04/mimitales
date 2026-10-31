import { describe, expect, it } from "vitest";
import { LLMError } from "./llm";
import { UnconfiguredLLMProvider } from "./unconfigured";

describe("UnconfiguredLLMProvider", () => {
  it("always fails with a provider error", async () => {
    const error = await new UnconfiguredLLMProvider().generateResponse().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LLMError);
    expect((error as LLMError).kind).toBe("provider");
  });
});