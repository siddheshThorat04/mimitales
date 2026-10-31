import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";
import { idSchema } from "../children/schemas";
import { createStoryBody, listQuery, turnBody } from "./schemas";
import type { Result, StoryService, TurnOutcome } from "./service";

type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

export interface StoryRouteDeps {
  service: StoryService;
  guards: { requireAuth: Guard; requireCsrf: Guard };
}

const turnLimit = { rateLimit: { max: 30, timeWindow: "1 minute" } };

function invalid(reply: FastifyReply, error: z.ZodError) {
  // Field names only. Never echo submitted values back.
  const fields = [...new Set(error.issues.map((i) => i.path.join(".")))];
  return reply.code(400).send({ error: "INVALID_INPUT", fields });
}

const notFound = (reply: FastifyReply) => reply.code(404).send({ error: "NOT_FOUND" });
const unauthenticated = (reply: FastifyReply) => reply.code(401).send({ error: "UNAUTHENTICATED" });

function parseId(raw: string): string | null {
  const parsed = idSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function respond<T>(reply: FastifyReply, result: Result<T>, status = 200) {
  if (!result.ok) return reply.code(result.status).send({ error: result.error });
  return reply.code(status).send(result.value);
}

function respondTurn(req: FastifyRequest, reply: FastifyReply, result: Result<TurnOutcome>) {
  if (!result.ok) return reply.code(result.status).send({ error: result.error });
  const { reason, ...publicOutcome } = result.value;
  if (reason) req.log.warn({ reason }, "story turn degraded");
  return reply.code(200).send(publicOutcome);
}

export async function registerStoryRoutes(app: FastifyInstance, deps: StoryRouteDeps) {
  const { service, guards } = deps;
  const read = [guards.requireAuth];
  const write = [guards.requireAuth, guards.requireCsrf];

  app.post("/stories", { preHandler: write }, async (req, reply) => {
    const parentId = req.session?.parentId;
    if (!parentId) return unauthenticated(reply);
    const parsed = createStoryBody.safeParse(req.body);
    if (!parsed.success) return invalid(reply, parsed.error);
    const result = await service.create(parentId, parsed.data);
    return result.ok ? reply.code(201).send({ story: result.value }) : respond(reply, result);
  });

  app.get("/stories", { preHandler: read }, async (req, reply) => {
    const parentId = req.session?.parentId;
    if (!parentId) return unauthenticated(reply);
    const query = listQuery.safeParse(req.query);
    if (!query.success) return invalid(reply, query.error);
    return { stories: await service.list(parentId, query.data.childId) };
  });

  app.get<{ Params: { id: string } }>("/stories/:id", { preHandler: read }, async (req, reply) => {
    const parentId = req.session?.parentId;
    const id = parseId(req.params.id);
    if (!parentId) return unauthenticated(reply);
    if (!id) return notFound(reply);
    const result = await service.get(parentId, id);
    return result.ok ? { story: result.value } : respond(reply, result);
  });

  app.delete<{ Params: { id: string } }>("/stories/:id", { preHandler: write }, async (req, reply) => {
    const parentId = req.session?.parentId;
    const id = parseId(req.params.id);
    if (!parentId) return unauthenticated(reply);
    if (!id) return notFound(reply);
    const result = await service.remove(parentId, id);
    return result.ok ? reply.code(204).send() : respond(reply, result);
  });

  app.get<{ Params: { id: string } }>(
    "/stories/:id/memory",
    { preHandler: read },
    async (req, reply) => {
      const parentId = req.session?.parentId;
      const id = parseId(req.params.id);
      if (!parentId) return unauthenticated(reply);
      if (!id) return notFound(reply);
      return respond(reply, await service.memoryView(parentId, id));
    },
  );

  for (const mode of ["start", "continue"] as const) {
    app.post<{ Params: { id: string } }>(
      `/stories/:id/${mode}`,
      { preHandler: write, config: turnLimit },
      async (req, reply) => {
        const parentId = req.session?.parentId;
        const id = parseId(req.params.id);
        if (!parentId) return unauthenticated(reply);
        if (!id) return notFound(reply);
        return respondTurn(req, reply, await service.begin(parentId, id, mode));
      },
    );
  }

  app.post<{ Params: { id: string } }>(
    "/stories/:id/turn",
    { preHandler: write, config: turnLimit },
    async (req, reply) => {
      const parentId = req.session?.parentId;
      const id = parseId(req.params.id);
      if (!parentId) return unauthenticated(reply);
      if (!id) return notFound(reply);
      const body = turnBody.safeParse(req.body);
      if (!body.success) return invalid(reply, body.error);
      return respondTurn(req, reply, await service.childTurn(parentId, id, body.data.text));
    },
  );

  app.post<{ Params: { id: string } }>("/stories/:id/end", { preHandler: write }, async (req, reply) => {
    const parentId = req.session?.parentId;
    const id = parseId(req.params.id);
    if (!parentId) return unauthenticated(reply);
    if (!id) return notFound(reply);
    const result = await service.endEpisode(parentId, id);
    return result.ok ? reply.code(204).send() : respond(reply, result);
  });
}