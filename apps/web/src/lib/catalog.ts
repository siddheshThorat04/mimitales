import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./auth";
import type { CatalogCharacter, CatalogWorld } from "./types";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export interface Catalog {
  characters: CatalogCharacter[];
  worlds: CatalogWorld[];
}

/** Returns null on any failure so the page shows an error instead of an empty catalog. */
export async function getCatalog(): Promise<Catalog | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const init = () => ({
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
    cache: "no-store" as const,
    signal: AbortSignal.timeout(3000),
  });
  try {
    const [c, w] = await Promise.all([
      fetch(`${API_URL}/characters`, init()),
      fetch(`${API_URL}/worlds`, init()),
    ]);
    if (!c.ok || !w.ok) return null;
    const characters = ((await c.json()) as { characters: CatalogCharacter[] }).characters;
    const worlds = ((await w.json()) as { worlds: CatalogWorld[] }).worlds;
    return { characters, worlds };
  } catch {
    return null;
  }
}