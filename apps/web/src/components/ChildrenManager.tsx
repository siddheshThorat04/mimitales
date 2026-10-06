"use client";

import { AGE_BANDS, PHASE1_LANGUAGES } from "@mimitales/shared";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Child } from "../lib/types";

const MAX_CHILDREN = 5;

const LANGUAGE_NAMES: Record<string, string> = {
  "en-IN": "English",
  "hi-IN": "हिन्दी (Hindi)",
  "mr-IN": "मराठी (Marathi)",
};

const ERRORS: Record<string, string> = {
  LIMIT_REACHED: `You can add up to ${MAX_CHILDREN} children.`,
  INVALID_INPUT: "Please check the name: letters and numbers only, up to 30 characters.",
  NOT_FOUND: "That profile no longer exists. Please refresh the page.",
};
const GENERIC = "Something went wrong. Please try again.";

interface Values {
  displayName: string;
  ageBand: string;
  preferredLanguage: string;
}

const languageName = (code: string) => LANGUAGE_NAMES[code] ?? code;
const ageLabel = (band: string) => `${band.replace("-", "–")} years`;

/** Returns an error message, or null on success. */
async function send(
  method: string,
  url: string,
  csrf: string,
  body?: Values,
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "x-csrf-token": csrf, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return null;
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    return (data?.error ? ERRORS[data.error] : undefined) ?? GENERIC;
  } catch {
    return "Could not reach the server. Please try again.";
  }
}

function ChildForm(props: {
  initial?: Child;
  submitLabel: string;
  busy: boolean;
  onSubmit: (values: Values) => void;
  onCancel: () => void;
}) {
  function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    props.onSubmit({
      displayName: String(form.get("displayName") ?? ""),
      ageBand: String(form.get("ageBand") ?? ""),
      preferredLanguage: String(form.get("preferredLanguage") ?? ""),
    });
  }

  const field = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2";

  return (
    <form onSubmit={handle} className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
      <label className="block text-sm font-medium text-slate-700">
        Name or nickname
        <input
          name="displayName"
          required
          maxLength={30}
          defaultValue={props.initial?.displayName}
          className={field}
        />
        <span className="mt-1 block text-xs text-slate-500">
          A first name or nickname is enough. Please don&apos;t enter surnames, schools or addresses.
        </span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium text-slate-700">
          Age
          <select name="ageBand" defaultValue={props.initial?.ageBand ?? "5-6"} className={field}>
            {AGE_BANDS.map((band) => (
              <option key={band} value={band}>
                {ageLabel(band)}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Language
          <select
            name="preferredLanguage"
            defaultValue={props.initial?.preferredLanguage ?? "en-IN"}
            className={field}
          >
            {PHASE1_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {languageName(code)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={props.busy}
          className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {props.busy ? "Saving..." : props.submitLabel}
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-white"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ChildrenManager({ items, csrfToken }: { items: Child[]; csrfToken: string }) {
  const router = useRouter();
  // null = nothing open, "new" = add form, otherwise the id of the child being edited
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(id: string | null, values: Values) {
    setBusy(true);
    setError(null);
    const failure = await send(
      id ? "PATCH" : "POST",
      id ? `/api/children/${id}` : "/api/children",
      csrfToken,
      values,
    );
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    setEditing(null);
    router.refresh();
  }

  async function remove(child: Child) {
    const sure = window.confirm(
      `Delete ${child.displayName}'s profile? Their stories will be deleted too. This cannot be undone.`,
    );
    if (!sure) return;
    setBusy(true);
    setError(null);
    const failure = await send("DELETE", `/api/children/${child.id}`, csrfToken);
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {items.length === 0 && editing !== "new" && (
        <p className="text-sm text-slate-600">No children yet. Add your first profile to begin.</p>
      )}

      {items.map((child) =>
        editing === child.id ? (
          <ChildForm
            key={child.id}
            initial={child}
            submitLabel="Save changes"
            busy={busy}
            onSubmit={(values) => void save(child.id, values)}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <div
            key={child.id}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4"
          >
            <div>
              <p className="font-semibold text-slate-900">{child.displayName}</p>
              <p className="text-sm text-slate-600">
                {ageLabel(child.ageBand)} · {languageName(child.preferredLanguage)}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setError(null);
                  setEditing(child.id);
                }}
                disabled={busy}
                className="rounded-full border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100"
              >
                Edit
              </button>
              <button
                onClick={() => void remove(child)}
                disabled={busy}
                className="rounded-full border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          </div>
        ),
      )}

      {editing === "new" && (
        <ChildForm
          submitLabel="Add child"
          busy={busy}
          onSubmit={(values) => void save(null, values)}
          onCancel={() => setEditing(null)}
        />
      )}

      {editing === null && items.length < MAX_CHILDREN && (
        <button
          onClick={() => {
            setError(null);
            setEditing("new");
          }}
          className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Add a child
        </button>
      )}
      {items.length >= MAX_CHILDREN && (
        <p className="text-xs text-slate-500">
          You&apos;ve reached the limit of {MAX_CHILDREN} profiles.
        </p>
      )}
    </div>
  );
}