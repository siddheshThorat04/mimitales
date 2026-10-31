import { z } from "zod";
import {
  MEMORY_LIMITS,
  event,
  factKey,
  item,
  storyMemorySchema,
  text,
  type StoryMemory,
} from "./memory";

/** The only changes the model is allowed to propose. Anything else is rejected. */
export const stateDeltaSchema = z
  .object({
    currentLocation: item.optional(),
    mission: text(200).optional(),
    currentProblem: text(200).optional(),
    nextGoal: text(200).optional(),
    lastSceneSummary: text(600).optional(),
    addInventory: z.array(item).max(5).default([]),
    removeInventory: z.array(item).max(5).default([]),
    addFriends: z.array(item).max(3).default([]),
    addEnemies: z.array(item).max(3).default([]),
    addEvents: z.array(event).max(3).default([]),
    addChoices: z.array(event).max(3).default([]),
    addOpenQuestions: z.array(event).max(3).default([]),
    resolveOpenQuestions: z.array(event).max(3).default([]),
    setFacts: z
      .record(factKey, z.boolean())
      .default({})
      .refine((o) => Object.keys(o).length <= 5, "too many facts"),
  })
  .strict();
export type StateDelta = z.infer<typeof stateDeltaSchema>;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Appends new entries (case-insensitive de-duplication) and keeps only the newest `cap`. */
function addUnique(list: string[], additions: string[], cap: number): string[] {
  const out = [...list];
  for (const entry of additions) {
    if (!out.some((existing) => same(existing, entry))) out.push(entry);
  }
  return out.slice(-cap);
}

/** Pure: returns a new, validated memory. Throws if the result would break the schema. */
export function applyDelta(memory: StoryMemory, delta: StateDelta): StoryMemory {
  const inventory = addUnique(
    memory.inventory.filter((x) => !delta.removeInventory.some((r) => same(r, x))),
    delta.addInventory,
    MEMORY_LIMITS.list,
  );
  const openQuestions = addUnique(
    memory.openQuestions.filter((q) => !delta.resolveOpenQuestions.some((r) => same(r, q))),
    delta.addOpenQuestions,
    MEMORY_LIMITS.questions,
  );
  const facts = Object.fromEntries(
    Object.entries({ ...memory.facts, ...delta.setFacts }).slice(-MEMORY_LIMITS.facts),
  );

  return storyMemorySchema.parse({
    ...memory,
    currentLocation: delta.currentLocation ?? memory.currentLocation,
    mission: delta.mission ?? memory.mission,
    currentProblem: delta.currentProblem ?? memory.currentProblem,
    nextGoal: delta.nextGoal ?? memory.nextGoal,
    lastSceneSummary: delta.lastSceneSummary ?? memory.lastSceneSummary,
    inventory,
    friends: addUnique(memory.friends, delta.addFriends, MEMORY_LIMITS.list),
    enemies: addUnique(memory.enemies, delta.addEnemies, MEMORY_LIMITS.list),
    importantEvents: addUnique(memory.importantEvents, delta.addEvents, MEMORY_LIMITS.events),
    childChoices: addUnique(memory.childChoices, delta.addChoices, MEMORY_LIMITS.choices),
    openQuestions,
    facts,
  });
}