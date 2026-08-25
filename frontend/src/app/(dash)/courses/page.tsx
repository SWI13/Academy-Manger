import { Pagination } from "@/components/ui/Pagination";
import { Toolbar } from "@/components/ui/Toolbar";
import { PAGE_SIZE, fetchPage, pageFrom, type SearchParams } from "@/lib/list";
import { can, getSession } from "@/lib/session";
import type { Course } from "@/types";

import { CoursesTable } from "./CoursesTable";

export const metadata = { title: "Courses · SM Academy" };

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
    return (
      <p className="text-sm text-ink-soft">
        Courses could not be loaded. Try refreshing.
      </p>
    );
  }

  // Only someone who can create a course ever sees a draft, so offering the
  // filter to anyone else would be a status that never matches anything.
  const seesDrafts = can(session, "course.create");

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Courses</h1>
        <p className="mt-1 text-sm text-ink-soft">
          The catalogue. A course carries its own price, and each enrolment
          freezes the price it was made at — so changing one here never rewrites
          last term&rsquo;s invoices.
        </p>
      </header>

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
      />
    </div>
  );
}
