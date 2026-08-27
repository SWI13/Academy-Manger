import { redirect } from "next/navigation";

import { ErrorState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Toolbar } from "@/components/ui/Toolbar";
import { getJson } from "@/lib/django";
import type { SearchParams } from "@/lib/list";
import { can, cookieHeader, getSession } from "@/lib/session";
import type { AuditLog } from "@/types";

import { AuditFeed } from "./AuditFeed";

export const metadata = { title: "Audit log" };

const FILTERS = ["action", "actor", "object_type", "object_id", "from", "to"];

// Grouped the way the catalogue groups permissions, so the dropdown reads as
// a list of things that happen rather than an alphabet of constants.
const ACTIONS = [
  { value: "LOGIN_FAILED", label: "Failed login" },
  { value: "USER_CREATED", label: "User created" },
  { value: "USER_UPDATED", label: "User updated" },
  { value: "USER_STATUS_CHANGED", label: "User status changed" },
  { value: "PASSWORD_RESET", label: "Password reset" },
  { value: "ROLE_GRANTED", label: "Role granted" },
  { value: "ROLE_REVOKED", label: "Role revoked" },
  { value: "ENROLLMENT_CREATED", label: "Student enrolled" },
  { value: "MARK_CHANGED", label: "Mark changed" },
  { value: "MARKS_PUBLISHED", label: "Marks published" },
  { value: "PAYMENT_CREATED", label: "Payment recorded" },
  { value: "PAYMENT_APPROVED", label: "Payment approved" },
  { value: "PAYMENT_REJECTED", label: "Payment rejected" },
  { value: "PROOF_DOWNLOADED", label: "Proof downloaded" },
  { value: "REVIEW_MODERATED", label: "Review moderated" },
  { value: "REPORT_EXPORTED", label: "Report exported" },
  { value: "EXPORT_DOWNLOADED", label: "Export downloaded" },
];

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const session = await getSession();

  // Owner only. An admin manages the institute but cannot read the record of
  // what they did - checked here as well as hidden from the nav, because the
  // nav is presentation and this is the page itself.
  if (!can(session, "audit.view")) redirect("/dashboard");

  const query = new URLSearchParams();
  for (const key of FILTERS) {
    const value = Array.isArray(params[key]) ? params[key][0] : params[key];
    if (value) query.set(key, value);
  }

  const page = await getJson<{ results: AuditLog[]; next: string | null }>(
    `/api/v1/audit/${query.toString() ? `?${query}` : ""}`,
    await cookieHeader(),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Audit log"
        lede="Append-only, enforced by the database rather than by convention — there is no endpoint that edits or deletes a row at any version, and the actions most worth recording here are exactly the ones someone would want to erase."
      />

      <Toolbar
        filters={[
          { param: "action", label: "Action", options: ACTIONS },
          { param: "actor", label: "Who", placeholder: "REC-000001" },
          {
            param: "object_type",
            label: "On what",
            options: [
              { value: "User", label: "A person" },
              { value: "Payment", label: "A payment" },
              { value: "Course", label: "A course" },
              { value: "Enrollment", label: "An enrolment" },
              { value: "Review", label: "A review" },
              { value: "ReportExport", label: "An export" },
            ],
          },
          { param: "from", label: "From" },
          { param: "to", label: "To" },
        ]}
      />

      {!page ? (
        <ErrorState title="The log could not be read" />
      ) : (
        <AuditFeed initial={page.results} initialNext={page.next} />
      )}
    </div>
  );
}
