import { LANGUAGE_CODES, LANGUAGE_NAMES, PHASE1_LANGUAGES } from "@mimitales/shared";
import {
  characterConfigSchema,
  toPublicCharacter,
  toPublicWorld,
  worldConfigSchema,
  type PublicCharacter,
  type PublicWorld,
} from "@mimitales/story-engine";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { CatalogRepo } from "./repo";

type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

export interface CatalogRouteDeps {
  repo: CatalogRepo;
  guards: { requireAuth: Guard };
}

export async function registerCatalogRoutes(app: FastifyInstance, deps: CatalogRouteDeps) {
  const preHandler = [deps.guards.requireAuth];

  app.get("/characters", { preHandler }, async (req) => {
    const characters: PublicCharacter[] = [];
    for (const row of await deps.repo.listCharacters()) {
      const parsed = characterConfigSchema.safeParse(row.config);
      if (!parsed.success) {
        // Bad stored data must not take the whole catalog down.
        req.log.warn({ slug: row.slug }, "invalid character config skipped");
        continue;
      }
      characters.push(toPublicCharacter(parsed.data));
    }
    return { characters };
  });

  app.get("/worlds", { preHandler }, async (req) => {
    const worlds: PublicWorld[] = [];
    for (const row of await deps.repo.listWorlds()) {
      const parsed = worldConfigSchema.safeParse(row.config);
      if (!parsed.success) {
        req.log.warn({ slug: row.slug }, "invalid world config skipped");
        continue;
      }
      worlds.push(toPublicWorld(parsed.data));
    }
    return { worlds };
  });

  app.get("/languages", { preHandler }, async () => ({
    languages: LANGUAGE_CODES.map((code) => ({
      code,
      name: LANGUAGE_NAMES[code].english,
      nativeName: LANGUAGE_NAMES[code].native,
      selectable: PHASE1_LANGUAGES.includes(code),
      // No language counts as voice-verified until real speech testing (Milestone 6).
      voiceVerified: false,
    })),
  }));
}