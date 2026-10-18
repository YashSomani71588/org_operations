"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  login,
  register
} from "@/lib/auth";
import {
  ArrowRight,
  LoaderCircle,
  ShieldCheck,
  UserPlus
} from "lucide-react";

type AuthMode = "login" | "register";

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRegistering = mode === "register";

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setErrorMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (isRegistering) {
        await register({ fullName, email, password });
      } else {
        await login({ email, password });
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "EMAIL_ALREADY_EXISTS") {
          setErrorMessage("An account already exists for this email address.");
        } else if (error.code === "INVALID_CREDENTIALS") {
          setErrorMessage("Email or password is incorrect.");
        } else if (error.code === "VALIDATION_ERROR") {
          setErrorMessage("Please check the form details and try again.");
        } else {
          setErrorMessage("We could not complete that request. Please try again.");
        }
      } else {
        setErrorMessage("Unable to reach the service. Is the backend running?");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/10 sm:p-8">
      <div className="mb-7 flex rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => switchMode("login")}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
            !isRegistering
              ? "bg-white text-slate-950 shadow-sm"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => switchMode("register")}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
            isRegistering
              ? "bg-white text-slate-950 shadow-sm"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          Create account
        </button>
      </div>

      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-950">
          {isRegistering ? "Create your workspace access" : "Welcome back"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {isRegistering
            ? "New accounts start as Employees. Administrator access is provisioned separately."
            : "Sign in to review and manage operations work."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {isRegistering && (
          <label className="block text-sm font-medium text-slate-800">
            Full name
            <input
              required
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
              placeholder="Yash Somani"
            />
          </label>
        )}

        <label className="block text-sm font-medium text-slate-800">
          Work email
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
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
            autoComplete={isRegistering ? "new-password" : "current-password"}
            minLength={8}
            className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
            placeholder="At least 8 characters"
          />
        </label>

        {errorMessage && (
          <p
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
          >
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : isRegistering ? (
            <UserPlus className="size-4" />
          ) : (
            <ArrowRight className="size-4" />
          )}
          {isSubmitting
            ? "Please wait..."
            : isRegistering
              ? "Create Employee account"
              : "Sign in securely"}
        </button>
      </form>

      <div className="mt-6 flex gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <p>
          Your session is stored in a secure HTTP-only cookie. The application
          never saves your password or access token in browser storage.
        </p>
      </div>
    </section>
  );
}