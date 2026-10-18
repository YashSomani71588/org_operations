"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, login } from "@/lib/auth";
import { ArrowRight, LoaderCircle } from "lucide-react";

export function AuthForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!errorMessage) return;
    const timeoutId = window.setTimeout(() => setErrorMessage(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [errorMessage]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await login({ email, password });
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.code === "INVALID_CREDENTIALS") {
        setErrorMessage("Email or password is incorrect.");
      } else if (error instanceof ApiError) {
        setErrorMessage("We could not complete that request. Please try again.");
      } else {
        setErrorMessage("Unable to reach the service. Is the backend running?");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-card w-full max-w-md rounded-3xl border p-6 shadow-xl shadow-slate-950/10 sm:p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-950">Welcome back</h2>
        <p className="auth-copy mt-2 text-sm leading-6">
          Sign in with an assigned department account.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm font-medium text-slate-800">
          Work email
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            pattern="^[^\s@]+@[^\s@]+\.[^\s@]{2,}$"
            className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
            placeholder="you@company.com"
          />
        </label>

        <label className="block text-sm font-medium text-slate-800">
          Password
          <input
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            minLength={8}
            className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
            placeholder="At least 8 characters"
          />
        </label>

        {errorMessage && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="auth-submit flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          {isSubmitting ? "Please wait..." : "Sign in securely"}
        </button>
      </form>

    </section>
  );
}
