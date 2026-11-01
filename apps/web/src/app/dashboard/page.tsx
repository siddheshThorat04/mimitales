import { redirect } from "next/navigation";
import { CharacterCatalog } from "../../components/CharacterCatalog";
import { ChildrenManager } from "../../components/ChildrenManager";
import { LogoutButton } from "../../components/LogoutButton";
import { getSession } from "../../lib/auth";
import { getCatalog } from "../../lib/catalog";
import { getChildren } from "../../lib/children";

export const dynamic = "force-dynamic";

type Readiness = {
  status: string;
  checks?: { database: string; redis: string };
};

async function getReadiness(): Promise<Readiness | null> {
  const apiUrl = process.env.API_URL ?? "http://localhost:4000";
  try {
    const res = await fetch(`${apiUrl}/ready`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    return (await res.json()) as Readiness;
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [readiness, children, catalog] = await Promise.all([
    getReadiness(),
    getChildren(),
    getCatalog(),
  ]);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-900">Parent dashboard</h1>
        <LogoutButton csrfToken={session.csrfToken} />
      </header>
      <p className="mt-2 text-slate-600">Signed in as {session.parent.email}</p>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Children</h2>
        {children === null ? (
          <p className="text-red-600">Could not load profiles. Please refresh the page.</p>
        ) : (
          <ChildrenManager items={children} csrfToken={session.csrfToken} />
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Meet the characters</h2>
        {catalog === null ? (
          <p className="text-red-600">Could not load characters. Please refresh the page.</p>
        ) : (
          <CharacterCatalog characters={catalog.characters} worlds={catalog.worlds} />
        )}
        <p className="mt-3 text-sm">
          <a href="/play" className="text-indigo-700 underline">
            Open the story tester (development)
          </a>
        </p>
      </section>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">System status</h2>
        {readiness === null ? (
          <p className="mt-2 text-red-600">API unreachable</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            <li>Overall: {readiness.status}</li>
            <li>Database: {readiness.checks?.database ?? "unknown"}</li>
            <li>Redis: {readiness.checks?.redis ?? "unknown"}</li>
          </ul>
        )}
      </section>
    </main>
  );
}