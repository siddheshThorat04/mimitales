import { describe, expect, it } from "vitest";
import { LLMError } from "./llm";
import { ScriptedLLMProvider } from "./mock";

const input = { messages: [{ role: "user" as const, content: "hi" }], maxOutputTokens: 10, timeoutMs: 1000 };

describe("ScriptedLLMProvider", () => {
  it("replays scripted replies in order and records every request", async () => {
    const llm = new ScriptedLLMProvider(["one", () => "two"]);
    expect((await llm.generateResponse(input)).text).toBe("one");
    expect((await llm.generateResponse(input)).text).toBe("two");
    expect(llm.calls).toHaveLength(2);
  });

  it("throws scripted errors and fails loudly when the script runs out", async () => {
    const llm = new ScriptedLLMProvider([new LLMError("slow", "timeout")]);
    await expect(llm.generateResponse(input)).rejects.toMatchObject({ kind: "timeout" });
    await expect(llm.generateResponse(input)).rejects.toBeInstanceOf(LLMError);
  });
});