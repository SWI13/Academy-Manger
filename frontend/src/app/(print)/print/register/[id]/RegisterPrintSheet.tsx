"use client";

import { useDict } from "@/components/LocaleProvider";
import { formatNumber } from "@/lib/format";
import { label, type PrintColumn, type PrintFilter } from "@/lib/print";
import type { Organisation, RosterRow, SessionSheet } from "@/types";

import { PrintDocument } from "../../../PrintDocument";

/**
 * ATTENDANCE REGISTER - the one printed document meant to be written on.
 *
 * A register nobody has taken prints with the roster down the page and three
 * empty boxes beside each name: the blank sheet a professor carries into the
 * room. A register already taken prints with the marks in it: the record.
 *
 * Same layout for both, because they are the same document at two points in
 * its life - the sheet a class was marked on should look like the sheet it
 * was marked from.
 */
export function RegisterPrintSheet({
  organisation,
  sheet,
  filters,
  preparedBy,
}: {
  organisation: Organisation;
  sheet: SessionSheet;
  filters: PrintFilter[];
  preparedBy: string;
}) {
  const d = useDict();

  const taken = sheet.rows.some((row) => row.status);

  function tick(status: string, header: string): PrintColumn<RosterRow> {
    return {
      key: status,
      header,
      width: "9%",
      numeric: true,
      cell: (row) =>
        row.status === status ? (
          <span className="sheet-strong">✕</span>
        ) : row.status ? (
          <span className="sheet-muted">·</span>
        ) : (
          <span className="sheet-box" />
        ),
    };
  }

  const columns: PrintColumn<RosterRow>[] = [
    {
      key: "index",
      header: "#",
      width: "5%",
      numeric: true,
      cell: (_row, index) => <span className="sheet-muted">{index + 1}</span>,
    },
    {
      key: "student",
      header: d.columns.name,
      width: taken ? "38%" : "45%",
      cell: (row) => (
        <>
          <span className="sheet-strong">{row.student_name}</span>
          <span className="sheet-sub">{row.student_public_id}</span>
        </>
      ),
    },
    tick("PRESENT", d.attendance.present),
    tick("LATE", d.attendance.late),
    tick("ABSENT", d.attendance.absent),
    {
      key: "note",
      header: d.print.notes,
      width: taken ? "20%" : "22%",
      cell: (row) => (
        <span className="sheet-muted">
          {row.note || (row.minutes_late ? `${row.minutes_late} min` : "")}
        </span>
      ),
    },
  ];

  const totals = taken
    ? [
        { label: d.attendance.present, value: formatNumber(sheet.totals.present) },
        { label: d.attendance.late, value: formatNumber(sheet.totals.late) },
        { label: d.attendance.absent, value: formatNumber(sheet.totals.absent) },
        {
          label: d.print.attendanceRate,
          value:
            sheet.totals.rate === null || sheet.totals.rate === undefined
              ? d.attendance.noRate
              : `${sheet.totals.rate}%`,
        },
      ]
    : [{ label: d.print.totalStudents, value: formatNumber(sheet.rows.length) }];

  return (
    <PrintDocument
      organisation={organisation}
      title={d.print.attendanceRegister}
      subtitle={sheet.session.course_title}
      filters={[
        ...filters,
        { label: d.print.status, value: label(d.status, sheet.session.status) },
      ]}
      columns={columns}
      rows={sheet.rows}
      rowKey={(row) => String(row.enrollment)}
      totals={totals}
    >
      {taken ? null : <p className="sheet-note">{d.attendance.blankSheet}</p>}

      <div className="sheet-signature keep-together">
        <div>
          <div className="sheet-signature-line" />
          {d.print.preparedBy}: {preparedBy}
        </div>
        <div>
          <div className="sheet-signature-line" />
          {d.print.signature}
        </div>
      </div>
    </PrintDocument>
  );
}
