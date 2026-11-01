import { loadEnv } from "@mimitales/config";
import { describe, expect, it } from "vitest";
import { createLLMProvider } from "./llm";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  AUTH_SECRET: "x".repeat(32),
};

describe("createLLMProvider", () => {
  it("is unconfigured by default", () => {
    expect(createLLMProvider(loadEnv(base)).name).toBe("unconfigured");
  });

  it("builds Gemini when fully configured", () => {
    const env = loadEnv({
      ...base,
      LLM_PROVIDER: "gemini",
      LLM_MODEL: "gemini-3.5-flash-lite",
      LLM_API_KEY: "k",
    });
    expect(createLLMProvider(env).name).toBe("gemini");
  });
});