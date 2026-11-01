import { describe, expect, it } from "vitest";
import { GeminiLLMProvider, toGeminiContents } from "./gemini";
import { LLMError, type LLMInput } from "./llm";

const KEY = "test-key-should-never-leak";
const input: LLMInput = {
  messages: [
    { role: "system", content: "You are Lumi." },
    { role: "assistant", content: "Once upon a time..." },
    { role: "user", content: "Help the dragon" },
    { role: "user", content: "Reply with only JSON." },
  ],
  maxOutputTokens: 123,
  timeoutMs: 1000,
  jsonOutput: true,
};

const okBody = (text = "hello") =>
  JSON.stringify({
    candidates: [{ content: { parts: [{ text }] } }],
    usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 15 },
  });

function provider(fetchImpl: typeof fetch) {
  return new GeminiLLMProvider({ apiKey: KEY, model: "gemini-3.5-flash-lite", fetchImpl });
}

describe("GeminiLLMProvider", () => {
  it("builds the request: system instruction, merged roles, limits and JSON mode", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(okBody(), { status: 200 });
    }) as typeof fetch;

    await provider(fake).generateResponse(input);

    const call = calls[0];
    expect(call?.url).toContain("/models/gemini-3.5-flash-lite:generateContent");
    expect((call?.init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
    const body = JSON.parse(String(call?.init.body));
    expect(body.systemInstruction.parts[0].text).toBe("You are Lumi.");
    expect(body.generationConfig).toMatchObject({
      maxOutputTokens: 123,
      responseMimeType: "application/json",
    });
    // The leading "model" turn is padded; the two user messages are merged into one turn.
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual(["user", "model", "user"]);
    expect(body.contents[2].parts).toHaveLength(2);
  });

  it("pads a history that starts with a model turn", () => {
    const contents = toGeminiContents([{ role: "assistant", content: "Hi" }]);
    expect(contents.map((c) => c.role)).toEqual(["user", "model"]);
  });

  it("returns the text, ignores thought parts, and reports usage", async () => {
    const body = JSON.stringify({
      candidates: [
        { content: { parts: [{ text: "secret reasoning", thought: true }, { text: "Hello " }, { text: "there" }] } },
      ],
      usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 15, thoughtsTokenCount: 5 },
    });
    const result = await provider((async () => new Response(body, { status: 200 })) as typeof fetch).generateResponse(input);
    expect(result.text).toBe("Hello there");
    expect(result.usage).toEqual({ inputTokens: 8, outputTokens: 20 });
  });

  it("maps HTTP failures to error kinds without leaking the key", async () => {
    const respond = (status: number) =>
      provider((async () => new Response(`error mentioning ${KEY}`, { status })) as typeof fetch);

    await expect(respond(429).generateResponse(input)).rejects.toMatchObject({ kind: "rate_limit" });
    await expect(respond(500).generateResponse(input)).rejects.toMatchObject({ kind: "provider" });
    const unauthorized = await respond(401)
      .generateResponse(input)
      .catch((e: unknown) => e);
    expect(unauthorized).toBeInstanceOf(LLMError);
    expect((unauthorized as LLMError).kind).toBe("provider");
    expect((unauthorized as LLMError).message).not.toContain(KEY);
  });

  it("times out, and rejects blocked or empty or non-JSON replies", async () => {
    const hang = ((_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as typeof fetch;
    await expect(
      provider(hang).generateResponse({ ...input, timeoutMs: 20 }),
    ).rejects.toMatchObject({ kind: "timeout" });

    const bodies = [
      JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }),
      JSON.stringify({ candidates: [] }),
      "<html>not json</html>",
      "null",
    ];
    for (const body of bodies) {
      await expect(
        provider((async () => new Response(body, { status: 200 })) as typeof fetch).generateResponse(input),
      ).rejects.toMatchObject({ kind: "invalid_response" });
    }
  });
});