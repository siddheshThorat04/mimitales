import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp, type HealthChecks } from "./app";
import { makeTestAuth } from "./auth/testing";
import { MemoryChildRepo } from "./children/testing";
import { makeTestCatalog } from "./catalog/testing";
import { makeTestStories } from "./stories/testing";
const healthy: HealthChecks = {
  database: async () => {},
  redis: async () => {},
};

let app: FastifyInstance | undefined;

async function make(checks: HealthChecks) {
  app = await buildApp({ checks, auth: makeTestAuth(),  children: new MemoryChildRepo(), logger: false, catalog: makeTestCatalog(), stories: makeTestStories() });
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("api health", () => {
  it("GET /health returns ok", async () => {
    const res = await (await make(healthy)).inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("GET /ready returns ok when dependencies are up", async () => {
    const res = await (await make(healthy)).inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json().checks).toEqual({ database: "ok", redis: "ok" });
  });

  it("GET /ready returns 503 when redis is down, without leaking the error", async () => {
    const res = await (
      await make({
        ...healthy,
        redis: async () => {
          throw new Error("secret-connection-string-here");
        },
      })
    ).inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(503);
    expect(res.json().checks).toEqual({ database: "ok", redis: "down" });
    expect(res.body).not.toContain("secret-connection-string-here");
  });

  it("sets a request id and secure headers", async () => {
    const res = await (await make(healthy)).inject({ method: "GET", url: "/health" });
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("ignores a client-supplied request id", async () => {
    const res = await (await make(healthy)).inject({
      method: "GET",
      url: "/health",
      headers: { "x-request-id": "attacker-controlled" },
    });
    expect(res.headers["x-request-id"]).not.toBe("attacker-controlled");
  });
});