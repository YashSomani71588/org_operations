import { AuthForm } from "@/components/auth/auth-form";
import { ThemeToggle } from "@/components/theme-toggle";

export default function HomePage() {
  return (
    <main className="login-page min-h-screen px-6 py-10 lg:grid lg:place-items-center">
      <ThemeToggle className="login-theme-toggle" />
      <div className="login-shell grid w-full max-w-6xl overflow-hidden rounded-3xl border shadow-2xl shadow-black/20 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="login-promo hidden border-r p-12 text-white lg:block">
          <a
            className="newtonite-link inline-flex items-center gap-3"
            href="https://www.newtonite.in/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visit Newtonite's official website"
          >
            <span className="grid size-11 place-items-center bg-black text-sm font-bold">N°</span>
            <span className="text-sm font-bold tracking-[0.18em]">NEWTONITE</span>
          </a>

          <p className="mt-14 text-sm font-semibold uppercase tracking-[0.2em] text-blue-100">
            Operations workspace
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
              <a
                className="newtonite-link inline-flex items-center gap-3"
                href="https://www.newtonite.in/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Visit Newtonite's official website"
              >
                <span className="grid size-10 place-items-center bg-black text-sm font-bold text-white">N°</span>
                <span className="text-sm font-bold tracking-[0.16em]">NEWTONITE</span>
              </a>
            </div>

            <p className="text-sm font-medium text-blue-300">Secure workspace access</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              Manage work that matters.
            </h2>
            <p className="login-content-copy mt-3 text-sm leading-6">
              Sign in with your organization account to continue.
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
