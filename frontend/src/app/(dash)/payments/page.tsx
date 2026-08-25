import { Pagination } from "@/components/ui/Pagination";
import { Toolbar } from "@/components/ui/Toolbar";
import { PAGE_SIZE, fetchPage, pageFrom, type SearchParams } from "@/lib/list";
import { can, getSession } from "@/lib/session";
import type { Payment } from "@/types";

import { PaymentsTable } from "./PaymentsTable";

export const metadata = { title: "Payments · SM Academy" };

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

  // A student's ledger is already only their own, so a "Student" box that
  // can match nobody else is a control that only ever disappoints.
  const seesEveryone = can(session, "payment.create");

  if (!page) {
    return (
      <p className="text-sm text-ink-soft">
        Payments could not be loaded. Try refreshing.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Payments</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Every entry is recorded, then approved by someone else. Nothing here
          is edited or deleted — a mistake before approval is cancelled, and one
          after it is corrected with a new record.
        </p>
      </header>

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

      <PaymentsTable rows={page.results} />

      <Pagination
        count={page.count}
        page={pageFrom(params)}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
