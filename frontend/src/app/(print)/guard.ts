import "server-only";

import { redirect } from "next/navigation";

import { getOrganisation } from "@/lib/organisation";
import type { Permission } from "@/lib/permissions";
import { can, getSession, type Session } from "@/lib/session";
import type { Organisation } from "@/types";

/**
 * What every print route does before it renders anything.
 *
 * Signed in, holding the permission the equivalent screen needs, and holding
 * the institute's details for the masthead. Three lines at the top of fifteen
 * routes, so none of them can forget one.
 *
 * This is a courtesy, not the boundary. Django refuses the print endpoint
 * behind this page to anybody without the same permission - see
 * `apps.core.printing`, where the `printable` action is mapped to the list's
 * own codename. What this prevents is a blank sheet of paper with a masthead
 * on it and nothing underneath, which reads as a broken report rather than as
 * a closed door.
 */
export async function printGuard(
  permission: Permission,
): Promise<{ session: Session; organisation: Organisation }> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session, permission)) redirect("/dashboard");

  return { session, organisation: await getOrganisation() };
}
