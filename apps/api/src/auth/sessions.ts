import { createHash, randomBytes } from "node:crypto";
import type { Redis } from "ioredis";

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface SessionData {
  parentId: string;
  csrfToken: string;
  createdAt: number;
}

export interface SessionStore {
  create(parentId: string): Promise<{ token: string; data: SessionData }>;
  get(token: string): Promise<SessionData | null>;
  destroy(token: string): Promise<void>;
  destroyAllForParent(parentId: string): Promise<void>;
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

export class RedisSessionStore implements SessionStore {
  constructor(private readonly redis: Redis) {}

  async create(parentId: string) {
    const token = newToken();
    const data: SessionData = { parentId, csrfToken: newToken(), createdAt: Date.now() };
    const key = `sess:${hashToken(token)}`;
    const setKey = `user_sessions:${parentId}`;
    await this.redis
      .multi()
      .set(key, JSON.stringify(data), "EX", SESSION_TTL_SECONDS)
      .sadd(setKey, key)
      .expire(setKey, SESSION_TTL_SECONDS)
      .exec();
    return { token, data };
  }

  async get(token: string) {
    const raw = await this.redis.get(`sess:${hashToken(token)}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SessionData;
    } catch {
      return null;
    }
  }

  async destroy(token: string) {
    const key = `sess:${hashToken(token)}`;
    const data = await this.get(token);
    await this.redis.del(key);
    if (data) await this.redis.srem(`user_sessions:${data.parentId}`, key);
  }

  async destroyAllForParent(parentId: string) {
    const setKey = `user_sessions:${parentId}`;
    const keys = await this.redis.smembers(setKey);
    if (keys.length > 0) await this.redis.del(...keys);
    await this.redis.del(setKey);
  }
}