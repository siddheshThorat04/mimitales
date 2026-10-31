import { LLMError, type LLMInput, type LLMProvider, type LLMResponse } from "./llm";

export type ScriptedReply = string | LLMError | ((input: LLMInput) => string);

/** A fake LLM for tests: replies come from a queue and every request is recorded. */
export class ScriptedLLMProvider implements LLMProvider {
  readonly name = "scripted-mock";
  readonly calls: LLMInput[] = [];
  private readonly queue: ScriptedReply[];

  constructor(replies: ScriptedReply[] = []) {
    this.queue = [...replies];
  }

  enqueue(...replies: ScriptedReply[]) {
    this.queue.push(...replies);
  }

  async generateResponse(input: LLMInput): Promise<LLMResponse> {
    this.calls.push(input);
    const next = this.queue.shift();
    if (next === undefined) throw new LLMError("no scripted reply left", "provider");
    if (next instanceof LLMError) throw next;
    const text = typeof next === "function" ? next(input) : next;
    return { text, usage: { inputTokens: 0, outputTokens: 0 } };
  }
}