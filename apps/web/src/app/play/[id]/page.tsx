import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StoryPlayer } from "../../../components/StoryPlayer";
import { getSession } from "../../../lib/auth";
import { getCatalog } from "../../../lib/catalog";
import { getStory, getStoryMemory } from "../../../lib/stories";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: string | string[] }) {
  const text = Array.isArray(value) ? value.join(", ") : value;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{text || "—"}</dd>
    </div>
  );
}

export default async function PlayStoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const [story, memory, catalog] = await Promise.all([
    getStory(id),
    getStoryMemory(id),
    getCatalog(),
  ]);
  if (!story) notFound();
  const characterName =
    catalog?.characters.find((c) => c.slug === story.characterSlug)?.name ?? "Storyteller";

  return (
    <main className="mx-auto max-w-5xl p-8">
      <Link href="/play" className="text-sm text-indigo-700 underline">
        All stories
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">{story.title}</h1>
      <p className="text-sm text-slate-600">
        Language: {story.language} · Episodes so far: {story.episodeCount}
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-[2fr_1fr]">
        <StoryPlayer
          storyId={story.id}
          characterName={characterName}
          csrfToken={session.csrfToken}
          episodeCount={story.episodeCount}
        />
        <aside className="h-fit rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Story so far (parent view)</h2>
          {memory === null ? (
            <p className="text-sm text-red-600">Could not load.</p>
          ) : (
            <dl className="space-y-3">
              <Row label="Location" value={memory.currentLocation} />
              <Row label="Mission" value={memory.mission} />
              <Row label="Problem" value={memory.currentProblem} />
              <Row label="Next goal" value={memory.nextGoal} />
              <Row label="Friends" value={memory.friends} />
              <Row label="Inventory" value={memory.inventory} />
              <Row label="Last scene" value={memory.lastSceneSummary} />
            </dl>
          )}
        </aside>
      </div>
    </main>
  );
}