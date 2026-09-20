import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { getJson } from "@/lib/django";
import type { SearchParams } from "@/lib/list";
import { can, cookieHeader, getSession } from "@/lib/session";
import type { Enrollment } from "@/types";
import { getDict } from "@/lib/i18n.server";

import { PaymentForm } from "./PaymentForm";

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.payments.recordTitle };
}

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const d = await getDict();
  const session = await getSession();
  // Checked here as well as hidden from the list page. The API refuses
  // regardless, but rendering a form nobody can submit is its own kind of
  // rude.
  if (!can(session, "payment.create")) redirect("/payments");

  const params = await searchParams;
  const preset = Array.isArray(params.enrollment)
    ? params.enrollment[0]
    : params.enrollment;

  // Money can only be recorded against an enrolment that is still live - the
  // serializer refuses a cancelled or dropped one - so the picker is built
  // from those and cannot offer a row that comes back as a validation error.
  const enrolments = await getJson<{ results: Enrollment[] }>(
    "/api/v1/enrollments/?status=ACTIVE&page_size=100",
    await cookieHeader(),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/payments", label: d.nav.payments }}
        title={d.payments.recordTitle}
        lede={d.payments.recordLede}
      />

      <PaymentForm
        enrolments={enrolments?.results ?? []}
        preset={preset ?? null}
        mayApprove={can(session, "payment.approve")}
      />
    </div>
  );
}
