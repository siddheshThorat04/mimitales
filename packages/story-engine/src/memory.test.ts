import { describe, expect, it } from "vitest";
import { applyDelta, stateDeltaSchema } from "./delta";
import { parseModelJson, turnOutputSchema } from "./llm-output";
import { makeContext } from "./testing";

const delta = (input: object) => stateDeltaSchema.parse(input);

describe("applyDelta", () => {
  it("adds without duplicates (case-insensitive) and removes items", () => {
    const start = { ...makeContext().memory, inventory: ["map"] };
    const next = applyDelta(start, delta({ addInventory: ["Compass", "MAP"] }));
    expect(next.inventory).toEqual(["map", "Compass"]);
    expect(applyDelta(next, delta({ removeInventory: ["COMPASS"] })).inventory).toEqual(["map"]);
  });

  it("keeps only the newest entries when a list is full", () => {
    let memory = makeContext().memory;
    for (let i = 0; i < 12; i++) {
      memory = applyDelta(
        memory,
        delta({ addEvents: [`e${i * 3}`, `e${i * 3 + 1}`, `e${i * 3 + 2}`] }),
      );
    }
    expect(memory.importantEvents).toHaveLength(30);
    expect(memory.importantEvents[0]).toBe("e6");
    expect(memory.importantEvents.at(-1)).toBe("e35");
  });

  it("updates scalar fields, open questions and facts", () => {
    const next = applyDelta(
      makeContext().memory,
      delta({
        currentLocation: "Glowing Brook",
        mission: "Find the moon crystal",
        addOpenQuestions: ["Who built the door?"],
        setFacts: { doorFound: true },
      }),
    );
    expect(next).toMatchObject({
      currentLocation: "Glowing Brook",
      mission: "Find the moon crystal",
      openQuestions: ["Who built the door?"],
      facts: { doorFound: true },
    });
    const resolved = applyDelta(
      next,
      delta({ resolveOpenQuestions: ["who built the door?"], setFacts: { doorFound: false } }),
    );
    expect(resolved.openQuestions).toEqual([]);
    expect(resolved.facts.doorFound).toBe(false);
  });

  it("never mutates the memory it was given", () => {
    const memory = makeContext().memory;
    const before = structuredClone(memory);
    applyDelta(memory, delta({ addFriends: ["Tiko"], setFacts: { a1: true } }));
    expect(memory).toEqual(before);
  });
});

describe("model output validation", () => {
  it("rejects unknown fields, oversized lists and bad fact names", () => {
    const base = { narration: "Hello!" };
    expect(turnOutputSchema.safeParse({ ...base, walletBalance: 5 }).success).toBe(false);
    expect(turnOutputSchema.safeParse({ ...base, stateDelta: { balance: 1 } }).success).toBe(false);
    expect(
      turnOutputSchema.safeParse({
        ...base,
        stateDelta: { addInventory: ["a", "b", "c", "d", "e", "f"] },
      }).success,
    ).toBe(false);
    expect(
      turnOutputSchema.safeParse({ ...base, stateDelta: { setFacts: { "bad key": true } } }).success,
    ).toBe(false);
    expect(turnOutputSchema.safeParse(base).success).toBe(true);
  });

  it("accepts fenced JSON and returns null for anything else", () => {
    const fenced = '```json\n{"narration":"Hi there"}\n```';
    expect(parseModelJson(turnOutputSchema, fenced)?.narration).toBe("Hi there");
    expect(parseModelJson(turnOutputSchema, "once upon a time")).toBeNull();
    expect(parseModelJson(turnOutputSchema, '{"narration":""}')).toBeNull();
  });
});