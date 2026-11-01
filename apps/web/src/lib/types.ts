import type { AgeBand } from "@mimitales/shared";

export interface Child {
  id: string;
  displayName: string;
  ageBand: AgeBand;
  preferredLanguage: string;
}
export type LocalizedText = Record<"en-IN" | "hi-IN" | "mr-IN", string>;

export interface CatalogCharacter {
  slug: string;
  name: string;
  tagline: LocalizedText;
  description: LocalizedText;
  ageBands: AgeBand[];
  worlds: string[];
}

export interface CatalogWorld {
  slug: string;
  name: string;
  tagline: LocalizedText;
  description: LocalizedText;
}

export interface Story {
  id: string;
  childId: string;
  characterSlug: string;
  worldSlug: string;
  language: string;
  title: string;
  status: string;
  episodeCount: number;
  createdAt: string;
}

export interface ParentMemory {
  world: string;
  currentLocation: string;
  mission: string;
  currentProblem: string;
  nextGoal: string;
  friends: string[];
  inventory: string[];
  lastSceneSummary: string;
}