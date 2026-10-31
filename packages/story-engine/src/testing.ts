import { CHARACTERS } from "./content/characters";
import { WORLDS } from "./content/worlds";
import { emptyMemory } from "./memory";
import type { PromptContext } from "./prompt";

export const reply = (value: object) => JSON.stringify(value);

export function makeContext(overrides: Partial<PromptContext> = {}): PromptContext {
  const character = CHARACTERS[0];
  const world = WORLDS[0];
  if (!character || !world) throw new Error("story content is missing");
  return {
    character,
    world,
    language: "en-IN",
    ageBand: "5-6",
    memory: emptyMemory({
      world: world.name,
      currentLocation: "Crystal Cave",
      mainCharacter: "Mia",
    }),
    recentTurns: [],
    ...overrides,
  };
}