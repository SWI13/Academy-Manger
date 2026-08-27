"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ApiFailure, api } from "@/lib/api";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
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
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
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

      <div className="relative">
        <Field
          label="Password"
          name="password"
          type={reveal ? "text" : "password"}
          autoComplete="current-password"
          required
          icon="lock"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="pr-10"
        />
        {/*
          Bottom-anchored rather than vertically centred: the label sits above
          the input, so centring on the wrapper would put this over the label.
        */}
        <button
          type="button"
          onClick={() => setReveal((current) => !current)}
          aria-label={reveal ? "Hide password" : "Show password"}
          aria-pressed={reveal}
          className="absolute bottom-[2px] right-1 inline-flex size-8 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-sunk hover:text-ink"
        >
          <Icon name="eye" size={16} />
        </button>
      </div>

      {/*
        The failure, in the semantic red rather than the brand crimson.
        They are close in hue and this is the one screen where both could
        appear, so the error carries a wash, a border and an icon while the
        button is solid crimson with white on it. Nobody has to tell them
        apart by hue alone.
      */}
      {error ? (
        <p
          role="alert"
          className="animate-rise flex items-start gap-2 rounded-lg border border-bad-line bg-bad-wash px-3 py-2.5 text-sm text-bad"
        >
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}

      <Button
        type="submit"
        variant="brand"
        size="lg"
        block
        busy={busy}
        className="mt-1 text-[15px] tracking-[0.01em]"
        trailing={busy ? undefined : "arrow-right"}
      >
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
