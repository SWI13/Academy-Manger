import { redirect } from "next/navigation";

import { getJson } from "@/lib/django";
import { getDict } from "@/lib/i18n.server";
import type { SearchParams } from "@/lib/list";
import { describeFilters, label, printQuery } from "@/lib/print";
import { can, cookieHeader, getSession } from "@/lib/session";
import type { EnrollmentPrint } from "@/types";

import { printGuard } from "../../guard";
import { ClassListSheet } from "./ClassListSheet";

export const ENROLLMENT_FILTERS = ["course", "student", "status"] as const;

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.print.classList };
}

/**
 * CLASS LIST - who is on a course.
 *
 * `?course=C-2026-001` is the document section 4 asks for: open a class, print
 * its students. Without the filter it is every enrolment the caller can reach,
 * which for a professor is their own classes and for reception is all of them.
 */
export default async function PrintEnrollmentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const d = await getDict();
  const params = await searchParams;
  const { organisation } = await printGuard("enrollment.view");

  const sheet = await getJson<EnrollmentPrint>(
    `/api/v1/enrollments/print/?${printQuery(params, ENROLLMENT_FILTERS)}`,
    await cookieHeader(),
  );
  if (!sheet) redirect("/enrollments");

  const rows = sheet.results;

  return (
    <ClassListSheet
      organisation={organisation}
      rows={rows}
      count={sheet.count}
      printedAt={sheet.printed_at}
      truncated={sheet.truncated}
      showsPrice={can(await getSession(), "payment.view")}
      oneClass={read(params, "course") !== null}
      filters={describeFilters(params, [
        {
          param: "course",
          label: d.attendance.classLabel,
          resolve: (value) =>
            rows.find((row) => row.course_public_id === value)?.course_title ?? value,
        },
        { param: "student", label: d.filters.student },
        { param: "status", label: d.print.status, resolve: (value) => label(d.status, value) },
      ])}
    />
  );
}

function read(params: SearchParams, key: string): string | null {
  const raw = params[key];
  return (Array.isArray(raw) ? raw[0] : raw)?.trim() || null;
}
