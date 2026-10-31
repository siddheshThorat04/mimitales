import { LLMError, type ScriptedReply } from "@mimitales/providers";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { SESSION_COOKIE } from "../auth/routes";
import { makeTestAuth } from "../auth/testing";
import { makeTestCatalog } from "../catalog/testing";
import { MemoryChildRepo } from "../children/testing";
import type { CommitResult, StoryRepo } from "./repo";
import { MemoryStoryRepo, makeTestStories } from "./testing";

const json = (value: object) => JSON.stringify(value);
const START = json({
  narration: "A sad dragon blocks the path. Will you help it?",
  stateDelta: { mission: "Help the dragon" },
});
const MISSING_ID = "6f1c2b1e-0000-4000-8000-000000000000";

type Who = { cookie: string; csrf: string };
type Method = "GET" | "POST" | "PATCH" | "DELETE";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

class AlwaysConflictRepo extends MemoryStoryRepo {
  async commit(): Promise<CommitResult> {
    return { status: "conflict" };
  }
}

async function setup(replies: ScriptedReply[] = [], repo?: StoryRepo) {
  const stories = makeTestStories(replies);
  const instance = await buildApp({
    logger: false,
    auth: makeTestAuth(),
    children: new MemoryChildRepo(),
    catalog: makeTestCatalog(),
    stories: repo ? { ...stories, repo } : stories,
    checks: { database: async () => {}, redis: async () => {} },
  });
  app = instance;

  async function signUp(email: string): Promise<Who> {
    const res = await instance.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, password: "correct horse battery" },
    });
    return {
      cookie: res.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? "",
      csrf: res.json().csrfToken as string,
    };
  }

  const call = (who: Who, method: Method, url: string, payload?: object, withCsrf = true) =>
    instance.inject({
      method,
      url,
      payload,
      cookies: { [SESSION_COOKIE]: who.cookie },
      headers: withCsrf ? { "x-csrf-token": who.csrf } : {},
    });

  async function addChild(who: Who, ageBand = "5-6") {
    const res = await call(who, "POST", "/children", { displayName: "Mia", ageBand });
    return res.json().child.id as string;
  }

  async function newStory(who: Who, childId: string, extra: object = {}) {
    const res = await call(who, "POST", "/stories", { childId, characterSlug: "lumi", ...extra });
    return { res, id: (res.json().story?.id ?? "") as string };
  }

  return { instance, stories, signUp, call, addChild, newStory };
}

