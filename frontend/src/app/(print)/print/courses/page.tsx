import { redirect } from "next/navigation";

import { getJson } from "@/lib/django";
import { getDict } from "@/lib/i18n.server";
import type { SearchParams } from "@/lib/list";
import { describeFilters, label, printQuery } from "@/lib/print";
import { can, cookieHeader, getSession } from "@/lib/session";
import type { CoursePrint } from "@/types";

import { printGuard } from "../../guard";
import { CoursesSheet } from "./CoursesSheet";

export const COURSE_FILTERS = ["q", "status", "professor"] as const;

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.print.courseList };
}

export default async function PrintCoursesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const d = await getDict();
  const params = await searchParams;
  const { organisation } = await printGuard("course.view");

  const sheet = await getJson<CoursePrint>(
    `/api/v1/courses/print/?${printQuery(params, COURSE_FILTERS)}`,
    await cookieHeader(),
  );
  if (!sheet) redirect("/courses");

  return (
    <CoursesSheet
      organisation={organisation}
      rows={sheet.results}
      count={sheet.count}
      printedAt={sheet.printed_at}
      truncated={sheet.truncated}
      showsPrice={can(await getSession(), "payment.view")}
      filters={describeFilters(params, [
        { param: "status", label: d.print.status, resolve: (value) => label(d.status, value) },
        { param: "professor", label: d.roles.PROFESSOR },
        { param: "q", label: d.filters.search },
      ])}
    />
  );
}
