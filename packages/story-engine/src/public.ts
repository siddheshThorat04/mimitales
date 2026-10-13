import type { AgeBand } from "@mimitales/shared";
import type { CharacterConfig, LocalizedText, WorldConfig } from "./schemas";

/** What parents may see. Prompt-facing fields (personality, rules...) are never included. */
export interface PublicCharacter {
  slug: string;
  name: string;
  tagline: LocalizedText;
  description: LocalizedText;
  ageBands: AgeBand[];
  worlds: string[];
}

export interface PublicWorld {
  slug: string;
  name: string;
  tagline: LocalizedText;
  description: LocalizedText;
}

export function toPublicCharacter(c: CharacterConfig): PublicCharacter {
  return {
    slug: c.slug,
    name: c.name,
    tagline: c.tagline,
    description: c.description,
    ageBands: c.ageBands,
    worlds: c.worlds,
  };
}

export function toPublicWorld(w: WorldConfig): PublicWorld {
  return { slug: w.slug, name: w.name, tagline: w.tagline, description: w.description };
}