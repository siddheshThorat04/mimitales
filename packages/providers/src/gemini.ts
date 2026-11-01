import { LLMError, type LLMInput, type LLMMessage, type LLMProvider, type LLMResponse } from "./llm";

export interface GeminiOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  temperature?: number;
  /** Injected in tests so no real network call is made. */
  fetchImpl?: typeof fetch;
}

interface GeminiContent {
  role: "user" | "model";
  parts: { text: string }[];
}

interface GeminiResponseBody {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
}

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/** Gemini wants alternating roles that start with "user": merge neighbours, pad the start. */
export function toGeminiContents(messages: LLMMessage[]): GeminiContent[] {
  const contents: GeminiContent[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    const role = message.role === "assistant" ? "model" : "user";
    const last = contents.at(-1);
    if (last && last.role === role) last.parts.push({ text: message.content });
    else contents.push({ role, parts: [{ text: message.content }] });
  }
  if (contents[0]?.role === "model") {
    contents.unshift({ role: "user", parts: [{ text: "(Continue the story from your notes.)" }] });
  }
  return contents;
}

export function toGeminiRequest(input: LLMInput, temperature: number) {
  const system = input.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  return {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: toGeminiContents(input.messages),
    generationConfig: {
      temperature,
      maxOutputTokens: input.maxOutputTokens,
      ...(input.jsonOutput ? { responseMimeType: "application/json" } : {}),
    },
  };
}

function parseResponse(raw: string): LLMResponse {
  let data: GeminiResponseBody | null;
  try {
    data = JSON.parse(raw) as GeminiResponseBody | null;
  } catch {
    throw new LLMError("Gemini returned a body that is not JSON", "invalid_response");
  }
  if (typeof data !== "object" || data === null) {
    throw new LLMError("Gemini returned an unexpected body", "invalid_response");
  }
  if (data.promptFeedback?.blockReason) {
    throw new LLMError("Gemini blocked the request", "invalid_response");
  }
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  // Skip internal "thought" parts; keep only what the character should say.
  const text = parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("");
  if (!text.trim()) throw new LLMError("Gemini returned no text", "invalid_response");

  const usage = data.usageMetadata;
  return {
    text,
    usage: {
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
    },
  };
}

export class GeminiLLMProvider implements LLMProvider {
  readonly name = "gemini";
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: GeminiOptions) {
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
  }

  private async post(input: LLMInput): Promise<{ status: number; raw: string }> {
    const { apiKey, model } = this.options;
    const base = this.options.baseUrl ?? DEFAULT_BASE_URL;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const res = await this.fetchImpl(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(toGeminiRequest(input, this.options.temperature ?? 0.6)),
        signal: controller.signal,
      });
      return { status: res.status, raw: await res.text() };
    } catch {
      // Messages never include the key, the prompt or the response body.
      if (controller.signal.aborted) throw new LLMError("Gemini request timed out", "timeout");
      throw new LLMError("Gemini request failed", "provider");
    } finally {
      clearTimeout(timer);
    }
  }

  async generateResponse(input: LLMInput): Promise<LLMResponse> {
    const { status, raw } = await this.post(input);
    if (status === 429) throw new LLMError("Gemini rate limit reached", "rate_limit");
    if (status === 408 || status === 504) throw new LLMError("Gemini timed out", "timeout");
    if (status < 200 || status >= 300) throw new LLMError(`Gemini returned HTTP ${status}`, "provider");
    return parseResponse(raw);
  }
}