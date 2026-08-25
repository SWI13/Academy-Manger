import "server-only";

import { cookies } from "next/headers";

import { getJson } from "./django";
import type { Permission } from "./permissions";

/**
 * Who is signed in, asked of Django on every render.
 *
 * Deliberately not cached and not stored in a cookie of our own. The
 * permission set is the thing that decides what a screen offers, and a cached
 * copy means a revoked role keeps working until something expires. Django
 * already resolves this from a version-stamped cache, so the cost is a
 * request on the internal network, not a database round trip.
 *
 * Note what this is *for*: choosing what to render. It is never what stops an
 * unauthorized action - see `useCan`.
 */

export type Session = {
  public_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  primary_role: "OWNER" | "ADMIN" | "RECEPTION" | "PROFESSOR" | "STUDENT";
  status: string;
  last_login: string | null;
  roles: string[];
  permissions: Permission[];
};

export async function cookieHeader(): Promise<string> {
  const store = await cookies();
  return store
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

export async function getSession(): Promise<Session | null> {
  return getJson<Session>("/api/v1/auth/me/", await cookieHeader());
}

export function can(session: Session | null, permission: Permission): boolean {
  return Boolean(session?.permissions.includes(permission));
}
