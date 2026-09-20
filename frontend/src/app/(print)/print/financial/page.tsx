import { redirect } from "next/navigation";

import { getJson } from "@/lib/django";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { LOCALE_INFO } from "@/lib/i18n";
import { getDict, getLocale } from "@/lib/i18n.server";
import type { SearchParams } from "@/lib/list";
import { monthName } from "@/lib/logistics";
import { cookieHeader } from "@/lib/session";
import type { FinancialSummary, MoneyTally } from "@/types";

import { PrintDocument } from "../../PrintDocument";
import { printGuard } from "../../guard";

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.print.financialSummary };
}

/**
 * FINANCIAL SUMMARY - what came in, what went out, and the difference.
 *
 * Every figure here is the backend's. The net line especially: it is income
 * minus expenditure computed in `management_reports.financial_summary`, over
 * the same two tables anybody can go and check, rather than two numbers this
 * page subtracted after rendering them.
 *
 * Behind `report.view_financial`, which reception and professors do not hold.
 * Printing is never a way around a permission, and this is the document that
 * would be worth going around one for.
 */
export default async function PrintFinancialPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const d = await getDict();
  const params = await searchParams;
  const { organisation } = await printGuard("report.view_financial");
  const intl = LOCALE_INFO[await getLocale()].intl;

  const from = read(params, "from");
  const to = read(params, "to");
  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (to) query.set("to", to);

  const summary = await getJson<FinancialSummary>(
    `/api/v1/reports/financial-summary/?${query.toString()}`,
    await cookieHeader(),
  );
  if (!summary) redirect("/reports");

  const currency = summary.currency ?? "DZD";

  return (
    <PrintDocument
      organisation={organisation}
      title={d.print.financialSummary}
      subtitle={
        from || to
          ? `${from ? formatDate(from) : "…"} — ${to ? formatDate(to) : "…"}`
          : d.print.allTime
      }
      columns={[]}
      rows={[]}
      totals={[
        { label: d.print.totalIncome, value: formatMoney(summary.income_total_minor, currency) },
        {
          label: d.print.totalExpenses,
          value: formatMoney(summary.expense_total_minor, currency),
        },
        // Signed, and never rounded away. A period that cost more than it took
        // is a negative number, and that is the one thing a summary must say.
        { label: d.print.netBalance, value: formatMoney(summary.net_minor, currency) },
      ]}
    >
      <section className="sheet-section keep-together">
        <h2>{d.print.summary}</h2>
        <dl className="sheet-facts">
          <div>
            <dt>{d.print.totalIncome}</dt>
            <dd>{formatMoney(summary.income_total_minor, currency)}</dd>
          </div>
          <div>
            <dt>{d.print.entries}</dt>
            <dd>{formatNumber(summary.income_count)}</dd>
          </div>
          <div>
            <dt>{d.print.pendingPayments}</dt>
            <dd>{formatMoney(summary.pending_total_minor, currency)}</dd>
          </div>
          <div>
            <dt>{d.print.totalExpenses}</dt>
            <dd>{formatMoney(summary.expense_total_minor, currency)}</dd>
          </div>
        </dl>
        <p className="sheet-note">{d.print.pendingNotice}</p>
      </section>

      <Breakdown
        title={d.print.incomeByCourse}
        rows={summary.income_by_category}
        currency={currency}
        entriesLabel={d.print.entries}
        amountLabel={d.payments.amount}
        nameLabel={d.filters.course}
      />

      <Breakdown
        title={d.print.expensesByCategory}
        rows={summary.expenses_by_category}
        currency={currency}
        entriesLabel={d.print.entries}
        amountLabel={d.payments.amount}
        nameLabel={d.filters.category}
      />

      {summary.monthly.length ? (
        <section className="sheet-section">
          <h2>{d.print.monthByMonth}</h2>
          <table>
            <thead>
              <tr>
                <th>{d.logistics.monthColumn}</th>
                <th className="num">{d.print.income}</th>
                <th className="num">{d.print.expenditure}</th>
                <th className="num">{d.print.net}</th>
              </tr>
            </thead>
            <tbody>
              {summary.monthly.map((row) => (
                <tr key={`${row.year}-${row.month}`}>
                  <td>
                    {monthName(row.month, intl)} {row.year}
                  </td>
                  <td className="num">{formatMoney(row.income_minor, currency)}</td>
                  <td className="num">{formatMoney(row.expense_minor, currency)}</td>
                  <td className="num sheet-strong">
                    {formatMoney(row.net_minor, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </PrintDocument>
  );
}

function Breakdown({
  title,
  rows,
  currency,
  nameLabel,
  entriesLabel,
  amountLabel,
}: {
  title: string;
  rows: MoneyTally[];
  currency: string;
  nameLabel: string;
  entriesLabel: string;
  amountLabel: string;
}) {
  if (!rows.length) return null;
  return (
    <section className="sheet-section">
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th>{nameLabel}</th>
            <th className="num" style={{ width: "18%" }}>
              {entriesLabel}
            </th>
            <th className="num" style={{ width: "24%" }}>
              {amountLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key || row.label}>
              <td>{row.label || "—"}</td>
              <td className="num">{formatNumber(row.count)}</td>
              <td className="num sheet-strong">{formatMoney(row.total_minor, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function read(params: SearchParams, key: string): string | null {
  const raw = params[key];
  return (Array.isArray(raw) ? raw[0] : raw)?.trim() || null;
}
