import { ErrorState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PrintButton } from "@/components/ui/PrintButton";
import { Pagination } from "@/components/ui/Pagination";
import { Toolbar } from "@/components/ui/Toolbar";
import { PAGE_SIZE, fetchPage, pageFrom, type SearchParams } from "@/lib/list";
import { can, getSession } from "@/lib/session";
import type { Course } from "@/types";
import { getDict } from "@/lib/i18n.server";

import { CoursesTable } from "./CoursesTable";

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.nav.courses };
}

const FILTERS = ["status", "q"];

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const d = await getDict();
  const params = await searchParams;
  const [page, session] = await Promise.all([
    fetchPage<Course>("courses", params, FILTERS),
    getSession(),
  ]);

  if (!page) {
    return <ErrorState title={d.courses.errorTitle} />;
  }

  // Only someone who can create a course ever sees a draft, so offering the
  // filter to anyone else would be a status that never matches anything.
  const seesDrafts = can(session, "course.create");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={d.nav.courses}
        lede={d.courses.lede}
        actions={
          <PrintButton href="/print/courses" params={params} filters={["q", "status", "professor"]} />
        }
      />

      <Toolbar
        filters={[
          {
            param: "status",
            label: d.filters.status,
            options: [
              ...(seesDrafts ? [{ value: "DRAFT", label: d.status.DRAFT }] : []),
              { value: "ACTIVE", label: d.status.ACTIVE },
              { value: "COMPLETED", label: d.status.COMPLETED },
              { value: "ARCHIVED", label: d.status.ARCHIVED },
            ],
          },
          { param: "q", label: d.filters.search, placeholder: d.courses.searchPlaceholder },
        ]}
      />

      <CoursesTable rows={page.results} />

      <Pagination
        count={page.count}
        page={pageFrom(params)}
        pageSize={PAGE_SIZE}
        unit={d.units.courses}
      />
    </div>
  );
}
