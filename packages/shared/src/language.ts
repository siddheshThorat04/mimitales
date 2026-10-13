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
export const LANGUAGE_NAMES: Record<LanguageCode, { english: string; native: string }> = {
  "en-IN": { english: "English", native: "English" },
  "hi-IN": { english: "Hindi", native: "हिन्दी" },
  "mr-IN": { english: "Marathi", native: "मराठी" },
  "ta-IN": { english: "Tamil", native: "தமிழ்" },
  "te-IN": { english: "Telugu", native: "తెలుగు" },
  "bn-IN": { english: "Bengali", native: "বাংলা" },
  "gu-IN": { english: "Gujarati", native: "ગુજરાતી" },
  "kn-IN": { english: "Kannada", native: "ಕನ್ನಡ" },
  "ml-IN": { english: "Malayalam", native: "മലയാളം" },
  "pa-IN": { english: "Punjabi", native: "ਪੰਜਾਬੀ" },
  "or-IN": { english: "Odia", native: "ଓଡ଼ିଆ" },
  "as-IN": { english: "Assamese", native: "অসমীয়া" },
};