import { LinkButton } from "@/components/ui/Button";
import { ErrorState, NoAccess } from "@/components/ui/EmptyState";
import { Note } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Toolbar } from "@/components/ui/Toolbar";
import { PAGE_SIZE, fetchPage, pageFrom, type SearchParams } from "@/lib/list";
import { can, getSession } from "@/lib/session";
import type { Payment } from "@/types";

import { PaymentsTable } from "./PaymentsTable";

export const metadata = { title: "Payments" };

const FILTERS = ["status", "student", "course", "from", "to"];

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [page, session] = await Promise.all([
    fetchPage<Payment>("payments", params, FILTERS),
    getSession(),
  ]);

  // A professor holds no payment permission at all, so the list would come
  // back 403 and read as a broken page. Said plainly instead.
  if (!can(session, "payment.view")) return <NoAccess what="Payments" />;

  if (!page) {
    return <ErrorState title="Payments could not be loaded" />;
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
        title={seesEveryone ? "Payments" : "Your payments"}
        lede="Every entry is recorded, then approved by someone else. Nothing here is edited or deleted — a mistake before approval is cancelled, and one after it is corrected with a new record."
        actions={
          can(session, "payment.create") ? (
            <LinkButton href="/payments/new" variant="primary" icon="plus">
              Record a payment
            </LinkButton>
          ) : null
        }
      />

      <Toolbar
        filters={[
          {
            param: "status",
            label: "Status",
            options: [
              { value: "PENDING", label: "Pending" },
              { value: "APPROVED", label: "Approved" },
              { value: "REJECTED", label: "Rejected" },
              { value: "CANCELLED", label: "Cancelled" },
            ],
          },
          ...(seesEveryone
            ? [{ param: "student", label: "Student", placeholder: "STU-000042" }]
            : []),
          { param: "course", label: "Course", placeholder: "C-2026-001" },
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
        unit="payment"
      />
    </div>
  );
}
