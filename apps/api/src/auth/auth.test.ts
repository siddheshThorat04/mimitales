import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { SESSION_COOKIE } from "./routes";
import { makeTestAuth } from "./testing";

const creds = { email: "Parent@Example.com", password: "correct horse battery" };

let app: FastifyInstance | undefined;

async function setup() {
  const auth = makeTestAuth();
  const instance = await buildApp({
    logger: false,
    auth,
    checks: { database: async () => {}, redis: async () => {} },
  });
  app = instance;
  return {
    auth,
    register: (payload: object = creds) =>
      instance.inject({ method: "POST", url: "/auth/register", payload }),
    login: (payload: object, cookie?: string) =>
      instance.inject({
        method: "POST",
        url: "/auth/login",
        payload,
        cookies: cookie ? { [SESSION_COOKIE]: cookie } : {},
      }),
    me: (cookie: string) =>
      instance.inject({ method: "GET", url: "/auth/me", cookies: { [SESSION_COOKIE]: cookie } }),
    post: (url: string, cookie: string, csrf?: string) =>
      instance.inject({
        method: "POST",
        url,
        cookies: { [SESSION_COOKIE]: cookie },
        headers: csrf ? { "x-csrf-token": csrf } : {},
      }),
  };
}

const cookieOf = (res: LightMyRequestResponse) =>
  res.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? "";

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("auth", () => {
  it("registers, sets an httpOnly session cookie, and never returns the hash", async () => {
    const { register } = await setup();
    const res = await register();
    expect(res.statusCode).toBe(201);
    const setCookie = String(res.headers["set-cookie"]);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(res.body).not.toContain("argon2");
    expect(res.body).not.toContain("passwordHash");
    expect(res.json().parent.email).toBe("parent@example.com");
  });

  it("stores only an argon2id hash, never the password", async () => {
    const { register, auth } = await setup();
    await register();
    const stored = [...auth.repo.parents.values()][0];
    expect(stored?.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(stored?.passwordHash).not.toContain(creds.password);
  });

  it("rejects invalid input without echoing it", async () => {
    const { register } = await setup();
    const short = await register({ email: "a@example.com", password: "short" });
    expect(short.statusCode).toBe(400);
    expect(short.json().fields).toContain("password");
    expect(short.body).not.toContain("short");
    const badEmail = await register({ email: "not-an-email", password: creds.password });
    expect(badEmail.statusCode).toBe(400);
    expect(badEmail.json().fields).toContain("email");
  });

  it("rejects a duplicate email regardless of letter case", async () => {
    const { register } = await setup();
    await register();
    const again = await register({ email: "PARENT@example.com", password: "another long password" });
    expect(again.statusCode).toBe(409);
  });

  it("gives identical responses for a wrong password and an unknown email", async () => {
    const { register, login } = await setup();
    await register();
    const wrong = await login({ email: creds.email, password: "wrong-password-123" });
    const unknown = await login({ email: "nobody@example.com", password: "wrong-password-123" });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.body).toBe(unknown.body);
  });

  it("protects /auth/me", async () => {
    const { register, me } = await setup();
    expect((await me("garbage")).statusCode).toBe(401);
    const reg = await register();
    const res = await me(cookieOf(reg));
    expect(res.statusCode).toBe(200);
    expect(res.json().csrfToken).toBeTruthy();
    expect(res.body).not.toContain("passwordHash");
  });

  it("requires a CSRF token to log out, and logout ends the session", async () => {
    const { register, post, me } = await setup();
    const reg = await register();
    const cookie = cookieOf(reg);
    expect((await post("/auth/logout", cookie)).statusCode).toBe(403);
    expect((await post("/auth/logout", cookie, "wrong-token")).statusCode).toBe(403);
    expect((await post("/auth/logout", cookie, reg.json().csrfToken)).statusCode).toBe(204);
    expect((await me(cookie)).statusCode).toBe(401);
  });

  it("logout-all revokes every session for the account", async () => {
    const { register, login, post, me } = await setup();
    const reg = await register();
    const first = cookieOf(reg);
    const second = cookieOf(await login(creds));
    expect((await me(second)).statusCode).toBe(200);
    expect((await post("/auth/logout-all", first, reg.json().csrfToken)).statusCode).toBe(204);
    expect((await me(first)).statusCode).toBe(401);
    expect((await me(second)).statusCode).toBe(401);
  });

  it("locks an account after repeated failures, even for the right password", async () => {
    const { register, login } = await setup();
    await register();
    for (let i = 0; i < 10; i++) {
      expect((await login({ email: creds.email, password: "wrong-password-123" })).statusCode).toBe(401);
    }
    expect((await login(creds)).statusCode).toBe(429);
  });

  it("rejects cross-origin state-changing requests", async () => {
    const { auth } = await setup();
    const res = await app!.inject({
      method: "POST",
      url: "/auth/register",
      payload: creds,
      headers: { origin: "https://evil.example" },
    });
    expect(res.statusCode).toBe(403);
    expect(auth.repo.parents.size).toBe(0);
  });

  it("replaces the session on login (no session fixation)", async () => {
    const { register, login, me } = await setup();
    const old = cookieOf(await register());
    const fresh = cookieOf(await login(creds, old));
    expect(fresh).not.toBe(old);
    expect((await me(old)).statusCode).toBe(401);
    expect((await me(fresh)).statusCode).toBe(200);
  });
});