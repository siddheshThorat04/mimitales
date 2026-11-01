"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { CatalogCharacter, Child } from "../lib/types";

const ERRORS: Record<string, string> = {
  AGE_NOT_SUPPORTED: "That character is not available for this child's age.",
  LIMIT_REACHED: "This child already has the maximum number of stories.",
  CHILD_NOT_FOUND: "That child profile no longer exists.",
};

export function StoryCreator(props: {
  children: Child[];
  characters: CatalogCharacter[];
  csrfToken: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": props.csrfToken },
        body: JSON.stringify({
          childId: form.get("childId"),
          characterSlug: form.get("characterSlug"),
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        story?: { id: string };
        error?: string;
      } | null;
      if (res.ok && data?.story) {
        router.push(`/play/${data.story.id}`);
        return;
      }
      setError((data?.error ? ERRORS[data.error] : undefined) ?? "Could not create the story.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (props.children.length === 0) {
    return <p className="text-sm text-slate-600">Add a child profile on the dashboard first.</p>;
  }

  const field = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2";
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <label className="block text-sm font-medium text-slate-700">
        Child
        <select name="childId" className={field}>
          {props.children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Character
        <select name="characterSlug" className={field}>
          {props.characters.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {busy ? "Creating..." : "Create story"}
      </button>
    </form>
  );
}