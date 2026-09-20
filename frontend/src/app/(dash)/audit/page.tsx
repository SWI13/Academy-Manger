import { redirect } from "next/navigation";

import { ErrorState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Toolbar } from "@/components/ui/Toolbar";
import { getJson } from "@/lib/django";
import type { SearchParams } from "@/lib/list";
import { can, cookieHeader, getSession } from "@/lib/session";
import type { AuditLog } from "@/types";
import type { Dict } from "@/lib/dict/en";
import { getDict } from "@/lib/i18n.server";

import { AuditFeed } from "./AuditFeed";

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.nav.audit };
}

const FILTERS = ["action", "actor", "object_type", "object_id", "from", "to"];

// Grouped the way the catalogue groups permissions, so the dropdown reads as
// a list of things that happen rather than an alphabet of constants.
function actionOptions(d: Dict) {
  return [
    { value: "LOGIN_FAILED", label: d.audit.actions.loginFailed },
    { value: "USER_CREATED", label: d.audit.actions.userCreated },
    { value: "USER_UPDATED", label: d.audit.actions.userUpdated },
    { value: "USER_STATUS_CHANGED", label: d.audit.actions.userStatusChanged },
    { value: "PASSWORD_RESET", label: d.audit.actions.passwordReset },
    { value: "ROLE_GRANTED", label: d.audit.actions.roleGranted },
    { value: "ROLE_REVOKED", label: d.audit.actions.roleRevoked },
    { value: "ENROLLMENT_CREATED", label: d.audit.actions.studentEnrolled },
    { value: "MARK_CHANGED", label: d.audit.actions.markChanged },
    { value: "MARKS_PUBLISHED", label: d.audit.actions.marksPublished },
    { value: "PAYMENT_CREATED", label: d.audit.actions.paymentRecorded },
    { value: "PAYMENT_APPROVED", label: d.payments.approved },
    { value: "PAYMENT_REJECTED", label: d.payments.rejected },
    { value: "PROOF_DOWNLOADED", label: d.audit.actions.proofDownloaded },
    { value: "REVIEW_MODERATED", label: d.audit.actions.reviewModerated },
    { value: "REPORT_EXPORTED", label: d.audit.actions.reportExported },
    { value: "EXPORT_DOWNLOADED", label: d.audit.actions.exportDownloaded },
  ];
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const d = await getDict();
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
        title={d.nav.audit}
        lede={d.audit.lede}
      />

      <Toolbar
        filters={[
          { param: "action", label: d.columns.action, options: actionOptions(d) },
          { param: "actor", label: d.filters.who, placeholder: "REC-000001" },
          {
            param: "object_type",
            label: d.columns.onWhat,
            options: [
              { value: "User", label: d.audit.subjects.person },
              { value: "Payment", label: d.audit.subjects.payment },
              { value: "Course", label: d.audit.subjects.course },
              { value: "Enrollment", label: d.audit.subjects.enrollment },
              { value: "Review", label: d.audit.subjects.review },
              { value: "ReportExport", label: d.audit.subjects.reportExport },
            ],
          },
          { param: "from", label: d.filters.from },
          { param: "to", label: d.filters.to },
        ]}
      />

      {!page ? (
        <ErrorState title={d.audit.errorTitle} />
      ) : (
        <AuditFeed initial={page.results} initialNext={page.next} />
      )}
    </div>
  );
}
