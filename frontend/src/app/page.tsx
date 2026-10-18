import { AuthForm } from "@/components/auth/auth-form";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100 lg:grid lg:place-items-center">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/30 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden border-r border-slate-800 bg-gradient-to-br from-blue-600 via-blue-700 to-slate-950 p-12 lg:block">
          <div className="grid size-11 place-items-center rounded-xl bg-white/15 text-xl font-bold">
            N
          </div>

          <p className="mt-14 text-sm font-semibold uppercase tracking-[0.2em] text-blue-100">
            Newtonite Challenge
          </p>

          <h1 className="mt-4 max-w-md text-5xl font-bold leading-tight tracking-tight">
            Calm operations, even under pressure.
          </h1>

          <p className="mt-6 max-w-md text-base leading-7 text-blue-100/90">
            A role-aware workspace for teams to investigate, assign, approve,
            and resolve critical operational work.
          </p>

          <div className="mt-12 space-y-4 text-sm text-blue-50">
            <p>✓ Secure HTTP-only authentication</p>
            <p>✓ Role-aware permissions</p>
            <p>✓ PostgreSQL-backed operations data</p>
          </div>
        </section>

        <section className="flex min-h-[680px] items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <div className="grid size-10 place-items-center rounded-xl bg-blue-500 text-lg font-bold">
                N
              </div>
              <p className="mt-5 text-sm font-semibold uppercase tracking-[0.16em] text-blue-300">
                Newtonite Operations
              </p>
            </div>

            <p className="text-sm font-medium text-blue-300">Secure workspace access</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              Manage work that matters.
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Sign in to your account, or create an employee account to get started.
            </p>

            <div className="mt-8">
              <AuthForm />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}