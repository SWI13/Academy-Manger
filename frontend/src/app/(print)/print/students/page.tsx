import { redirect } from "next/navigation";

import { getJson } from "@/lib/django";
import { getDict } from "@/lib/i18n.server";
import type { SearchParams } from "@/lib/list";
import { describeFilters, label, printQuery } from "@/lib/print";
import { cookieHeader } from "@/lib/session";
import type { Course, UserPrint } from "@/types";

import { printGuard } from "../../guard";
import { StudentsSheet } from "./StudentsSheet";

/** The same filters the people screen puts in the URL. */
export const USER_FILTERS = ["q", "role", "status", "course"] as const;

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.print.studentList };
}

/**
 * STUDENT LIST, and STAFF LIST, from one route.
 *
 * The `role` filter is what separates them, so `?role=STUDENT` and
 * `?role=PROFESSOR` are the same document about different people rather than
 * two routes that would drift apart. The title follows the filter.
 *
 * Scope is Django's: reception and above see everybody, a professor sees the
 * students they teach, and a student sees themselves. This page renders
 * whatever the API sent and never asks for more.
 */
export default async function PrintStudentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const d = await getDict();
  const params = await searchParams;
  const { organisation } = await printGuard("user.view");

  const cookie = await cookieHeader();
  const [sheet, courses] = await Promise.all([
    getJson<UserPrint>(`/api/v1/users/print/?${printQuery(params, USER_FILTERS)}`, cookie),
    getJson<{ results: Course[] }>("/api/v1/courses/?page_size=100", cookie),
  ]);
  if (!sheet) redirect("/users");

  const role = read(params, "role");

  return (
    <StudentsSheet
      organisation={organisation}
      rows={sheet.results}
      count={sheet.count}
      printedAt={sheet.printed_at}
      truncated={sheet.truncated}
      staffSheet={role !== null && role !== "STUDENT"}
      filters={describeFilters(params, [
        { param: "role", label: d.filters.role, resolve: (value) => label(d.roles, value) },
        { param: "status", label: d.print.status, resolve: (value) => label(d.status, value) },
        {
          param: "course",
          label: d.filters.course,
          resolve: (value) =>
            courses?.results.find((course) => course.public_id === value)?.title ?? value,
        },
        { param: "q", label: d.filters.search },
      ])}
    />
  );
}

function read(params: SearchParams, key: string): string | null {
  const raw = params[key];
  return (Array.isArray(raw) ? raw[0] : raw)?.trim() || null;
}
