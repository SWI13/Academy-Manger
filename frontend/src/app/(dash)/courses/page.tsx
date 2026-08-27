import { ErrorState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Toolbar } from "@/components/ui/Toolbar";
import { PAGE_SIZE, fetchPage, pageFrom, type SearchParams } from "@/lib/list";
import { can, getSession } from "@/lib/session";
import type { Course } from "@/types";

import { CoursesTable } from "./CoursesTable";

export const metadata = { title: "Courses" };

const FILTERS = ["status", "q"];

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [page, session] = await Promise.all([
    fetchPage<Course>("courses", params, FILTERS),
    getSession(),
  ]);

  if (!page) {
    return <ErrorState title="Courses could not be loaded" />;
  }

  // Only someone who can create a course ever sees a draft, so offering the
  // filter to anyone else would be a status that never matches anything.
  const seesDrafts = can(session, "course.create");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Courses"
        lede="The catalogue. A course carries its own price, and each enrolment freezes the price it was made at — so changing one here never rewrites last term’s invoices."
      />

      <Toolbar
        filters={[
          {
            param: "status",
            label: "Status",
            options: [
              ...(seesDrafts ? [{ value: "DRAFT", label: "Draft" }] : []),
              { value: "ACTIVE", label: "Active" },
              { value: "COMPLETED", label: "Completed" },
              { value: "ARCHIVED", label: "Archived" },
            ],
          },
          { param: "q", label: "Search", placeholder: "Title or ID" },
        ]}
      />

      <CoursesTable rows={page.results} />

      <Pagination
        count={page.count}
        page={pageFrom(params)}
        pageSize={PAGE_SIZE}
        unit="course"
      />
    </div>
  );
}
