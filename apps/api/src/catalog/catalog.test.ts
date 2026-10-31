import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { SESSION_COOKIE } from "../auth/routes";
import { makeTestAuth } from "../auth/testing";
import { MemoryChildRepo } from "../children/testing";
import type { CatalogRow } from "./repo";
import { MemoryCatalogRepo, contentCharacterRows, contentWorldRows } from "./testing";
import { makeTestStories } from "../stories/testing";
let app: FastifyInstance | undefined;

async function setup(characterRows: CatalogRow[] = contentCharacterRows) {
  const instance = await buildApp({
    logger: false,
    auth: makeTestAuth(),
    children: new MemoryChildRepo(),
    catalog: new MemoryCatalogRepo(characterRows, contentWorldRows),
    stories: makeTestStories(),
    checks: { database: async () => {}, redis: async () => {} },
  });
  app = instance;

  const reg = await instance.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: "a@example.com", password: "correct horse battery" },
  });
  const cookie = reg.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? "";
  const get = (url: string) =>
    instance.inject({ method: "GET", url, cookies: { [SESSION_COOKIE]: cookie } });
  return { instance, get };
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("catalog", () => {
  it("requires authentication", async () => {
    const { instance } = await setup();
    for (const url of ["/characters", "/worlds", "/languages"]) {
      expect((await instance.inject({ method: "GET", url })).statusCode).toBe(401);
    }
  });

  it("lists characters with localized text and no prompt content", async () => {
    const { get } = await setup();
    const res = await get("/characters");
    expect(res.statusCode).toBe(200);
    const { characters } = res.json() as { characters: { name: string; tagline: object }[] };
    expect(characters.map((c) => c.name).sort()).toEqual(["Bramble", "Lumi", "Nila"]);
    expect(Object.keys(characters[0]?.tagline ?? {})).toEqual(["en-IN", "hi-IN", "mr-IN"]);
    for (const hidden of ["personality", "speakingStyle", "rules", "Never ask the child"]) {
      expect(res.body).not.toContain(hidden);
    }
  });

  it("lists worlds without internal story material", async () => {
    const { get } = await setup();
    const res = await get("/worlds");
    expect(res.statusCode).toBe(200);
    expect(res.json().worlds).toHaveLength(2);
    for (const hidden of ["storyHooks", "locations", "rules"]) {
      expect(res.body).not.toContain(hidden);
    }
  });

  it("marks only Phase 1 languages selectable and none voice-verified", async () => {
    const { get } = await setup();
    const { languages } = (await get("/languages")).json() as {
      languages: { code: string; selectable: boolean; voiceVerified: boolean }[];
    };
    expect(languages).toHaveLength(12);
    expect(languages.filter((l) => l.selectable).map((l) => l.code)).toEqual([
      "en-IN",
      "hi-IN",
      "mr-IN",
    ]);
    expect(languages.every((l) => l.voiceVerified === false)).toBe(true);
  });

  it("skips a character whose stored config is invalid, but still serves the rest", async () => {
    const { get } = await setup([
      ...contentCharacterRows,
      { slug: "broken", name: "Broken", config: { nope: true } },
    ]);
    const res = await get("/characters");
    expect(res.statusCode).toBe(200);
    expect(res.json().characters).toHaveLength(3);
    expect(res.body).not.toContain("Broken");
  });
});