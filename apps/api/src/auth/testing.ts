import { randomUUID } from "node:crypto";
import type { AuthRepo, ParentRecord } from "./repo";
import type { AuthDeps } from "./routes";
import { hashToken, newToken, type SessionData, type SessionStore } from "./sessions";
import { MAX_LOGIN_FAILURES, type LoginThrottle } from "./throttle";

export const TEST_ORIGIN = "http://localhost:3000";

export class MemoryAuthRepo implements AuthRepo {
  readonly parents = new Map<string, ParentRecord>();
  readonly auditLog: { action: string; parentId: string | null }[] = [];

  async findParentByEmail(email: string) {
    return [...this.parents.values()].find((p) => p.email === email) ?? null;
  }

  async findParentById(id: string) {
    const p = this.parents.get(id);
    return p ? { id: p.id, email: p.email } : null;
  }

  async createParent(input: { email: string; passwordHash: string }) {
    if (await this.findParentByEmail(input.email)) return "EMAIL_TAKEN" as const;
    const record: ParentRecord = { id: randomUUID(), ...input };
    this.parents.set(record.id, record);
    return record;
  }

  async audit(action: string, parentId: string | null) {
    this.auditLog.push({ action, parentId });
  }
}

export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionData>();

  async create(parentId: string) {
    const token = newToken();
    const data: SessionData = { parentId, csrfToken: newToken(), createdAt: Date.now() };
    this.sessions.set(hashToken(token), data);
    return { token, data };
  }

  async get(token: string) {
    return this.sessions.get(hashToken(token)) ?? null;
  }

  async destroy(token: string) {
    this.sessions.delete(hashToken(token));
  }

  async destroyAllForParent(parentId: string) {
    for (const [key, data] of this.sessions) {
      if (data.parentId === parentId) this.sessions.delete(key);
    }
  }
}

export class MemoryLoginThrottle implements LoginThrottle {
  private readonly failures = new Map<string, number>();

  async isLocked(identifier: string) {
    return (this.failures.get(identifier) ?? 0) >= MAX_LOGIN_FAILURES;
  }

  async recordFailure(identifier: string) {
    this.failures.set(identifier, (this.failures.get(identifier) ?? 0) + 1);
  }

  async reset(identifier: string) {
    this.failures.delete(identifier);
  }
}

export function makeTestAuth(): AuthDeps & { repo: MemoryAuthRepo } {
  return {
    repo: new MemoryAuthRepo(),
    sessions: new MemorySessionStore(),
    throttle: new MemoryLoginThrottle(),
    webOrigin: TEST_ORIGIN,
    secureCookies: false,
  };
}