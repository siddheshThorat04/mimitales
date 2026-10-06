import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";
import type { ChildRepo } from "./repo";
import { createChildBody, idSchema, updateChildBody } from "./schemas";

type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

export interface ChildRouteDeps {
  repo: ChildRepo;
  audit: (action: string, parentId: string | null, requestId: string) => Promise<void>;
  guards: { requireAuth: Guard; requireCsrf: Guard };
}

function invalid(reply: FastifyReply, error: z.ZodError) {
  // Field names only. Never echo submitted values back.
  const fields = [...new Set(error.issues.map((i) => i.path.join(".")))];
  return reply.code(400).send({ error: "INVALID_INPUT", fields });
}

const notFound = (reply: FastifyReply) => reply.code(404).send({ error: "NOT_FOUND" });
const unauthenticated = (reply: FastifyReply) =>
  reply.code(401).send({ error: "UNAUTHENTICATED" });

export async function registerChildRoutes(app: FastifyInstance, deps: ChildRouteDeps) {
  const { repo, guards } = deps;
  const read = [guards.requireAuth];
  const write = [guards.requireAuth, guards.requireCsrf];

  async function audit(req: FastifyRequest, action: string, parentId: string) {
    try {
      await deps.audit(action, parentId, req.id);
    } catch (err) {
      req.log.warn({ err: err instanceof Error ? err.message : String(err) }, "audit log failed");
    }
  }

  app.get("/children", { preHandler: read }, async (req, reply) => {
    const parentId = req.session?.parentId;
    if (!parentId) return unauthenticated(reply);
    return { children: await repo.list(parentId) };
  });

  app.post("/children", { preHandler: write }, async (req, reply) => {
    const parentId = req.session?.parentId;
    if (!parentId) return unauthenticated(reply);

    const parsed = createChildBody.safeParse(req.body);
    if (!parsed.success) return invalid(reply, parsed.error);

    const created = await repo.create(parentId, parsed.data);
    if (created === "LIMIT_REACHED") return reply.code(409).send({ error: "LIMIT_REACHED" });

    await audit(req, "child.create", parentId);
    return reply.code(201).send({ child: created });
  });

  app.patch<{ Params: { id: string } }>(
    "/children/:id",
    { preHandler: write },
    async (req, reply) => {
      const parentId = req.session?.parentId;
      if (!parentId) return unauthenticated(reply);

      const id = idSchema.safeParse(req.params.id);
      if (!id.success) return notFound(reply);

      const parsed = updateChildBody.safeParse(req.body);
      if (!parsed.success) return invalid(reply, parsed.error);

      const updated = await repo.update(parentId, id.data, parsed.data);
      if (!updated) return notFound(reply);

      await audit(req, "child.update", parentId);
      return { child: updated };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/children/:id",
    { preHandler: write },
    async (req, reply) => {
      const parentId = req.session?.parentId;
      if (!parentId) return unauthenticated(reply);

      const id = idSchema.safeParse(req.params.id);
      if (!id.success) return notFound(reply);

      if (!(await repo.remove(parentId, id.data))) return notFound(reply);

      await audit(req, "child.delete", parentId);
      return reply.code(204).send();
    },
  );
}