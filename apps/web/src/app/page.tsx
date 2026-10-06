import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-5xl font-bold text-indigo-700">MimiTales</h1>
      <p className="text-lg text-slate-600">
        A safe, multilingual storytelling companion for children.
      </p>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded-full bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="rounded-full border border-indigo-600 px-6 py-3 font-semibold text-indigo-700 hover:bg-indigo-50"
        >
          Create account
        </Link>
      </div>
    </main>
  );
}