import { AGE_BANDS } from "@mimitales/shared";
import { z } from "zod";

const slug = z.string().regex(/^[a-z][a-z0-9-]{1,30}$/);
const shortText = z.string().trim().min(1).max(300);
const line = z.string().trim().min(1).max(400);

/** Parent-facing text. Every Phase 1 language is required. */
export const localizedText = z
  .object({ "en-IN": shortText, "hi-IN": shortText, "mr-IN": shortText })
  .strict();
export type LocalizedText = z.infer<typeof localizedText>;

export const characterConfigSchema = z
  .object({
    slug,
    name: z.string().trim().min(1).max(30),
    tagline: localizedText,
    description: localizedText,
    ageBands: z.array(z.enum(AGE_BANDS)).min(1),
    // Prompt-facing fields, kept in English.
    personality: z.array(line).min(1).max(8),
    speakingStyle: z.array(line).min(1).max(8),
    defaultWorld: slug,
    worlds: z.array(slug).min(1),
    rules: z.array(line).min(1).max(30),
  })
  .strict()
  .refine((c) => c.worlds.includes(c.defaultWorld), "defaultWorld must be listed in worlds");
export type CharacterConfig = z.infer<typeof characterConfigSchema>;

export const worldConfigSchema = z
  .object({
    slug,
    name: z.string().trim().min(1).max(40),
    tagline: localizedText,
    description: localizedText,
    // Prompt-facing fields, kept in English.
    tone: z.array(line).min(1).max(6),
    locations: z
      .array(z.object({ name: z.string().trim().min(1).max(40), description: line }).strict())
      .min(3)
      .max(12),
    rules: z.array(line).min(1).max(20),
    storyHooks: z.array(line).min(2).max(12),
  })
  .strict();
export type WorldConfig = z.infer<typeof worldConfigSchema>;