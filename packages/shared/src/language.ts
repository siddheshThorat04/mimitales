export const LANGUAGE_CODES = [
  "en-IN",
  "hi-IN",
  "mr-IN",
  "ta-IN",
  "te-IN",
  "bn-IN",
  "gu-IN",
  "kn-IN",
  "ml-IN",
  "pa-IN",
  "or-IN",
  "as-IN",
] as const;

export type LanguageCode = (typeof LANGUAGE_CODES)[number];

// Languages we will actually enable in Phase 1 (only after real voice testing).
export const PHASE1_LANGUAGES: readonly LanguageCode[] = ["en-IN", "hi-IN", "mr-IN"];

export const FALLBACK_LANGUAGE: LanguageCode = "en-IN";

export function isLanguageCode(value: string): value is LanguageCode {
  return (LANGUAGE_CODES as readonly string[]).includes(value);
}