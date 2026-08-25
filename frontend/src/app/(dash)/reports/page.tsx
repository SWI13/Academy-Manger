import Link from "next/link";

import { Toolbar } from "@/components/ui/Toolbar";
import { getJson } from "@/lib/django";
import { formatMoney, formatNumber } from "@/lib/format";
import type { SearchParams } from "@/lib/list";
import { can, cookieHeader, getSession } from "@/lib/session";

import { ExportPanel } from "./ExportPanel";
import { ReportTable } from "./ReportTable";

export const metadata = { title: "Reports · SM Academy" };

type ReportResult = {
  report: string;
  filters: Record<string, string>;
  rows: Record<string, unknown>[];
  totals: Record<string, number>;
};

/**
 * Which reports this caller may run.
 *
 * Operational and financial are separate grants, and that split is the whole
 * reason reception and professors can reach a report at all: the enrolment
 * report carries no money, not even a course price.
 */
const REPORTS = [
  {
    name: "enrollments",
    label: "Enrolments",
    needs: "report.view_operational" as const,
    blurb: "Head-count per course, by status. No money in it at all.",
  },
  {
    name: "revenue",
    label: "Revenue",
    needs: "report.view_financial" as const,
    blurb: "Money actually collected, by course. Approved payments only.",
  },
  {
    name: "outstanding",
    label: "Outstanding",
    needs: "report.view_financial" as const,
    blurb: "What each live enrolment still owes.",
  },
];

const MONEY_TOTALS = new Set([
  "collected_minor",
  "total_minor",
  "paid_minor",
  "remaining_minor",
]);

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const session = await getSession();
  const cookie = await cookieHeader();

  const available = REPORTS.filter((report) => can(session, report.needs));
  if (!available.length) {
    return (
      <p className="text-sm text-ink-soft">
        Your role does not include any reports.
      </p>
    );
  }

  const requested = Array.isArray(params.report) ? params.report[0] : params.report;
  const chosen =
    available.find((report) => report.name === requested) ?? available[0];

  const filters: Record<string, string> = {};
  for (const key of ["from", "to", "course", "unpaid_only"]) {
    const value = Array.isArray(params[key]) ? params[key][0] : params[key];
    if (value) filters[key] = value;
  }

  const query = new URLSearchParams(filters).toString();
  const result = await getJson<ReportResult>(
    `/api/v1/reports/${chosen.name}/${query ? `?${query}` : ""}`,
    cookie,
  );

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Reports</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Every figure is read from the rows on each request — nothing is
          cached and nothing is stored, so the totals reconcile against the
          ledger by construction.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Reports">
        {available.map((report) => {
          const active = report.name === chosen.name;
          return (
            <Link
              key={report.name}
              href={`/reports?report=${report.name}`}
              aria-current={active ? "page" : undefined}
              className={`rounded border px-3 py-1.5 text-sm ${
                active
                  ? "border-accent bg-accent-soft font-medium text-accent"
                  : "border-rule-strong bg-surface text-ink hover:bg-sunk"
              }`}
            >
              {report.label}
            </Link>
          );
        })}
      </nav>

      <p className="text-sm text-ink-soft">{chosen.blurb}</p>

      <Toolbar
        filters={[
          { param: "from", label: "From" },
          { param: "to", label: "To" },
          { param: "course", label: "Course", placeholder: "C-2026-001" },
          ...(chosen.name === "outstanding"
            ? [
                {
                  param: "unpaid_only",
                  label: "Show",
                  options: [{ value: "true", label: "Unsettled only" }],
                },
              ]
            : []),
        ]}
      />

      {!result ? (
        <p className="text-sm text-ink-soft">
          That report could not be run. Try refreshing.
        </p>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(result.totals).map(([key, value]) => (
              <div
                key={key}
                className="rounded border border-rule bg-surface p-3"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
                  {key.replace(/_minor$/, "").replace(/_/g, " ")}
                </p>
                <p className="tabular mt-1 text-xl font-semibold text-ink">
                  {MONEY_TOTALS.has(key)
                    ? formatMoney(value)
                    : formatNumber(value)}
                </p>
              </div>
            ))}
          </section>

          <ReportTable rows={result.rows} />

          {can(session, "report.export") ? (
            <ExportPanel report={chosen.name} filters={filters} />
          ) : (
            <p className="text-sm text-ink-faint">
              Reading a report and taking the file away are separate
              permissions. Yours covers the screen, not the spreadsheet.
            </p>
          )}
        </>
      )}
    </div>
  );
}
