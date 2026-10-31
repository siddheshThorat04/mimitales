import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { SESSION_COOKIE } from "../auth/routes";
import { makeTestAuth } from "../auth/testing";
import { MemoryChildRepo } from "./testing";
import { makeTestCatalog } from "../catalog/testing";
import { makeTestStories } from "../stories/testing";
let app: FastifyInstance | undefined;

type Who = { cookie: string; csrf: string };
type Method = "GET" | "POST" | "PATCH" | "DELETE";

async function setup() {
  const instance = await buildApp({
    logger: false,
    auth: makeTestAuth(),
    children: new MemoryChildRepo(),
    stories: makeTestStories(),
    catalog: makeTestCatalog(),
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

  return { instance, signUp, call };
}

const mia = { displayName: "Mia", ageBand: "5-6" };

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("children", () => {
  it("requires authentication", async () => {
    const { instance } = await setup();
    expect((await instance.inject({ method: "GET", url: "/children" })).statusCode).toBe(401);
    expect(
      (await instance.inject({ method: "POST", url: "/children", payload: mia })).statusCode,
    ).toBe(401);
  });

  it("creates a child with the default language and lists it without internal ids", async () => {
    const { signUp, call } = await setup();
    const a = await signUp("a@example.com");
    const created = await call(a, "POST", "/children", mia);
    expect(created.statusCode).toBe(201);
    expect(created.json().child.preferredLanguage).toBe("en-IN");

    const list = await call(a, "GET", "/children");
    expect(list.json().children).toHaveLength(1);
    expect(list.json().children[0].displayName).toBe("Mia");
    expect(list.body).not.toContain("parentId");
  });

  it("rejects invalid input and creates nothing", async () => {
    const { signUp, call } = await setup();
    const a = await signUp("a@example.com");
    const bad = [
      { displayName: "", ageBand: "5-6" },
      { displayName: "x".repeat(31), ageBand: "5-6" },
      { displayName: "<script>alert(1)</script>", ageBand: "5-6" },
      { displayName: "Mia", ageBand: "11-12" },
      { displayName: "Mia", ageBand: "5-6", preferredLanguage: "ta-IN" },
      { displayName: "Mia", ageBand: "5-6", parentId: "someone-else" },
    ];
    for (const payload of bad) {
      expect((await call(a, "POST", "/children", payload)).statusCode).toBe(400);
    }
    expect((await call(a, "GET", "/children")).json().children).toEqual([]);
  });

  it("accepts names in Indian scripts", async () => {
    const { signUp, call } = await setup();
    const a = await signUp("a@example.com");
    const res = await call(a, "POST", "/children", {
      displayName: "आर्य",
      ageBand: "7-8",
      preferredLanguage: "mr-IN",
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().child.displayName).toBe("आर्य");
  });

  it("requires a CSRF token for changes", async () => {
    const { signUp, call } = await setup();
    const a = await signUp("a@example.com");
    expect((await call(a, "POST", "/children", mia, false)).statusCode).toBe(403);
    expect((await call(a, "GET", "/children")).json().children).toEqual([]);
  });

  it("keeps one parent's children invisible and untouchable to another", async () => {
    const { signUp, call } = await setup();
    const a = await signUp("a@example.com");
    const b = await signUp("b@example.com");
    const id = (await call(a, "POST", "/children", mia)).json().child.id as string;

    expect((await call(b, "GET", "/children")).json().children).toEqual([]);

    const patch = await call(b, "PATCH", `/children/${id}`, { displayName: "Hacked" });
    const del = await call(b, "DELETE", `/children/${id}`);
    expect(patch.statusCode).toBe(404);
    expect(del.statusCode).toBe(404);

    // Same answer as for an id that does not exist, so existence is not revealed.
    const missing = await call(b, "DELETE", "/children/6f1c2b1e-0000-4000-8000-000000000000");
    expect(del.body).toBe(missing.body);

    const after = (await call(a, "GET", "/children")).json().children;
    expect(after).toHaveLength(1);
    expect(after[0].displayName).toBe("Mia");
  });

  it("treats a malformed id as not found", async () => {
    const { signUp, call } = await setup();
    const a = await signUp("a@example.com");
    expect((await call(a, "PATCH", "/children/not-a-uuid", { displayName: "X" })).statusCode).toBe(404);
    expect((await call(a, "DELETE", "/children/not-a-uuid")).statusCode).toBe(404);
  });

  it("updates selected fields only and rejects empty or unknown fields", async () => {
    const { signUp, call } = await setup();
    const a = await signUp("a@example.com");
    const id = (await call(a, "POST", "/children", mia)).json().child.id as string;

    const ok = await call(a, "PATCH", `/children/${id}`, { preferredLanguage: "hi-IN" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().child).toMatchObject({
      displayName: "Mia",
      ageBand: "5-6",
      preferredLanguage: "hi-IN",
    });

    expect((await call(a, "PATCH", `/children/${id}`, {})).statusCode).toBe(400);
    expect((await call(a, "PATCH", `/children/${id}`, { parentId: "x" })).statusCode).toBe(400);
  });

  it("deletes a child", async () => {
    const { signUp, call } = await setup();
    const a = await signUp("a@example.com");
    const id = (await call(a, "POST", "/children", mia)).json().child.id as string;
    expect((await call(a, "DELETE", `/children/${id}`)).statusCode).toBe(204);
    expect((await call(a, "GET", "/children")).json().children).toEqual([]);
    expect((await call(a, "DELETE", `/children/${id}`)).statusCode).toBe(404);
  });

  it("limits each parent to 5 children without affecting other parents", async () => {
    const { signUp, call } = await setup();
    const a = await signUp("a@example.com");
    const b = await signUp("b@example.com");
    for (let i = 0; i < 5; i++) {
      expect((await call(a, "POST", "/children", mia)).statusCode).toBe(201);
    }
    const sixth = await call(a, "POST", "/children", mia);
    expect(sixth.statusCode).toBe(409);
    expect(sixth.json().error).toBe("LIMIT_REACHED");
    expect((await call(b, "POST", "/children", mia)).statusCode).toBe(201);
  });
});