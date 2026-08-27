import { LinkButton } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Toolbar } from "@/components/ui/Toolbar";
import { PAGE_SIZE, fetchPage, pageFrom, type SearchParams } from "@/lib/list";
import { can, getSession } from "@/lib/session";
import type { Enrollment } from "@/types";

import { EnrollmentsTable } from "./EnrollmentsTable";

export const metadata = { title: "Enrolments" };

const FILTERS = ["status", "student", "course"];

export default async function EnrollmentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [page, session] = await Promise.all([
    fetchPage<Enrollment>("enrollments", params, FILTERS),
    getSession(),
  ]);

  if (!page) {
    return <ErrorState title="Enrolments could not be loaded" />;
  }

  // A student sees only their own enrolments; filtering by student is a
  // control that can only ever match themselves.
  const seesEveryone =
    can(session, "enrollment.create") || can(session, "score.enter");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={seesEveryone ? "Enrolments" : "Your enrolments"}
        lede="One row per student per course, with the price agreed at the time. Payments and marks hang off these, which is why they are cancelled rather than deleted."
        actions={
          can(session, "enrollment.create") ? (
            <LinkButton href="/enrollments/new" variant="primary" icon="plus">
              Enrol a student
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
              { value: "ACTIVE", label: "Active" },
              { value: "COMPLETED", label: "Completed" },
              { value: "SUSPENDED", label: "Suspended" },
              { value: "CANCELLED", label: "Cancelled" },
              { value: "DROPPED", label: "Dropped" },
            ],
          },
          ...(seesEveryone
            ? [{ param: "student", label: "Student", placeholder: "STU-000042" }]
            : []),
          { param: "course", label: "Course", placeholder: "C-2026-001" },
        ]}
      />

      <EnrollmentsTable rows={page.results} />

      <Pagination
        count={page.count}
        page={pageFrom(params)}
        pageSize={PAGE_SIZE}
        unit="enrolment"
      />
    </div>
  );
}
