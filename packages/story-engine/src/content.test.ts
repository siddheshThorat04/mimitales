import { describe, expect, it } from "vitest";
import { CORE_RULES } from "./core-rules";
import { CHARACTERS } from "./content/characters";
import { WORLDS } from "./content/worlds";
import { toPublicCharacter, toPublicWorld } from "./public";
import { characterConfigSchema, worldConfigSchema } from "./schemas";

const DEVANAGARI = /[\u0900-\u097F]/;

describe("story content", () => {
  it("has unique slugs", () => {
    const characterSlugs = CHARACTERS.map((c) => c.slug);
    const worldSlugs = WORLDS.map((w) => w.slug);
    expect(new Set(characterSlugs).size).toBe(characterSlugs.length);
    expect(new Set(worldSlugs).size).toBe(worldSlugs.length);
  });

  it("points every character at worlds that exist", () => {
    const worldSlugs = new Set(WORLDS.map((w) => w.slug));
    for (const c of CHARACTERS) {
      for (const w of c.worlds) expect(worldSlugs.has(w)).toBe(true);
      expect(worldSlugs.has(c.defaultWorld)).toBe(true);
    }
  });

  it("gives every character all of the core safety rules", () => {
    for (const c of CHARACTERS) {
      for (const rule of CORE_RULES) expect(c.rules).toContain(rule);
    }
  });

  it("has Hindi and Marathi text, in Devanagari, for every parent-facing field", () => {
    const items = [...CHARACTERS, ...WORLDS];
    for (const item of items) {
      for (const field of [item.tagline, item.description]) {
        expect(DEVANAGARI.test(field["hi-IN"])).toBe(true);
        expect(DEVANAGARI.test(field["mr-IN"])).toBe(true);
      }
    }
  });

  it("avoids well-known copyrighted names (smoke check only, not legal clearance)", () => {
    const blocklist = [
      "disney", "pixar", "marvel", "mickey", "minnie", "elsa", "frozen", "spiderman",
      "pikachu", "pokemon", "peppa", "bluey", "dora", "doraemon", "simba", "nemo",
    ];
    const text = JSON.stringify([...CHARACTERS, ...WORLDS]).toLowerCase();
    for (const term of blocklist) {
      expect(new RegExp(`\\b${term}\\b`).test(text)).toBe(false);
    }
  });

  it("rejects unknown fields and missing languages", () => {
    const base = CHARACTERS[0];
    expect(characterConfigSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(
      characterConfigSchema.safeParse({
        ...base,
        tagline: { "en-IN": "only english", "mr-IN": "फक्त मराठी" },
      }).success,
    ).toBe(false);
    expect(worldConfigSchema.safeParse({ ...WORLDS[0], locations: [] }).success).toBe(false);
  });

  it("never exposes prompt content in the public views", () => {
    const publicText = JSON.stringify([
      ...CHARACTERS.map(toPublicCharacter),
      ...WORLDS.map(toPublicWorld),
    ]);
    for (const key of ["personality", "speakingStyle", "rules", "storyHooks", "locations"]) {
      expect(publicText).not.toContain(`"${key}"`);
    }
    expect(publicText).not.toContain("Never ask the child to keep a secret");
  });
});