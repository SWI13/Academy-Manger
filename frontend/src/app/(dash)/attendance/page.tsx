import { LinkButton } from "@/components/ui/Button";
import { ErrorState, NoAccess } from "@/components/ui/EmptyState";
import { Note } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { PrintButton } from "@/components/ui/PrintButton";
import { StatTile } from "@/components/ui/StatTile";
import { Toolbar } from "@/components/ui/Toolbar";
import { getJson } from "@/lib/django";
import { formatNumber } from "@/lib/format";
import { getDict } from "@/lib/i18n.server";
import { PAGE_SIZE, fetchPage, pageFrom, type SearchParams } from "@/lib/list";
import { can, cookieHeader, getSession } from "@/lib/session";
import type { AttendanceSession, AttendanceSummary, Course } from "@/types";

import { RegisterTable } from "./RegisterTable";

export const SESSION_FILTERS = ["course", "from", "to", "status"] as const;

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.attendance.title };
}

/**
 * The registers, newest first, with the period's rates above them.
 *
 * The tiles describe the same filtered period the list does, so narrowing to
 * one class narrows the rate beside it. Both figures come from the API - the
 * rate especially, which is `services.attendance_rate` and lives in one place
 * so that "late counts as attended" is decided once.
 */
export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const d = await getDict();
  const params = await searchParams;
  const cookie = await cookieHeader();

  const summaryQuery = new URLSearchParams();
  for (const key of ["course", "from", "to"] as const) {
    const raw = params[key];
    const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (value) summaryQuery.set(key, value);
  }

  const [session, page, summary, courses] = await Promise.all([
    getSession(),
    fetchPage<AttendanceSession>("attendance/sessions", params, [...SESSION_FILTERS]),
    getJson<AttendanceSummary>(
      `/api/v1/attendance/summary/?${summaryQuery.toString()}`,
      cookie,
    ),
    getJson<{ results: Course[] }>("/api/v1/courses/?page_size=100", cookie),
  ]);

  if (!can(session, "attendance.view")) return <NoAccess what={d.attendance.title} />;
  if (!page) return <ErrorState title={d.attendance.errorTitle} />;

  const mayRecord = can(session, "attendance.record");
  const rate = summary?.totals.rate;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={d.attendance.title}
        lede={d.attendance.lede}
        actions={
          <>
            <PrintButton
              href="/print/attendance"
              params={params}
              filters={["course", "student", "from", "to"]}
              label={d.attendance.printSummary}
            />
            {mayRecord ? (
              <LinkButton href="/attendance/new" variant="primary" icon="plus">
                {d.attendance.openRegister}
              </LinkButton>
            ) : null}
          </>
        }
      />

      {!mayRecord ? <Note tone="neutral" icon="lock">{d.attendance.readOnly}</Note> : null}

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label={d.print.attendanceRate}
            value={rate === null || rate === undefined ? "—" : `${rate}%`}
            note={rate === null || rate === undefined ? d.attendance.noRate : undefined}
            tone={rate !== null && rate !== undefined && rate < 75 ? "warn" : "accent"}
            icon="check-circle"
          />
          <StatTile
            label={d.attendance.present}
            value={formatNumber(summary.totals.present)}
            icon="user"
          />
          <StatTile
            label={d.attendance.late}
            value={formatNumber(summary.totals.late)}
            tone={summary.totals.late ? "warn" : "plain"}
            icon="clock"
          />
          <StatTile
            label={d.attendance.absent}
            value={formatNumber(summary.totals.absent)}
            tone={summary.totals.absent ? "bad" : "plain"}
            icon="close"
          />
        </div>
      ) : null}

      <Toolbar
        filters={[
          {
            param: "course",
            label: d.attendance.classLabel,
            options: (courses?.results ?? []).map((course) => ({
              value: course.public_id,
              label: course.title,
            })),
          },
          { param: "from", label: d.filters.from },
          { param: "to", label: d.filters.to },
          {
            param: "status",
            label: d.print.status,
            options: [
              { value: "OPEN", label: d.status.OPEN },
              { value: "SUBMITTED", label: d.status.SUBMITTED },
            ],
          },
        ]}
      />

      <RegisterTable rows={page.results} />

      <Pagination
        count={page.count}
        page={pageFrom(params)}
        pageSize={PAGE_SIZE}
        unit={d.units.registers}
      />
    </div>
  );
}
