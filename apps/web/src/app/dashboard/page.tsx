import { redirect } from "next/navigation";
import { LogoutButton } from "../../components/LogoutButton";
import { getSession } from "../../lib/auth";

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

  const readiness = await getReadiness();

  return (
    <main className="mx-auto max-w-3xl p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-900">Parent dashboard</h1>
        <LogoutButton csrfToken={session.csrfToken} />
      </header>
      <p className="mt-2 text-slate-600">Signed in as {session.parent.email}</p>
      <p className="mt-1 text-slate-600">
        Child profiles arrive in Milestone 2.
      </p>

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