import type { PrismaClient } from "@mimitales/database";
import type { CatalogRepo } from "./repo";

const SELECT = { slug: true, name: true, config: true } as const;

export class PrismaCatalogRepo implements CatalogRepo {
  constructor(private readonly db: PrismaClient) {}

  listCharacters() {
    return this.db.character.findMany({
      where: { isActive: true },
      select: SELECT,
      orderBy: { name: "asc" },
    });
  }

  listWorlds() {
    return this.db.storyWorld.findMany({
      where: { isActive: true },
      select: SELECT,
      orderBy: { name: "asc" },
    });
  }
}