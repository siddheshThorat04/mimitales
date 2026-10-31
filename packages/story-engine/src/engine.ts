import { LLMError, type LLMMessage, type LLMProvider } from "@mimitales/providers";
import { applyDelta } from "./delta";
import { closeOutputSchema, parseModelJson, turnOutputSchema, type TurnOutput } from "./llm-output";
import type { StoryMemory } from "./memory";
import {
  buildCloseMessages,
  buildTurnMessages,
  sanitizeChildText,
  type PromptContext,
  type TurnKind,
} from "./prompt";

/** Checkpoints for the safety layer (Milestone 7). Until then everything passes. */
export interface SafetyHooks {
  checkInput(text: string): Promise<boolean>;
  checkOutput(text: string): Promise<boolean>;
}

export const passthroughSafety: SafetyHooks = {
  checkInput: async () => true,
  checkOutput: async () => true,
};

export type TurnFailureReason =
  | "empty_input"
  | "blocked_input"
  | "blocked_output"
  | "provider_error"
  | "invalid_output";

export type TurnResult =
  | { ok: true; narration: string; memory: StoryMemory; episodeShouldEnd: boolean }
  | { ok: false; reason: TurnFailureReason; fallbackNarration: string; memory: StoryMemory };

export interface CloseResult {
  summary: string;
  memory: StoryMemory;
  usedFallback: boolean;
}

// English for now; localized fallbacks arrive with the multilingual milestone.
const FALLBACK_NARRATION = "Hmm, let me think about that for a moment. What would you like to happen next?";
const EMPTY_INPUT_NARRATION = "I didn't quite catch that. Could you say it again?";
const MAX_ATTEMPTS = 2;
const TURN_LIMITS = { maxOutputTokens: 700, timeoutMs: 15_000, jsonOutput: true } as const;
const REPAIR: LLMMessage = {
  role: "user",
  content:
    "Your last reply was not valid. Reply with ONLY the JSON object in the required shape, with no other text.",
};

export class StoryEngine {
  constructor(
    private readonly llm: LLMProvider,
    private readonly safety: SafetyHooks = passthroughSafety,
  ) {}

  /** One turn. On any failure the memory is returned exactly as it came in. */
  async takeTurn(ctx: PromptContext, kind: TurnKind): Promise<TurnResult> {
    const fail = (reason: TurnFailureReason, fallbackNarration = FALLBACK_NARRATION): TurnResult => ({
      ok: false,
      reason,
      fallbackNarration,
      memory: ctx.memory,
    });

    if (kind.type === "child") {
      const cleaned = sanitizeChildText(kind.text);
      if (cleaned.length === 0) return fail("empty_input", EMPTY_INPUT_NARRATION);
      if (!(await this.safety.checkInput(cleaned))) return fail("blocked_input");
    }

    const messages = buildTurnMessages(ctx, kind);
    let lastReason: TurnFailureReason = "invalid_output";
    let needsRepair = false;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let replyText: string;
      try {
        const reply = await this.llm.generateResponse({
          messages: needsRepair ? [...messages, REPAIR] : messages,
          ...TURN_LIMITS,
        });
        replyText = reply.text;
      } catch (err) {
        if (err instanceof LLMError) {
          lastReason = "provider_error";
          continue;
        }
        throw err;
      }

      const output: TurnOutput | null = parseModelJson(turnOutputSchema, replyText);
      if (!output) {
        lastReason = "invalid_output";
        needsRepair = true;
        continue;
      }

      if (!(await this.safety.checkOutput(output.narration))) return fail("blocked_output");

      let memory: StoryMemory;
      try {
        memory = applyDelta(ctx.memory, output.stateDelta);
      } catch {
        lastReason = "invalid_output";
        needsRepair = true;
        continue;
      }
      return { ok: true, narration: output.narration, memory, episodeShouldEnd: output.episodeShouldEnd };
    }
    return fail(lastReason);
  }

  /** Summarises the episode. If that fails, the existing memory is kept, never lost. */
  async closeEpisode(ctx: PromptContext): Promise<CloseResult> {
    const fallbackSummary = ctx.memory.lastSceneSummary || "The story paused here.";
    try {
      const reply = await this.llm.generateResponse({
        messages: buildCloseMessages(ctx),
        maxOutputTokens: 300,
        timeoutMs: 15_000,
        jsonOutput: true,
      });
      const parsed = parseModelJson(closeOutputSchema, reply.text);
      if (parsed) {
        const summary: string = parsed.summary;
        return {
          summary,
          memory: { ...ctx.memory, lastSceneSummary: summary.slice(0, 600) },
          usedFallback: false,
        };
      }
    } catch (err) {
      if (!(err instanceof LLMError)) throw err;
    }
    return { summary: fallbackSummary, memory: ctx.memory, usedFallback: true };
  }
}