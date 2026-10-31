import { z } from "zod";
import { stateDeltaSchema } from "./delta";

export const turnOutputSchema = z
  .object({
    narration: z.string().trim().min(1).max(1500),
    stateDelta: stateDeltaSchema.default({}),
    episodeShouldEnd: z.boolean().default(false),
  })
  .strict();
export type TurnOutput = z.infer<typeof turnOutputSchema>;

export const closeOutputSchema = z
  .object({ summary: z.string().trim().min(1).max(500) })
  .strict();

/** Accepts plain JSON or JSON wrapped in a markdown code fence. */
export function extractJson(text: string): unknown {
  let body = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(body);
  if (fenced?.[1] !== undefined) body = fenced[1];
  return JSON.parse(body);
}

/** Returns the validated value, or null for anything that is not exactly what we asked for. */
export function parseModelJson<S extends z.ZodTypeAny>(schema: S, text: string): z.infer<S> | null {
  try {
    const result = schema.safeParse(extractJson(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}