import "server-only";

import { getJson } from "./django";
import { cookieHeader } from "./session";
import type { Organisation } from "@/types";

/**
 * The institute's own details, for the top of a printed document.
 *
 * Fetched per render like the session is, and for the same reason: an owner
 * who corrects the phone number should see it on the next receipt, not
 * whenever a cache happens to expire. It is one request on the internal
 * network against a single-row table.
 *
 * The fallback is not cosmetic. A document that cannot reach the profile
 * still has to be attributable to somebody, so it prints the platform's own
 * name rather than an empty masthead with a title floating beside it.
 */
export async function getOrganisation(): Promise<Organisation> {
  const organisation = await getJson<Organisation>(
    "/api/v1/organisation/",
    await cookieHeader(),
  );
  return organisation ?? FALLBACK;
}

const FALLBACK: Organisation = {
  name: "SM Academy",
  legal_name: "",
  address_line: "",
  city: "",
  wilaya: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  contact_line: "",
  registration_number: "",
  tagline: "",
  print_footer: "",
  can_manage: false,
  updated_at: new Date(0).toISOString(),
};
