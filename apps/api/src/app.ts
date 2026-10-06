import { randomUUID } from "node:crypto";
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";

export interface HealthChecks {
  database: () => Promise<void>;
  redis: () => Promise<void>;
}

export interface AppOptions {
  checks: HealthChecks;
  logger?: boolean;
}

const CHECK_TIMEOUT_MS = 2000;

async function runCheck(
  name: string,
  check: () => Promise<void>,
  log: FastifyBaseLogger,
): Promise<"ok" | "down"> {
  try {
    await Promise.race([
      check(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), CHECK_TIMEOUT_MS),
      ),
    ]);
    return "ok";
  } catch (err) {
    // Log the reason server-side only; the client just sees "down".
    log.warn({ check: name, err: err instanceof Error ? err.message : String(err) }, "readiness check failed");
    return "down";
  }
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      opts.logger === false
        ? false
        : { redact: ["req.headers.authorization", "req.headers.cookie"] },
    // Always generate our own ID; never trust a client-supplied one.
    genReqId: () => randomUUID(),
  });

  await app.register(helmet);
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  app.addHook("onRequest", async (req, reply) => {
    reply.header("x-request-id", req.id);
  });

  // Liveness: the process is up.
  app.get("/health", async () => ({ status: "ok" }));

  // Readiness: dependencies are reachable.
  app.get("/ready", async (_req, reply) => {
    const [database, redis] = await Promise.all([
      runCheck("database", opts.checks.database, app.log),
      runCheck("redis", opts.checks.redis, app.log),
    ]);
    const ok = database === "ok" && redis === "ok";
    return reply.code(ok ? 200 : 503).send({
      status: ok ? "ok" : "degraded",
      checks: { database, redis },
    });
  });

  return app;
}