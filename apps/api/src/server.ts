import { loadEnv } from "@mimitales/config";
import { prisma } from "@mimitales/database";
import { Redis } from "ioredis";
import { buildApp } from "./app";

const env = loadEnv();

const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });
redis.on("error", (err) => {
  console.error("redis error:", err.message);
});

const app = await buildApp({
  checks: {
    database: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
    redis: async () => {
      await redis.ping();
    },
  },
});

async function shutdown(signal: string) {
  app.log.info({ signal }, "shutting down");
  await app.close();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}