import type { RecentTurn } from "@mimitales/story-engine";
import type { Redis } from "ioredis";

export const HISTORY_TTL_SECONDS = 60 * 60;
export const HISTORY_MAX_TURNS = 12;

/** Ephemeral recent turns. Never written to Postgres. */
export interface TurnHistory {
  get(storyId: string): Promise<RecentTurn[]>;
  append(storyId: string, turns: RecentTurn[]): Promise<void>;
  clear(storyId: string): Promise<void>;
}

export class RedisTurnHistory implements TurnHistory {
  constructor(private readonly redis: Redis) {}

  private key(storyId: string) {
    return `story_turns:${storyId}`;
  }

  async get(storyId: string) {
    const raw = await this.redis.lrange(this.key(storyId), 0, -1);
    const turns: RecentTurn[] = [];
    for (const entry of raw) {
      try {
        const value = JSON.parse(entry) as Partial<RecentTurn>;
        if ((value.role === "child" || value.role === "character") && typeof value.text === "string") {
          turns.push({ role: value.role, text: value.text });
        }
      } catch {
        // skip a corrupt entry
      }
    }
    return turns;
  }

  async append(storyId: string, turns: RecentTurn[]) {
    if (turns.length === 0) return;
    const key = this.key(storyId);
    await this.redis
      .multi()
      .rpush(key, ...turns.map((t) => JSON.stringify(t)))
      .ltrim(key, -HISTORY_MAX_TURNS, -1)
      .expire(key, HISTORY_TTL_SECONDS)
      .exec();
  }

  async clear(storyId: string) {
    await this.redis.del(this.key(storyId));
  }
}