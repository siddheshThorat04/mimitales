"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

interface Line {
  who: "character" | "child" | "note";
  text: string;
}

interface Outcome {
  narration: string;
  episodeNumber: number | null;
  episodeEnded: boolean;
  degraded: boolean;
}

const ERRORS: Record<string, string> = {
  ALREADY_STARTED: "This story was already started. Press Continue.",
  NOT_STARTED: "This story has not started yet. Press Start.",
  NO_OPEN_EPISODE: "No episode is open. Press Continue to begin the next one.",
  CONFLICT: "The story changed at the same moment. Please try again.",
  STORY_NOT_ACTIVE: "This story is not active.",
  NOT_FOUND: "This story no longer exists.",
};
const GENERIC = "Something went wrong. Please try again.";

export function StoryPlayer(props: {
  storyId: string;
  characterName: string;
  csrfToken: string;
  episodeCount: number;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");

  const add = (...next: Line[]) => setLines((current) => [...current, ...next]);

  async function run(path: "start" | "continue" | "turn" | "end", body?: object, childText?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/stories/${props.storyId}/${path}`, {
        method: "POST",
        headers: {
          "x-csrf-token": props.csrfToken,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 204) {
        add({ who: "note", text: "Episode ended." });
        setPlaying(false);
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => null)) as (Outcome & { error?: string }) | null;
      if (!res.ok || !data || typeof data.narration !== "string") {
        setError((data?.error ? ERRORS[data.error] : undefined) ?? GENERIC);
        return;
      }
      if (childText) add({ who: "child", text: childText });
      add({ who: "character", text: data.narration });
      if (data.degraded) {
        add({ who: "note", text: "The storyteller stumbled, so nothing was saved. Try again." });
      } else if (data.episodeEnded) {
        add({ who: "note", text: "Episode ended." });
        setPlaying(false);
      } else {
        setPlaying(true);
      }
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  function onSend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText("");
    void run("turn", { text: value }, value);
  }

  const button = "rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60";
  return (
    <div className="space-y-3">
      <div className="min-h-48 space-y-2 rounded-lg border border-slate-200 bg-white p-4">
        {lines.length === 0 && (
          <p className="text-sm text-slate-500">
            {props.episodeCount === 0
              ? "Press Start to begin the story."
              : "Press Continue to pick the story up again."}
          </p>
        )}
        {lines.map((line, i) => (
          <p
            key={i}
            className={
              line.who === "child"
                ? "text-right text-indigo-700"
                : line.who === "note"
                  ? "text-center text-xs italic text-slate-500"
                  : "text-slate-900"
            }
          >
            {line.who === "character" && <strong>{props.characterName}: </strong>}
            {line.text}
          </p>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {props.episodeCount === 0 && lines.length === 0 ? (
          <button
            onClick={() => void run("start")}
            disabled={busy}
            className={`${button} bg-indigo-600 text-white hover:bg-indigo-700`}
          >
            Start
          </button>
        ) : (
          <button
            onClick={() => void run("continue")}
            disabled={busy || playing}
            className={`${button} bg-indigo-600 text-white hover:bg-indigo-700`}
          >
            Continue
          </button>
        )}
        <button
          onClick={() => void run("end")}
          disabled={busy || !playing}
          className={`${button} border border-slate-300 hover:bg-slate-100`}
        >
          End episode
        </button>
      </div>

      <form onSubmit={onSend} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy || !playing}
          maxLength={500}
          placeholder={playing ? "What does the child say?" : "Start or continue first"}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
        />
        <button
          type="submit"
          disabled={busy || !playing}
          className={`${button} bg-indigo-600 text-white hover:bg-indigo-700`}
        >
          Send
        </button>
      </form>
    </div>
  );
}