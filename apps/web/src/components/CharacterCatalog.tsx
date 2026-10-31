"use client";

import { LANGUAGE_NAMES } from "@mimitales/shared";
import { useState } from "react";
import type { CatalogCharacter, CatalogWorld } from "../lib/types";

const LANGS = ["en-IN", "hi-IN", "mr-IN"] as const;
type Lang = (typeof LANGS)[number];

function ageRange(bands: string[]) {
  const numbers = bands.flatMap((band) => band.split("-").map(Number));
  return `${Math.min(...numbers)}–${Math.max(...numbers)} years`;
}

export function CharacterCatalog(props: {
  characters: CatalogCharacter[];
  worlds: CatalogWorld[];
}) {
  const [lang, setLang] = useState<Lang>("en-IN");
  const worldNames = new Map(props.worlds.map((w) => [w.slug, w.name]));

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Language" className="flex gap-2">
        {LANGS.map((code) => (
          <button
            key={code}
            onClick={() => setLang(code)}
            aria-pressed={lang === code}
            className={
              lang === code
                ? "rounded-full bg-indigo-600 px-3 py-1 text-sm font-medium text-white"
                : "rounded-full border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100"
            }
          >
            {LANGUAGE_NAMES[code].native}
          </button>
        ))}
      </div>

      {props.characters.length === 0 && (
        <p className="text-sm text-slate-600">No characters are available right now.</p>
      )}

      {props.characters.map((c) => (
        <article key={c.slug} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-lg font-semibold text-slate-900">{c.name}</h3>
            <span className="text-xs text-slate-500">{ageRange(c.ageBands)}</span>
          </div>
          <p lang={lang.slice(0, 2)} className="mt-1 font-medium text-indigo-700">
            {c.tagline[lang]}
          </p>
          <p lang={lang.slice(0, 2)} className="mt-1 text-sm text-slate-600">
            {c.description[lang]}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Worlds: {c.worlds.map((slug) => worldNames.get(slug) ?? slug).join(", ")}
          </p>
        </article>
      ))}

      <p className="text-xs text-slate-500">
        Story adventures with these characters are coming soon.
      </p>
    </div>
  );
}