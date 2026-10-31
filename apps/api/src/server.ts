import { loadEnv } from "@mimitales/config";
import { prisma } from "@mimitales/database";
import { Redis } from "ioredis";
import { buildApp } from "./app";
import { PrismaAuthRepo } from "./auth/prisma-repo";
import { RedisSessionStore } from "./auth/sessions";
import { RedisLoginThrottle } from "./auth/throttle";
import { PrismaCatalogRepo } from "./catalog/prisma-repo";
import { PrismaChildRepo } from "./children/prisma-repo";
import { UnconfiguredLLMProvider } from "@mimitales/providers";
import { StoryEngine } from "@mimitales/story-engine";
import { RedisTurnHistory } from "./stories/history";
import { PrismaStoryRepo } from "./stories/prisma-repo";
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
  auth: {
    repo: new PrismaAuthRepo(prisma),
    sessions: new RedisSessionStore(redis),
    throttle: new RedisLoginThrottle(redis),
    webOrigin: env.WEB_ORIGIN,
    secureCookies: env.NODE_ENV === "production",
  },
    children: new PrismaChildRepo(prisma),
    catalog: new PrismaCatalogRepo(prisma),
    stories: {
    repo: new PrismaStoryRepo(prisma),
    engine: new StoryEngine(new UnconfiguredLLMProvider()),
    history: new RedisTurnHistory(redis),
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