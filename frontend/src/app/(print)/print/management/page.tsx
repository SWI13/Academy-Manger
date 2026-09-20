import { redirect } from "next/navigation";

import { formatMoney, formatNumber } from "@/lib/format";
import { LOCALE_INFO } from "@/lib/i18n";
import { getDict, getLocale } from "@/lib/i18n.server";
import type { SearchParams } from "@/lib/list";
import { periodFrom, periodLabel } from "@/lib/logistics";
import { getJson } from "@/lib/django";
import { cookieHeader } from "@/lib/session";
import type { ManagementReport } from "@/types";

import { PrintDocument } from "../../PrintDocument";
import { printGuard } from "../../guard";

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.print.managementReport };
}

/**
 * "August 2026 Management Report" - the month on one sheet.
 *
 * Four blocks, in the order the questions get asked at the end of a month:
 * how many people, what was taught, whether they turned up, and what it came
 * to. Every figure is read from rows by `management_reports.management_report`
 * and printed as received.
 *
 * The period comes from the URL and defaults to this month, so the report an
 * owner reaches for on the 1st is last month's by changing one number rather
 * than by finding a date picker.
 */
export default async function PrintManagementPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const d = await getDict();
  const params = await searchParams;
  const { organisation } = await printGuard("report.view_financial");
  const intl = LOCALE_INFO[await getLocale()].intl;

  const period = periodFrom(params);
  const report = await getJson<ManagementReport>(
    `/api/v1/reports/management/?year=${period.year}&month=${period.month}`,
    await cookieHeader(),
  );
  if (!report) redirect("/reports");

  const currency = report.currency ?? "DZD";
  const rate = report.attendance_rate;

  return (
    <PrintDocument
      organisation={organisation}
      title={d.print.managementReport}
      subtitle={periodLabel(period, intl)}
      columns={[]}
      rows={[]}
      totals={[
        { label: d.print.totalIncome, value: formatMoney(report.income_total_minor, currency) },
        {
          label: d.print.totalExpenses,
          value: formatMoney(report.expense_total_minor, currency),
        },
        { label: d.print.netBalance, value: formatMoney(report.net_minor, currency) },
      ]}
    >
      <Block title={d.print.people}>
        <Fact label={d.print.totalStudents} value={formatNumber(report.students_total)} />
        <Fact label={d.print.activeStudents} value={formatNumber(report.students_active)} />
        <Fact label={d.print.newRegistrations} value={formatNumber(report.new_students)} />
        <Fact label={d.print.totalEnrollments} value={formatNumber(report.new_enrolments)} />
      </Block>

      <Block title={d.print.teaching}>
        <Fact label={d.print.activeCourses} value={formatNumber(report.courses_active)} />
        <Fact label={d.print.liveEnrollments} value={formatNumber(report.enrolments_live)} />
        <Fact label={d.print.registersTaken} value={formatNumber(report.registers_taken)} />
        {/*
          Null rather than nought when no register was taken. A month with no
          attendance recorded did not have an attendance rate of zero, and
          printing 0% beside a class that met every day is a figure somebody
          would act on.
        */}
        <Fact
          label={d.print.attendanceRate}
          value={rate === null || rate === undefined ? d.attendance.noRate : `${rate}%`}
        />
        <Fact label={d.attendance.present} value={formatNumber(report.attendance_present)} />
        <Fact label={d.attendance.late} value={formatNumber(report.attendance_late)} />
        <Fact label={d.attendance.absent} value={formatNumber(report.attendance_absent)} />
      </Block>

      <Block title={d.print.money}>
        <Fact
          label={d.print.totalIncome}
          value={formatMoney(report.income_total_minor, currency)}
        />
        <Fact
          label={d.print.pendingPayments}
          value={formatMoney(report.pending_total_minor, currency)}
        />
        <Fact
          label={d.print.totalExpenses}
          value={formatMoney(report.expense_total_minor, currency)}
        />
        <Fact label={d.print.netBalance} value={formatMoney(report.net_minor, currency)} />
        <Fact
          label={d.print.outstanding}
          value={formatMoney(report.outstanding_minor, currency)}
        />
      </Block>

      <Block title={d.print.inventory}>
        <Fact label={d.print.inventoryUnits} value={formatNumber(report.inventory_units)} />
        <Fact label={d.print.inventoryLines} value={formatNumber(report.inventory_lines)} />
        <Fact
          label={d.print.itemsNeedingRepair}
          value={formatNumber(report.inventory_needs_repair)}
        />
        <Fact label={d.print.itemsDamaged} value={formatNumber(report.inventory_damaged)} />
        <Fact label={d.print.itemsMissing} value={formatNumber(report.inventory_missing)} />
      </Block>

      {report.income_by_category.length ? (
        <section className="sheet-section">
          <h2>{d.print.incomeByCourse}</h2>
          <table>
            <thead>
              <tr>
                <th>{d.filters.course}</th>
                <th className="num" style={{ width: "18%" }}>
                  {d.print.entries}
                </th>
                <th className="num" style={{ width: "24%" }}>
                  {d.payments.amount}
                </th>
              </tr>
            </thead>
            <tbody>
              {report.income_by_category.map((row) => (
                <tr key={row.key || row.label}>
                  <td>{row.label || "—"}</td>
                  <td className="num">{formatNumber(row.count)}</td>
                  <td className="num sheet-strong">
                    {formatMoney(row.total_minor, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {report.expenses_by_category.length ? (
        <section className="sheet-section">
          <h2>{d.print.expensesByCategory}</h2>
          <table>
            <thead>
              <tr>
                <th>{d.filters.category}</th>
                <th className="num" style={{ width: "18%" }}>
                  {d.print.entries}
                </th>
                <th className="num" style={{ width: "24%" }}>
                  {d.payments.amount}
                </th>
              </tr>
            </thead>
            <tbody>
              {report.expenses_by_category.map((row) => (
                <tr key={row.key || row.label}>
                  <td>{row.label || "—"}</td>
                  <td className="num">{formatNumber(row.count)}</td>
                  <td className="num sheet-strong">
                    {formatMoney(row.total_minor, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <div className="sheet-signature keep-together">
        <div>
          <div className="sheet-signature-line" />
          {d.print.preparedBy}
        </div>
        <div>
          <div className="sheet-signature-line" />
          {d.print.signature}
        </div>
      </div>
    </PrintDocument>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="sheet-section keep-together">
      <h2>{title}</h2>
      <dl className="sheet-facts">{children}</dl>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
