import Link from "next/link";

import { Card, SectionHeader } from "@/components/ui/Card";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { Toolbar } from "@/components/ui/Toolbar";
import { getJson } from "@/lib/django";
import { formatMoney, formatNumber } from "@/lib/format";
import type { SearchParams } from "@/lib/list";
import { can, cookieHeader, getSession } from "@/lib/session";

import { ExportPanel } from "./ExportPanel";
import { ReportTable } from "./ReportTable";

export const metadata = { title: "Reports" };

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
    icon: "graduation" as IconName,
    needs: "report.view_operational" as const,
    blurb: "Head-count per course, by status. No money in it at all.",
  },
  {
    name: "revenue",
    label: "Revenue",
    icon: "trend-up" as IconName,
    needs: "report.view_financial" as const,
    blurb: "Money actually collected, by course. Approved payments only.",
  },
  {
    name: "outstanding",
    label: "Outstanding",
    icon: "receipt" as IconName,
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
      <EmptyState
        icon="activity"
        title="No reports for your role"
        description="Reading a report is its own permission, granted separately from the screens the figures come from."
      />
    );
  }

  const requested = Array.isArray(params.report)
    ? params.report[0]
    : params.report;
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports"
        lede="Every figure is read from the rows on each request — nothing is cached and nothing is stored, so the totals reconcile against the ledger by construction."
      />

      {/* --- which report ------------------------------------------- */}
      <nav
        aria-label="Reports"
        className="scroll-slim -mx-1 flex gap-1 overflow-x-auto border-b border-rule px-1"
      >
        {available.map((report) => {
          const active = report.name === chosen.name;
          return (
            <Link
              key={report.name}
              href={`/reports?report=${report.name}`}
              aria-current={active ? "page" : undefined}
              className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "border-accent text-accent"
                  : "border-transparent text-ink-soft hover:border-rule-strong hover:text-ink"
              }`}
            >
              <Icon name={report.icon} size={15} />
              {report.label}
            </Link>
          );
        })}
      </nav>

      <p className="-mt-2 text-sm text-ink-soft">{chosen.blurb}</p>

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
        <ErrorState
          title="That report could not be run"
          description="The query did not come back. Narrowing the date range and trying again usually settles it."
        />
      ) : (
        <>
          <section aria-label="Totals">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Object.entries(result.totals).map(([key, value]) => (
                <StatTile
                  key={key}
                  label={key.replace(/_minor$/, "").replace(/_/g, " ")}
                  value={
                    MONEY_TOTALS.has(key)
                      ? formatMoney(value)
                      : formatNumber(value)
                  }
                  tone={
                    key.startsWith("remaining") || key.startsWith("outstanding")
                      ? "warn"
                      : key.startsWith("collected") || key.startsWith("paid")
                        ? "ok"
                        : "plain"
                  }
                />
              ))}
            </div>
          </section>

          <section>
            <SectionHeader
              title="Rows"
              description={`${formatNumber(result.rows.length)} ${
                result.rows.length === 1 ? "row" : "rows"
              } for these filters`}
            />
            <ReportTable rows={result.rows} />
          </section>

          {can(session, "report.export") ? (
            <ExportPanel report={chosen.name} filters={filters} />
          ) : (
            <Card as="div">
              <p className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-soft">
                <Icon
                  name="lock"
                  size={16}
                  className="mt-px shrink-0 text-ink-faint"
                />
                Reading a report and taking the file away are separate
                permissions. Yours covers the screen, not the spreadsheet.
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
