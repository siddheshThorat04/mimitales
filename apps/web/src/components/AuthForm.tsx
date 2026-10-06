"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Mode = "login" | "register";

const COPY = {
  login: {
    title: "Welcome back",
    button: "Sign in",
    altPrompt: "New here?",
    altHref: "/register",
    altLabel: "Create an account",
    passwordAutocomplete: "current-password",
  },
  register: {
    title: "Create your parent account",
    button: "Create account",
    altPrompt: "Already have an account?",
    altHref: "/login",
    altLabel: "Sign in",
    passwordAutocomplete: "new-password",
  },
} as const;

const TOO_MANY = "Too many attempts. Please wait a few minutes and try again.";

const ERRORS: Record<string, string> = {
  INVALID_CREDENTIALS: "Email or password is incorrect.",
  EMAIL_TAKEN: "An account with this email already exists.",
  TOO_MANY_ATTEMPTS: TOO_MANY,
  INVALID_INPUT: "Please enter a valid email and a password of at least 10 characters.",
};

export function AuthForm({ mode }: { mode: Mode }) {
  const copy = COPY[mode];
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      if (res.ok) {
        router.replace("/dashboard");
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      const known = body?.error ? ERRORS[body.error] : undefined;
      setError(
        known ?? (res.status === 429 ? TOO_MANY : "Something went wrong. Please try again."),
      );
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
      <Link href="/" className="text-center text-3xl font-bold text-indigo-700">
        MimiTales
      </Link>
      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-slate-900">{copy.title}</h1>
        {mode === "register" && (
          <p className="text-sm text-slate-600">
            Accounts are for parents only. Children never sign up.
          </p>
        )}

        <label className="block text-sm font-medium text-slate-700">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Password
          <input
            name="password"
            type="password"
            required
            minLength={mode === "register" ? 10 : undefined}
            maxLength={128}
            autoComplete={copy.passwordAutocomplete}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          {mode === "register" && (
            <span className="mt-1 block text-xs text-slate-500">At least 10 characters.</span>
          )}
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy ? "Please wait..." : copy.button}
        </button>
      </form>
      <p className="text-center text-sm text-slate-600">
        {copy.altPrompt}{" "}
        <Link href={copy.altHref} className="font-medium text-indigo-700 underline">
          {copy.altLabel}
        </Link>
      </p>
    </main>
  );
}