// Assumption: we store a band, never an exact birthdate or age.
export const AGE_BANDS = ["3-4", "5-6", "7-8", "9-10"] as const;

export type AgeBand = (typeof AGE_BANDS)[number];