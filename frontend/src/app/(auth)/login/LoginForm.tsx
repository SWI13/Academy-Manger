"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { ApiFailure, api } from "@/lib/api";

export function LoginForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await api.post("/auth/login/", { identifier, password });
      // A full navigation, not a client-side push: the shell reads the
      // session on the server, and it must be read after the cookie exists.
      router.replace("/dashboard");
      router.refresh();
    } catch (failure) {
      if (failure instanceof ApiFailure) {
        // Deliberately the backend's own wording. It says "those details do
        // not match an active account" without saying which half was wrong,
        // and rephrasing it here is how that gets undone.
        setError(failure.message);
      } else {
        setError("Could not reach the server. Try again.");
      }
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field
        label="ID or phone number"
        name="identifier"
        autoComplete="username"
        required
        value={identifier}
        onChange={(event) => setIdentifier(event.target.value)}
        placeholder="STU-000042"
        hint="The identifier printed on your card, or the number you registered."
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />

      {error ? (
        <p
          role="alert"
          className="rounded border border-bad/30 bg-bad-wash px-3 py-2 text-sm text-bad"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" busy={busy} className="mt-1 py-2">
        Sign in
      </Button>
    </form>
  );
}
