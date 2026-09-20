import { LinkButton } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PrintButton } from "@/components/ui/PrintButton";
import { Pagination } from "@/components/ui/Pagination";
import { Toolbar } from "@/components/ui/Toolbar";
import { PAGE_SIZE, fetchPage, pageFrom, type SearchParams } from "@/lib/list";
import { can, getSession } from "@/lib/session";
import type { Enrollment } from "@/types";
import { getDict } from "@/lib/i18n.server";

import { EnrollmentsTable } from "./EnrollmentsTable";

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.nav.enrollments };
}

const FILTERS = ["status", "student", "course"];

export default async function EnrollmentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const d = await getDict();
  const params = await searchParams;
  const [page, session] = await Promise.all([
    fetchPage<Enrollment>("enrollments", params, FILTERS),
    getSession(),
  ]);

  if (!page) {
    return <ErrorState title={d.enrollments.errorTitle} />;
  }

  // A student sees only their own enrolments; filtering by student is a
  // control that can only ever match themselves.
  const seesEveryone =
    can(session, "enrollment.create") || can(session, "score.enter");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={seesEveryone ? d.nav.enrollments : d.enrollments.titleSelf}
        lede={d.enrollments.lede}
        actions={
          <>
            <PrintButton
              href="/print/enrollments"
              params={params}
              filters={["course", "student", "status"]}
            />
            {can(session, "enrollment.create") ? (
              <LinkButton href="/enrollments/new" variant="primary" icon="plus">
                Enrol a student
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
              { value: "ACTIVE", label: d.status.ACTIVE },
              { value: "COMPLETED", label: d.status.COMPLETED },
              { value: "SUSPENDED", label: d.status.SUSPENDED },
              { value: "CANCELLED", label: d.status.CANCELLED },
              { value: "DROPPED", label: d.status.DROPPED },
            ],
          },
          ...(seesEveryone
            ? [{ param: "student", label: d.filters.student, placeholder: "STU-000042" }]
            : []),
          { param: "course", label: d.filters.course, placeholder: "C-2026-001" },
        ]}
      />

      <EnrollmentsTable rows={page.results} />

      <Pagination
        count={page.count}
        page={pageFrom(params)}
        pageSize={PAGE_SIZE}
        unit={d.units.enrollments}
      />
    </div>
  );
}
