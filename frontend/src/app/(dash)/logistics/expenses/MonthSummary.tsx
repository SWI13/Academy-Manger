import Link from "next/link";

import { Card, SectionHeader } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { formatMoney, formatNumber } from "@/lib/format";
import { LOCALE_INFO, fill } from "@/lib/i18n";
import { getDict, getLocale } from "@/lib/i18n.server";
import { monthName, periodLabel, type Period } from "@/lib/logistics";
import type { ExpenseSummary } from "@/types";

/**
 * One month's spending, in the context that makes the figure mean something.
 *
 * A bare "110,000 DZD" answers nothing. "110,000, fifteen thousand more than
 * February" is the sentence somebody acts on, which is why the comparison is
 * a note under the tile rather than a separate number to work out.
 *
 * Every figure comes from `/logistics/expenses/summary/` and is rendered as
 * received. The comparison is worked out by the backend too - this page does
 * not subtract one month from another, because a screen that does arithmetic
 * on money is a screen that will eventually disagree with the ledger.
 */
export async function MonthSummary({
  summary,
  period,
}: {
  summary: ExpenseSummary;
  period: Period;
}) {
  const d = await getDict();
  const locale = await getLocale();
  const intl = LOCALE_INFO[locale].intl;

  const currency = summary.currency ?? "DZD";
  const previousName = monthName(summary.previous_month, intl);

  // Signed: negative is a month that cost less. The wording, not the sign, is
  // what the reader sees - "less than February" rather than "-15,000".
  const change = summary.change_minor;
  const comparison =
    summary.previous_total_minor === 0
      ? fill(d.logistics.firstMonth, { month: previousName })
      : change === 0
        ? fill(d.logistics.sameAs, { month: previousName })
        : fill(change > 0 ? d.logistics.upOn : d.logistics.downOn, {
            amount: formatMoney(Math.abs(change), currency),
            month: previousName,
          });

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={d.logistics.monthTotal}
          value={formatMoney(summary.month_total_minor, currency)}
          note={comparison}
          tone="accent"
          icon="receipt"
        />
        <StatTile
          label={d.logistics.previousMonth}
          value={formatMoney(summary.previous_total_minor, currency)}
          note={periodLabel(
            { year: summary.previous_year, month: summary.previous_month },
            intl,
          )}
          icon="clock"
          href={`/logistics/expenses?year=${summary.previous_year}&month=${summary.previous_month}`}
        />
        <StatTile
          label={d.logistics.yearTotal}
          value={formatMoney(summary.year_total_minor, currency)}
          note={String(period.year)}
          icon="activity"
        />
        <StatTile
          label={d.logistics.entriesThisMonth}
          value={formatNumber(summary.month_count)}
          icon="file"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Where the month went. Ordered heaviest first, because the first
            row is the one somebody is looking for. */}
        <Card padded={false} solid className="overflow-hidden">
          <SectionHeader title={d.logistics.breakdown} className="mb-0 px-4 pt-4" />
          {summary.by_category.length ? (
            <table className="mt-3 w-full border-collapse text-sm">
              <tbody>
                {summary.by_category.map((row) => (
                  <tr key={row.key} className="border-t border-rule">
                    <td className="px-4 py-2 text-ink-soft">{row.label}</td>
                    <td className="tabular px-2 py-2 text-end text-xs text-ink-faint">
                      {formatNumber(row.count)}
                    </td>
                    <td className="tabular px-4 py-2 text-end font-semibold text-ink">
                      {formatMoney(row.total_minor, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-4 pb-4 pt-3 text-[13px] text-ink-faint">
              {d.logistics.expensesEmptyTitle}
            </p>
          )}
        </Card>

        {/* The twelve months of the year, including the empty ones - a strip
            with January missing is a strip that reads as if the year started
            in February. */}
        <Card padded={false} solid className="overflow-hidden">
          <SectionHeader
            title={d.logistics.monthlyTotals}
            description={String(period.year)}
            className="mb-0 px-4 pt-4"
          />
          <table className="mt-3 w-full border-collapse text-sm">
            <tbody>
              {summary.monthly.map((row) => {
                const current = row.month === period.month;
                return (
                  <tr
                    key={row.month}
                    className={`border-t border-rule ${current ? "bg-accent-soft" : ""}`}
                  >
                    <td className="px-4 py-1.5">
                      <Link
                        href={`/logistics/expenses?year=${row.year}&month=${row.month}`}
                        className={
                          current
                            ? "font-medium text-accent"
                            : "text-ink-soft transition-colors hover:text-accent"
                        }
                      >
                        {monthName(row.month, intl)}
                      </Link>
                    </td>
                    <td
                      className={`tabular px-4 py-1.5 text-end ${
                        row.total_minor ? "text-ink" : "text-ink-faint"
                      }`}
                    >
                      {formatMoney(row.total_minor, currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
