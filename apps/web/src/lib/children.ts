import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./auth";
import type { Child } from "./types";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

/** Returns null (not an empty list) when loading fails, so the page never shows a false "no children". */
export async function getChildren(): Promise<Child[] | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/children`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { children: Child[] };
    return body.children;
  } catch {
    return null;
  }
}