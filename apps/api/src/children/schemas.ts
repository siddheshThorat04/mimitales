import { AGE_BANDS, PHASE1_LANGUAGES } from "@mimitales/shared";
import { z } from "zod";

const displayName = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .regex(/^[\p{L}\p{M}\p{N} '.-]+$/u, "invalid characters");

const ageBand = z.enum(AGE_BANDS);

const language = z
  .string()
  .refine((v) => (PHASE1_LANGUAGES as readonly string[]).includes(v), "unsupported language");

export const createChildBody = z
  .object({
    displayName,
    ageBand,
    preferredLanguage: language.default("en-IN"),
  })
  .strict();

export const updateChildBody = z
  .object({
    displayName: displayName.optional(),
    ageBand: ageBand.optional(),
    preferredLanguage: language.optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, "at least one field is required");

export const idSchema = z.string().uuid();