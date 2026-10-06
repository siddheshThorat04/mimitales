import { createHash } from "node:crypto";
import type { Redis } from "ioredis";

export const MAX_LOGIN_FAILURES = 10;
const WINDOW_SECONDS = 15 * 60;

export interface LoginThrottle {
  isLocked(identifier: string): Promise<boolean>;
  recordFailure(identifier: string): Promise<void>;
  reset(identifier: string): Promise<void>;
}

const keyFor = (identifier: string) =>
  `login_fail:${createHash("sha256").update(identifier).digest("hex")}`;

export class RedisLoginThrottle implements LoginThrottle {
  constructor(private readonly redis: Redis) {}

  async isLocked(identifier: string) {
    const count = Number((await this.redis.get(keyFor(identifier))) ?? 0);
    return count >= MAX_LOGIN_FAILURES;
  }

  async recordFailure(identifier: string) {
    const key = keyFor(identifier);
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, WINDOW_SECONDS);
  }

  async reset(identifier: string) {
    await this.redis.del(keyFor(identifier));
  }
}