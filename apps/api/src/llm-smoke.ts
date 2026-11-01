import { loadEnv } from "@mimitales/config";
import {
  CHARACTERS,
  StoryEngine,
  WORLDS,
  emptyMemory,
  type PromptContext,
} from "@mimitales/story-engine";
import { createLLMProvider } from "./llm";

const env = loadEnv();
if (env.LLM_PROVIDER === "none") {
  console.error("Set LLM_PROVIDER, LLM_MODEL and LLM_API_KEY in .env first.");
  process.exit(1);
}

const engine = new StoryEngine(createLLMProvider(env));
const character = CHARACTERS[0];
const world = WORLDS[0];
if (!character || !world) throw new Error("story content is missing");

const childLines = {
  "en-IN": "Let's open the door!",
  "hi-IN": "चलो दरवाज़ा खोलते हैं!",
  "mr-IN": "चला दार उघडूया!",
} as const;

let failures = 0;
for (const language of ["en-IN", "hi-IN", "mr-IN"] as const) {
  console.log(`\n=== ${language} ===`);
  let ctx: PromptContext = {
    character,
    world,
    language,
    ageBand: "5-6",
    // Test content only: a made-up hero name, never a real child's.
    memory: emptyMemory({ world: world.name, currentLocation: "Crystal Cave", mainCharacter: "Test" }),
    recentTurns: [],
  };

  const started = await engine.takeTurn(ctx, {
    type: "start",
    hook: world.storyHooks[0] ?? "A new adventure begins.",
  });
  if (!started.ok) {
    failures++;
    console.log(`FAILED to start (${started.reason})`);
    continue;
  }
  console.log(`${character.name}: ${started.narration}`);

  const childText = childLines[language];
  ctx = {
    ...ctx,
    memory: started.memory,
    recentTurns: [{ role: "character", text: started.narration }],
  };
  const turn = await engine.takeTurn(ctx, { type: "child", text: childText });
  if (!turn.ok) {
    failures++;
    console.log(`FAILED on the child's turn (${turn.reason})`);
    continue;
  }
  console.log(`Child: ${childText}`);
  console.log(`${character.name}: ${turn.narration}`);
  console.log(
    `Saved memory -> mission: "${turn.memory.mission}" | location: "${turn.memory.currentLocation}" | choices: ${turn.memory.childChoices.join(" ; ")}`,
  );
}

console.log(failures === 0 ? "\nAll languages worked." : `\n${failures} language(s) failed.`);
process.exit(failures === 0 ? 0 : 1);