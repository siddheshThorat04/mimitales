import { CHARACTERS, WORLDS } from "@mimitales/story-engine";
import type { CatalogRepo, CatalogRow } from "./repo";

export class MemoryCatalogRepo implements CatalogRepo {
  constructor(
    private readonly characters: CatalogRow[],
    private readonly worlds: CatalogRow[],
  ) {}

  async listCharacters() {
    return this.characters;
  }

  async listWorlds() {
    return this.worlds;
  }
}

export const contentCharacterRows: CatalogRow[] = CHARACTERS.map((c) => ({
  slug: c.slug,
  name: c.name,
  config: c,
}));

export const contentWorldRows: CatalogRow[] = WORLDS.map((w) => ({
  slug: w.slug,
  name: w.name,
  config: w,
}));

export const makeTestCatalog = () => new MemoryCatalogRepo(contentCharacterRows, contentWorldRows);