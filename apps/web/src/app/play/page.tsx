import Link from "next/link";
import { redirect } from "next/navigation";
import { StoryCreator } from "../../components/StoryCreator";
import { getSession } from "../../lib/auth";
import { getCatalog } from "../../lib/catalog";
import { getChildren } from "../../lib/children";
import { getStories } from "../../lib/stories";

export const dynamic = "force-dynamic";

export default async function PlayIndexPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [children, catalog, stories] = await Promise.all([getChildren(), getCatalog(), getStories()]);
  const childName = new Map((children ?? []).map((c) => [c.id, c.displayName]));

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href="/dashboard" className="text-sm text-indigo-700 underline">
        Back to dashboard
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-slate-900">Story tester</h1>
      <p className="mt-2 rounded-lg bg-amber-100 p-3 text-sm text-amber-900">
        Development tool. Use made-up test content only: no real child names or details. The safety
        layer is not built yet, so no child should use this.
      </p>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold">New story</h2>
        {children === null || catalog === null ? (
          <p className="text-red-600">Could not load data. Please refresh the page.</p>
        ) : (
          <StoryCreator
            children={children}
            characters={catalog.characters}
            csrfToken={session.csrfToken}
          />
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Your stories</h2>
        {stories === null ? (
          <p className="text-red-600">Could not load stories. Please refresh the page.</p>
        ) : stories.length === 0 ? (
          <p className="text-sm text-slate-600">No stories yet.</p>
        ) : (
          <ul className="space-y-2">
            {stories.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4"
              >
                <div>
                  <p className="font-semibold text-slate-900">{s.title}</p>
                  <p className="text-sm text-slate-600">
                    {childName.get(s.childId) ?? "Unknown child"} · {s.language} · {s.episodeCount}{" "}
                    episode(s)
                  </p>
                </div>
                <Link
                  href={`/play/${s.id}`}
                  className="rounded-full border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}