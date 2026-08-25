"use client";

import { useEffect } from "react";

import { Button, LinkButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/**
 * Something threw while rendering a signed-in page.
 *
 * Deliberately no error text on the screen. What reaches this boundary is a
 * message written for whoever wrote the code - a stack frame, a serializer
 * key, sometimes a hostname - and none of it helps the person at the desk. It
 * goes to the console, where a developer can find it, and the reader gets a
 * sentence and two things to try.
 *
 * The shell is still around this: the navigation stays usable, so a failed
 * page is one broken screen rather than a broken application.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page failed to render:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
      <span
        aria-hidden
        className="mb-4 flex size-12 items-center justify-center rounded-full border border-warn-line bg-warn-wash text-warn"
      >
        <Icon name="alert" size={22} />
      </span>

      <h1 className="text-lg font-semibold text-ink">
        This page did not load
      </h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
        Something went wrong on the way here. Nothing you were doing has been
        saved or changed — trying again is safe.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button variant="primary" icon="loader" onClick={reset}>
          Try again
        </Button>
        <LinkButton href="/dashboard" icon="gauge">
          Back to the dashboard
        </LinkButton>
      </div>

      {error.digest ? (
        <p className="tabular mt-6 text-xs text-ink-faint">
          Reference {error.digest}
        </p>
      ) : null}
    </div>
  );
}
