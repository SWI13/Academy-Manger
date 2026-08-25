"use client";

import { createContext, useContext, useMemo } from "react";

import type { Permission } from "@/lib/permissions";
import type { Session } from "@/lib/session";

/**
 * The caller's permissions, handed down from the server.
 *
 * The shell layout already fetched this on the server; passing it through
 * context means a client component does not fetch it again on mount, which
 * would show every action button flickering into existence a moment after the
 * page.
 *
 * It is not a cache. The value is fetched fresh on the server on every page
 * render, so a revoked role disappears on the next navigation.
 */

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({
  session,
  children,
}: {
  session: Session;
  children: React.ReactNode;
}) {
  return (
    <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
  );
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error("useSession must be used inside the signed-in shell.");
  }
  return session;
}

/**
 * Whether to render a control.
 *
 * This is a UX affordance and nothing else. The button being hidden is not
 * what stops an unauthorized approval - Django is. Someone who calls the
 * endpoint directly gets 403 whatever this returns, and someone who edits the
 * permission array in devtools gets a button that does not work.
 */
export function useCan(): (permission: Permission) => boolean {
  const session = useSession();
  const held = useMemo(
    () => new Set<string>(session.permissions),
    [session.permissions],
  );
  return (permission: Permission) => held.has(permission);
}
