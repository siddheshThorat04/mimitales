import { describe, expect, it } from "vitest";
import { loadEnv } from "./index";

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  AUTH_SECRET: "x".repeat(32),
};

describe("loadEnv", () => {
  it("accepts a valid environment and applies safe defaults", () => {
    const env = loadEnv(valid);
    expect(env.DATA_MINIMIZATION).toBe(true);
    expect(env.AUDIO_RETENTION).toBe(false);
    expect(env.NODE_ENV).toBe("development");
  });

  it("rejects a short AUTH_SECRET without echoing its value", () => {
    expect(() => loadEnv({ ...valid, AUTH_SECRET: "short" })).toThrow(/AUTH_SECRET/);
    try {
      loadEnv({ ...valid, AUTH_SECRET: "short" });
    } catch (e) {
      expect(String(e)).not.toContain("short\n");
    }
  });

  it("rejects missing variables", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });
});