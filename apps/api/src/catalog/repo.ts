export interface CatalogRow {
  slug: string;
  name: string;
  config: unknown;
}

export interface CatalogRepo {
  listCharacters(): Promise<CatalogRow[]>;
  listWorlds(): Promise<CatalogRow[]>;
}