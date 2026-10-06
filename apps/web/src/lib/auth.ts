import { cookies } from "next/headers";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

// Must match SESSION_COOKIE in apps/api/src/auth/routes.ts
export const SESSION_COOKIE = "mt_session";

export interface SessionInfo {
  parent: { id: string; email: string };
  csrfToken: string;
}

/** Asks the API whether the session cookie is valid. Real check, not just "cookie exists". */
export async function getSession(): Promise<SessionInfo | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return (await res.json()) as SessionInfo;
  } catch {
    return null;
  }
}