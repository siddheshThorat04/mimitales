import { describe, expect, it } from "vitest";
import { loadEnv } from "./index";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  AUTH_SECRET: "x".repeat(32),
};

describe("LLM settings", () => {
  it("defaults to no provider and treats blank values as unset", () => {
    const env = loadEnv({ ...base, LLM_PROVIDER: "", LLM_MODEL: "", LLM_API_KEY: "" });
    expect(env.LLM_PROVIDER).toBe("none");
    expect(env.LLM_MODEL).toBeUndefined();
    expect(env.LLM_API_KEY).toBeUndefined();
  });

  it("requires a model and key for a real provider, without leaking the key", () => {
    const secret = "super-secret-key-value";
    let message = "";
    try {
      loadEnv({ ...base, LLM_PROVIDER: "gemini", LLM_API_KEY: secret });
    } catch (e) {
      message = String(e);
    }
    expect(message).toContain("LLM_MODEL");
    expect(message).not.toContain(secret);

    const ok = loadEnv({
      ...base,
      LLM_PROVIDER: "gemini",
      LLM_MODEL: "gemini-3.5-flash-lite",
      LLM_API_KEY: secret,
    });
    expect(ok.LLM_MODEL).toBe("gemini-3.5-flash-lite");
  });
});