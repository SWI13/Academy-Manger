import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";

import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in · SM Academy" };

export default async function LoginPage() {
  // Already signed in? There is nothing to do here.
  if (await getSession()) redirect("/dashboard");

  return (
    <main className="flex min-h-svh items-center justify-center bg-paper px-4 py-12">
      <div className="w-full max-w-sm">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            SM Academy
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Sign in to continue.
          </p>
        </header>

        <div className="rounded border border-rule bg-surface p-6">
          <LoginForm />
        </div>

        <p className="mt-6 text-sm text-ink-faint">
          Lost your password? Ask reception to reset it — they can issue a new
          one, but nobody can read your old one.
        </p>
      </div>
    </main>
  );
}
