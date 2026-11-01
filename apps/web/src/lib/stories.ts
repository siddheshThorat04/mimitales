import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./auth";
import type { ParentMemory, Story } from "./types";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

/** Returns null on any failure, so pages show an error instead of an empty list. */
async function apiGet<T>(path: string): Promise<T | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function getStories(): Promise<Story[] | null> {
  return (await apiGet<{ stories: Story[] }>("/stories"))?.stories ?? null;
}

export async function getStory(id: string): Promise<Story | null> {
  return (await apiGet<{ story: Story }>(`/stories/${encodeURIComponent(id)}`))?.story ?? null;
}

export async function getStoryMemory(id: string): Promise<ParentMemory | null> {
  const data = await apiGet<{ memory: ParentMemory }>(`/stories/${encodeURIComponent(id)}/memory`);
  return data?.memory ?? null;
}