import { LinkButton } from "@/components/ui/Button";
import { ErrorState, NoAccess } from "@/components/ui/EmptyState";
import { Note } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { PrintButton } from "@/components/ui/PrintButton";
import { Pagination } from "@/components/ui/Pagination";
import { Toolbar } from "@/components/ui/Toolbar";
import { PAGE_SIZE, fetchPage, pageFrom, type SearchParams } from "@/lib/list";
import { can, getSession } from "@/lib/session";
import type { Payment } from "@/types";
import { getDict } from "@/lib/i18n.server";

import { PaymentsTable } from "./PaymentsTable";

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.nav.payments };
}

const FILTERS = ["status", "student", "course", "from", "to"];

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const d = await getDict();
  const params = await searchParams;
  const [page, session] = await Promise.all([
    fetchPage<Payment>("payments", params, FILTERS),
    getSession(),
  ]);

  // A professor holds no payment permission at all, so the list would come
  // back 403 and read as a broken page. Said plainly instead.
  if (!can(session, "payment.view")) return <NoAccess what={d.nav.payments} />;

  if (!page) {
    return <ErrorState title={d.payments.errorTitle} />;
  }

  // A student's ledger is already only their own, so a "Student" box that
  // can match nobody else is a control that only ever disappoints.
  const seesEveryone = can(session, "payment.create");
  const mayApprove = can(session, "payment.approve");

  // Counted from this page's rows, and labelled as such. The total across
  // every page is a figure the API would have to send; inventing it here from
  // 25 rows would be a number that disagrees with the ledger.
  const pendingHere = page.results.filter(
    (payment) => payment.status === "PENDING",
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={seesEveryone ? d.nav.payments : d.payments.title}
        lede={d.payments.lede}
        actions={
          <>
            <PrintButton
              href="/print/payments"
              params={params}
              filters={["status", "student", "course", "from", "to"]}
            />
            {can(session, "payment.create") ? (
              <LinkButton href="/payments/new" variant="primary" icon="plus">
                {d.payments.recordTitle}
              </LinkButton>
            ) : null}
          </>
        }
      />

      <Toolbar
        filters={[
          {
            param: "status",
            label: d.filters.status,
            options: [
              { value: "PENDING", label: d.status.PENDING },
              { value: "APPROVED", label: d.status.APPROVED },
              { value: "REJECTED", label: d.status.REJECTED },
              { value: "CANCELLED", label: d.status.CANCELLED },
            ],
          },
          ...(seesEveryone
            ? [{ param: "student", label: d.filters.student, placeholder: "STU-000042" }]
            : []),
          { param: "course", label: d.filters.course, placeholder: "C-2026-001" },
          { param: "from", label: "Paid from" },
          { param: "to", label: "Paid to" },
        ]}
      />

      {mayApprove && pendingHere ? (
        <Note tone="warn">
          {pendingHere} {pendingHere === 1 ? "payment" : "payments"} on this page{" "}
          {pendingHere === 1 ? "is" : "are"} waiting for a decision. You cannot
          approve one you recorded yourself.
        </Note>
      ) : null}

      <PaymentsTable rows={page.results} />

      <Pagination
        count={page.count}
        page={pageFrom(params)}
        pageSize={PAGE_SIZE}
        unit={d.units.payments}
      />
    </div>
  );
}