describe("stories", () => {
  it("requires authentication", async () => {
    const { instance } = await setup();
    for (const [method, url] of [
      ["GET", "/stories"],
      ["POST", "/stories"],
      ["GET", `/stories/${MISSING_ID}/memory`],
    ] as const) {
      expect((await instance.inject({ method, url })).statusCode).toBe(401);
    }
  });

  it("creates a story with sensible defaults and lists it without any memory", async () => {
    const { signUp, call, addChild, newStory } = await setup();
    const a = await signUp("a@example.com");
    const childId = await addChild(a);
    const { res, id } = await newStory(a, childId);
    expect(res.statusCode).toBe(201);
    expect(res.json().story).toMatchObject({
      characterSlug: "lumi",
      worldSlug: "enchanted-forest",
      language: "en-IN",
      status: "ACTIVE",
      episodeCount: 0,
      title: "Lumi in the Enchanted Forest",
    });
    expect(res.body).not.toContain("memory");

    const list = await call(a, "GET", `/stories?childId=${childId}`);
    expect(list.json().stories.map((s: { id: string }) => s.id)).toEqual([id]);
  });

  it("rejects bad requests with a specific error", async () => {
    const { signUp, call, addChild, newStory } = await setup();
    const a = await signUp("a@example.com");
    const b = await signUp("b@example.com");
    const childId = await addChild(a);
    const littleId = await addChild(a, "3-4");

    const expectError = async (res: { statusCode: number; json: () => { error: string } }, status: number, code: string) => {
      expect(res.statusCode).toBe(status);
      expect(res.json().error).toBe(code);
    };

    await expectError((await newStory(a, childId, { characterSlug: "nobody" })).res, 400, "UNKNOWN_CHARACTER");
    await expectError((await newStory(a, childId, { worldSlug: "no-such-world" })).res, 400, "WORLD_NOT_AVAILABLE");
    await expectError((await newStory(a, littleId, { characterSlug: "nila" })).res, 400, "AGE_NOT_SUPPORTED");
    await expectError((await newStory(a, childId, { parentId: "x" })).res, 400, "INVALID_INPUT");
    await expectError((await newStory(a, childId, { language: "ta-IN" })).res, 400, "INVALID_INPUT");
    await expectError((await newStory(b, childId)).res, 404, "CHILD_NOT_FOUND");
    expect((await call(a, "GET", "/stories")).json().stories).toEqual([]);
  });

  it("limits the number of stories per child", async () => {
    const { signUp, addChild, newStory } = await setup();
    const a = await signUp("a@example.com");
    const childId = await addChild(a);
    for (let i = 0; i < 10; i++) expect((await newStory(a, childId)).res.statusCode).toBe(201);
    const eleventh = await newStory(a, childId);
    expect(eleventh.res.statusCode).toBe(409);
    expect(eleventh.res.json().error).toBe("LIMIT_REACHED");
  });

  it("starts episode 1 once", async () => {
    const { stories, signUp, call, addChild, newStory } = await setup([START]);
    const a = await signUp("a@example.com");
    const { id } = await newStory(a, await addChild(a));

    const started = await call(a, "POST", `/stories/${id}/start`);
    expect(started.statusCode).toBe(200);
    expect(started.json()).toEqual({
      narration: "A sad dragon blocks the path. Will you help it?",
      episodeNumber: 1,
      episodeEnded: false,
      degraded: false,
    });

    const again = await call(a, "POST", `/stories/${id}/start`);
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe("ALREADY_STARTED");
    expect(stories.llm.calls).toHaveLength(1);
  });

  it("changes nothing when the model fails, so starting can simply be retried", async () => {
    const { signUp, call, addChild, newStory } = await setup([
      new LLMError("down", "provider"),
      new LLMError("still down", "provider"),
      START,
    ]);
    const a = await signUp("a@example.com");
    const { id } = await newStory(a, await addChild(a));

    const failed = await call(a, "POST", `/stories/${id}/start`);
    expect(failed.statusCode).toBe(200);
    expect(failed.json().degraded).toBe(true);
    expect(failed.json().narration.length).toBeGreaterThan(0);
    expect(failed.body).not.toContain("reason");
    expect((await call(a, "GET", `/stories/${id}`)).json().story.episodeCount).toBe(0);

    const retry = await call(a, "POST", `/stories/${id}/start`);
    expect(retry.json()).toMatchObject({ degraded: false, episodeNumber: 1 });
  });

  it("plays a turn, remembers it, and sends recent history to the model", async () => {
    const { stories, signUp, call, addChild, newStory } = await setup([
      START,
      json({
        narration: "The dragon smiles!",
        stateDelta: { addFriends: ["Ember"], lastSceneSummary: "Mia helped Ember." },
      }),
    ]);
    const a = await signUp("a@example.com");
    const { id } = await newStory(a, await addChild(a));
    await call(a, "POST", `/stories/${id}/start`);

    const turn = await call(a, "POST", `/stories/${id}/turn`, { text: "Help the dragon" });
    expect(turn.json()).toMatchObject({ narration: "The dragon smiles!", episodeNumber: 1, degraded: false });

    const view = (await call(a, "GET", `/stories/${id}/memory`)).json();
    expect(view.memory.friends).toEqual(["Ember"]);
    expect(view.memory.mission).toBe("Help the dragon");

    const secondRequest = stories.llm.calls[1]?.messages ?? [];
    expect(secondRequest.some((m) => m.role === "assistant" && m.content.includes("sad dragon"))).toBe(true);
    expect(secondRequest.at(-1)?.content).toBe("<child_speech>Help the dragon</child_speech>");
  });

  it("ends an episode automatically, clears recent turns, and continues in a new episode", async () => {
    const { stories, signUp, call, addChild, newStory } = await setup([
      START,
      json({ narration: "And they lived happily!", stateDelta: {}, episodeShouldEnd: true }),
      json({ summary: "Mia helped Ember the dragon." }),
      json({ narration: "Ember waves from the hill.", stateDelta: {} }),
    ]);
    const a = await signUp("a@example.com");
    const { id } = await newStory(a, await addChild(a));
    await call(a, "POST", `/stories/${id}/start`);

    const ending = await call(a, "POST", `/stories/${id}/turn`, { text: "Help the dragon" });
    expect(ending.json()).toMatchObject({ episodeEnded: true, episodeNumber: 1 });
    expect(await stories.history.get(id)).toEqual([]);

    const blocked = await call(a, "POST", `/stories/${id}/turn`, { text: "More?" });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error).toBe("NO_OPEN_EPISODE");

    const next = await call(a, "POST", `/stories/${id}/continue`);
    expect(next.json()).toMatchObject({ episodeNumber: 2, degraded: false });
    expect(stories.llm.calls[3]?.messages.at(-1)?.content).toContain("Mia helped Ember the dragon.");
    expect((await call(a, "GET", `/stories/${id}`)).json().story.episodeCount).toBe(2);
  });

  it("cannot continue a story that was never started", async () => {
    const { signUp, call, addChild, newStory } = await setup();
    const a = await signUp("a@example.com");
    const { id } = await newStory(a, await addChild(a));
    const res = await call(a, "POST", `/stories/${id}/continue`);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("NOT_STARTED");
  });

  it("lets a parent end an episode manually, once", async () => {
    const { signUp, call, addChild, newStory } = await setup([
      START,
      json({ summary: "Mia met a dragon." }),
    ]);
    const a = await signUp("a@example.com");
    const { id } = await newStory(a, await addChild(a));
    await call(a, "POST", `/stories/${id}/start`);
    expect((await call(a, "POST", `/stories/${id}/end`)).statusCode).toBe(204);
    const again = await call(a, "POST", `/stories/${id}/end`);
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe("NO_OPEN_EPISODE");
  });

  it("keeps one parent's stories invisible and untouchable to another", async () => {
    const { stories, signUp, call, addChild, newStory } = await setup([START]);
    const a = await signUp("a@example.com");
    const b = await signUp("b@example.com");
    const { id } = await newStory(a, await addChild(a));
    await call(a, "POST", `/stories/${id}/start`);

    const attempts: [Method, string][] = [
      ["GET", `/stories/${id}`],
      ["POST", `/stories/${id}/start`],
      ["POST", `/stories/${id}/continue`],
      ["POST", `/stories/${id}/turn`],
      ["POST", `/stories/${id}/end`],
      ["GET", `/stories/${id}/memory`],
      ["DELETE", `/stories/${id}`],
    ];
    for (const [method, url] of attempts) {
      const payload = url.endsWith("/turn") ? { text: "hi" } : undefined;
      const res = await call(b, method, url, payload);
      const missing = await call(b, method, url.replace(id, MISSING_ID), payload);
      expect(res.statusCode).toBe(404);
      // Identical to a story that does not exist, so existence is not revealed.
      expect(res.body).toBe(missing.body);
    }
    expect((await call(b, "GET", "/stories")).json().stories).toEqual([]);
    expect(stories.llm.calls).toHaveLength(1);
    expect((await call(a, "GET", `/stories/${id}`)).statusCode).toBe(200);
  });

  it("requires CSRF for changes and treats malformed ids as not found", async () => {
    const { signUp, call, addChild, newStory } = await setup();
    const a = await signUp("a@example.com");
    const childId = await addChild(a);
    const { id } = await newStory(a, childId);
    expect((await call(a, "POST", "/stories", { childId, characterSlug: "lumi" }, false)).statusCode).toBe(403);
    for (const path of ["start", "continue", "end"]) {
      expect((await call(a, "POST", `/stories/${id}/${path}`, undefined, false)).statusCode).toBe(403);
    }
    expect((await call(a, "POST", `/stories/${id}/turn`, { text: "hi" }, false)).statusCode).toBe(403);
    expect((await call(a, "DELETE", `/stories/${id}`, undefined, false)).statusCode).toBe(403);
    expect((await call(a, "GET", "/stories/not-a-uuid")).statusCode).toBe(404);
    expect((await call(a, "POST", "/stories/not-a-uuid/start")).statusCode).toBe(404);
  });

  it("shows parents the story so far, but never the child's choices or facts", async () => {
    const { signUp, call, addChild, newStory } = await setup([
      START,
      json({
        narration: "You helped!",
        stateDelta: {
          addChoices: ["Secret choice text"],
          addEvents: ["Secret event text"],
          setFacts: { dragonHelped: true },
          addFriends: ["Ember"],
        },
      }),
    ]);
    const a = await signUp("a@example.com");
    const { id } = await newStory(a, await addChild(a));
    await call(a, "POST", `/stories/${id}/start`);
    await call(a, "POST", `/stories/${id}/turn`, { text: "Help the dragon" });

    const res = await call(a, "GET", `/stories/${id}/memory`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Ember");
    for (const hidden of ["Secret choice text", "Secret event text", "dragonHelped", "childChoices", "facts", "importantEvents"]) {
      expect(res.body).not.toContain(hidden);
    }
  });

  it("deletes a story and its recent turns", async () => {
    const { stories, signUp, call, addChild, newStory } = await setup([START]);
    const a = await signUp("a@example.com");
    const { id } = await newStory(a, await addChild(a));
    await call(a, "POST", `/stories/${id}/start`);
    expect((await stories.history.get(id)).length).toBeGreaterThan(0);

    expect((await call(a, "DELETE", `/stories/${id}`)).statusCode).toBe(204);
    expect((await call(a, "GET", `/stories/${id}`)).statusCode).toBe(404);
    expect(await stories.history.get(id)).toEqual([]);
    expect((await call(a, "DELETE", `/stories/${id}`)).statusCode).toBe(404);
  });

  it("answers 409 and keeps nothing when a save loses a race", async () => {
    const { stories, signUp, call, addChild, newStory } = await setup([START], new AlwaysConflictRepo());
    const a = await signUp("a@example.com");
    const { id } = await newStory(a, await addChild(a));
    const res = await call(a, "POST", `/stories/${id}/start`);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("CONFLICT");
    expect(await stories.history.get(id)).toEqual([]);
  });
});