import { timingSafeEqual } from "node:crypto";
import cookie from "@fastify/cookie";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { dummyHash, hashPassword, verifyPassword } from "./password";
import type { AuthRepo } from "./repo";
import { SESSION_TTL_SECONDS, type SessionData, type SessionStore } from "./sessions";
import type { LoginThrottle } from "./throttle";

export const SESSION_COOKIE = "mt_session";

export interface AuthDeps {
  repo: AuthRepo;
  sessions: SessionStore;
  throttle: LoginThrottle;
  webOrigin: string;
  secureCookies: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    session: SessionData | null;
    sessionToken: string | null;
  }
}

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const registerBody = z.object({ email: emailSchema, password: z.string().min(10).max(128) });
const loginBody = z.object({ email: emailSchema, password: z.string().min(1).max(128) });

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function invalid(reply: FastifyReply, error: z.ZodError) {
  // Field names only. Never echo submitted values back.
  const fields = [...new Set(error.issues.map((i) => i.path.join(".")))];
  return reply.code(400).send({ error: "INVALID_INPUT", fields });
}

export async function registerAuth(app: FastifyInstance, deps: AuthDeps) {
  await app.register(cookie);
  app.decorateRequest("session", null);
  app.decorateRequest("sessionToken", null);

  app.addHook("onRequest", async (req, reply) => {
    if (req.url.startsWith("/auth/")) reply.header("cache-control", "no-store");
    if (MUTATING.has(req.method)) {
      const origin = req.headers.origin;
      if (origin !== undefined && origin !== deps.webOrigin) {
        return reply.code(403).send({ error: "BAD_ORIGIN" });
      }
    }
  });

  async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
    const token = req.cookies[SESSION_COOKIE];
    const data = token ? await deps.sessions.get(token) : null;
    if (!token || !data) return reply.code(401).send({ error: "UNAUTHENTICATED" });
    req.session = data;
    req.sessionToken = token;
  }

  async function requireCsrf(req: FastifyRequest, reply: FastifyReply) {
    const sent = req.headers["x-csrf-token"];
    const expected = req.session?.csrfToken;
    if (typeof sent !== "string" || !expected || !safeEqual(sent, expected)) {
      return reply.code(403).send({ error: "BAD_CSRF" });
    }
  }

  async function startSession(reply: FastifyReply, parentId: string) {
    const { token, data } = await deps.sessions.create(parentId);
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: deps.secureCookies,
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    return data;
  }

  async function audit(req: FastifyRequest, action: string, parentId: string | null) {
    try {
      await deps.repo.audit(action, parentId, req.id);
    } catch (err) {
      req.log.warn({ err: err instanceof Error ? err.message : String(err) }, "audit log failed");
    }
  }

  app.post(
    "/auth/register",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const parsed = registerBody.safeParse(req.body);
      if (!parsed.success) return invalid(reply, parsed.error);

      const passwordHash = await hashPassword(parsed.data.password);
      const created = await deps.repo.createParent({ email: parsed.data.email, passwordHash });
      if (created === "EMAIL_TAKEN") return reply.code(409).send({ error: "EMAIL_TAKEN" });

      const session = await startSession(reply, created.id);
      await audit(req, "auth.register", created.id);
      return reply
        .code(201)
        .send({ parent: { id: created.id, email: created.email }, csrfToken: session.csrfToken });
    },
  );

  app.post(
    "/auth/login",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const parsed = loginBody.safeParse(req.body);
      if (!parsed.success) return invalid(reply, parsed.error);
      const { email, password } = parsed.data;

      if (await deps.throttle.isLocked(email)) {
        return reply.code(429).send({ error: "TOO_MANY_ATTEMPTS" });
      }

      const parent = await deps.repo.findParentByEmail(email);
      const ok = await verifyPassword(parent?.passwordHash ?? (await dummyHash()), password);
      if (!parent || !ok) {
        await deps.throttle.recordFailure(email);
        await audit(req, "auth.login_failed", parent?.id ?? null);
        return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
      }

      await deps.throttle.reset(email);
      // New session on every login; drop any session presented with this request.
      const previous = req.cookies[SESSION_COOKIE];
      if (previous) await deps.sessions.destroy(previous);

      const session = await startSession(reply, parent.id);
      await audit(req, "auth.login", parent.id);
      return reply
        .code(200)
        .send({ parent: { id: parent.id, email: parent.email }, csrfToken: session.csrfToken });
    },
  );

  app.post("/auth/logout", { preHandler: [requireAuth, requireCsrf] }, async (req, reply) => {
    if (req.sessionToken) await deps.sessions.destroy(req.sessionToken);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    await audit(req, "auth.logout", req.session?.parentId ?? null);
    return reply.code(204).send();
  });

  app.post("/auth/logout-all", { preHandler: [requireAuth, requireCsrf] }, async (req, reply) => {
    if (req.session) await deps.sessions.destroyAllForParent(req.session.parentId);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    await audit(req, "auth.logout_all", req.session?.parentId ?? null);
    return reply.code(204).send();
  });

  app.get("/auth/me", { preHandler: requireAuth }, async (req, reply) => {
    const session = req.session;
    const parent = session ? await deps.repo.findParentById(session.parentId) : null;
    if (!session || !parent) {
      if (req.sessionToken) await deps.sessions.destroy(req.sessionToken);
      return reply.code(401).send({ error: "UNAUTHENTICATED" });
    }
    return { parent, csrfToken: session.csrfToken };
  });

  // Exported for later milestones (children, stories, wallet...).
  return { requireAuth, requireCsrf };
}