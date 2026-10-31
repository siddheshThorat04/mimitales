import { PHASE1_LANGUAGES } from "@mimitales/shared";
import { z } from "zod";

const slug = z.string().regex(/^[a-z][a-z0-9-]{1,30}$/);

export const createStoryBody = z
  .object({
    childId: z.string().uuid(),
    characterSlug: slug,
    worldSlug: slug.optional(),
    language: z
      .string()
      .refine((v) => (PHASE1_LANGUAGES as readonly string[]).includes(v), "unsupported language")
      .optional(),
  })
  .strict();

// Empty or whitespace-only text is allowed here: the engine answers "could you say that again?"
export const turnBody = z.object({ text: z.string().max(2000) }).strict();

export const listQuery = z.object({ childId: z.string().uuid().optional() }).strict();