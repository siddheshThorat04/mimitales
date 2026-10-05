import { z } from "zod";

const boolString = (fallback: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(fallback)
    .transform((v) => v === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  DATA_MINIMIZATION: boolString("true"),
  AUDIO_RETENTION: boolString("false"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validate environment variables. Error messages list field names only,
 * never values, so secrets cannot leak into logs.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n  ");
    throw new Error(`Invalid environment configuration:\n  ${problems}`);
  }
  return result.data;
}