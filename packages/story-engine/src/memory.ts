import { z } from "zod";

// Reusable field shapes (also used by the delta schema).
export const item = z.string().trim().min(1).max(120);
export const event = z.string().trim().min(1).max(200);
export const text = (max: number) => z.string().trim().max(max);
export const factKey = z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{1,40}$/);

export const MEMORY_LIMITS = {
  list: 20,
  events: 30,
  choices: 30,
  questions: 10,
  facts: 40,
} as const;

export const storyMemorySchema = z
  .object({
    world: text(60),
    currentLocation: text(120),
    mainCharacter: text(60),
    mission: text(200),
    inventory: z.array(item).max(MEMORY_LIMITS.list),
    friends: z.array(item).max(MEMORY_LIMITS.list),
    enemies: z.array(item).max(MEMORY_LIMITS.list),
    importantEvents: z.array(event).max(MEMORY_LIMITS.events),
    childChoices: z.array(event).max(MEMORY_LIMITS.choices),
    currentProblem: text(200),
    nextGoal: text(200),
    openQuestions: z.array(event).max(MEMORY_LIMITS.questions),
    lastSceneSummary: text(600),
    // Yes/no story facts, e.g. { dragonHelped: true }.
    facts: z
      .record(factKey, z.boolean())
      .refine((o) => Object.keys(o).length <= MEMORY_LIMITS.facts, "too many facts"),
  })
  .strict();
export type StoryMemory = z.infer<typeof storyMemorySchema>;

export function emptyMemory(init: {
  world: string;
  currentLocation: string;
  mainCharacter: string;
}): StoryMemory {
  return storyMemorySchema.parse({
    ...init,
    mission: "",
    inventory: [],
    friends: [],
    enemies: [],
    importantEvents: [],
    childChoices: [],
    currentProblem: "",
    nextGoal: "",
    openQuestions: [],
    lastSceneSummary: "",
    facts: {},
  });
}