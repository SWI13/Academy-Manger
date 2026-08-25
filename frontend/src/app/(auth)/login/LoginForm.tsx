"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field, FormError } from "@/components/ui/Field";
import { ApiFailure, api } from "@/lib/api";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
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

      // Back to whatever they were reaching for, if the proxy put it in the
      // URL. Only a path from our own origin: `next=https://elsewhere` would
      // be an open redirect, and a sign-in form is exactly where one gets
      // used.
      const wanted = params.get("next");
      const target =
        wanted && wanted.startsWith("/") && !wanted.startsWith("//")
          ? wanted
          : "/dashboard";

      // A full navigation, not a client-side push: the shell reads the
      // session on the server, and it must be read after the cookie exists.
      router.replace(target);
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
        autoFocus
        required
        icon="user"
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
        icon="lock"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />

      {error ? <FormError>{error}</FormError> : null}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        busy={busy}
        className="mt-1"
        trailing={busy ? undefined : "arrow-right"}
      >
        Sign in
      </Button>
    </form>
  );
}
