"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useDict, useLocale } from "@/components/LocaleProvider";
import { Icon } from "@/components/ui/Icon";
import { fill } from "@/lib/i18n";
import {
  PAGE,
  distribute,
  type Orientation,
  type PrintColumn,
  type PrintFact,
  type PrintFilter,
} from "@/lib/print";
import type { Organisation } from "@/types";

/**
 * Every printed document in the platform.
 *
 * ---------------------------------------------------------------------------
 * Client, and what that means for the routes that use it
 * ---------------------------------------------------------------------------
 * This has to be a client component: it measures rendered rows to work out
 * where the pages break, and it calls `window.print()`. That means a route
 * cannot hand it a `PrintColumn` whose `cell` is a function from a server
 * component - React cannot serialize a function across that boundary, and the
 * request fails with "Functions cannot be passed directly to Client
 * Components".
 *
 * So a route with a table is two files, the same shape the dashboard's tables
 * already use: a server `page.tsx` that guards, fetches and passes plain data,
 * and a colocated client component that declares the columns and renders this.
 * A document with no table - a receipt, a summary - passes no functions at all
 * and stays a single server component.
 *
 * A print route hands over a title, some columns and some rows; everything
 * that makes the result look official happens here - the masthead built from
 * the institute's own profile, the filter line, the page breaks, the column
 * headers repeated on every page, the totals, the footer and the page
 * numbers.
 *
 * ---------------------------------------------------------------------------
 * Why the pages are computed in JavaScript
 * ---------------------------------------------------------------------------
 * "Page 1 of 5" cannot be done in CSS in a browser. `@page { @bottom-right {
 * content: counter(page) " of " counter(pages) } }` is real CSS and no
 * browser engine implements those margin boxes; Chrome's own header and
 * footer are a print-dialog setting that also stamps the URL across the top.
 *
 * So the rows are measured after layout and dealt into fixed-height page
 * boxes here. That buys three of the things section 15 asks for and CSS
 * `break-inside` alone cannot: a true page count, a column header repeated at
 * the top of every page, and totals that land at the foot of the last page
 * rather than wherever the flow happened to stop.
 *
 * Before the measurement has run - during server rendering, and for one
 * frame after hydration - the whole document renders unbroken. That is the
 * correct content, simply not yet split, and printing waits for the split.
 */

const MM_TO_PX = 96 / 25.4;

/** One page, no rows. Shared so it is a stable reference across renders. */
const EMPTY_DOCUMENT: number[][] = [[]];

/** Room the masthead takes on the first page, and the footer on every page. */
const MASTHEAD_MM = 34;
const FOOTER_MM = 12;
const TOTALS_MM = 18;

export type PrintDocumentProps<T> = {
  organisation: Organisation;
  /** The document's own name: STUDENT LIST, INCOME REPORT. */
  title: string;
  /** What it is of - a class, a month, a person. */
  subtitle?: string;
  /** What narrowed it, in words. Printed under the title. */
  filters?: PrintFilter[];
  columns: PrintColumn<T>[];
  rows: T[];
  /**
   * A stable key per row. Optional: a printed document never reorders, so the
   * index is a legitimate key here in a way it would not be on a screen - and
   * leaving it out is what lets a document with no table stay a *server*
   * component, since a function prop cannot cross that boundary.
   */
  rowKey?: (row: T, index: number) => string;
  /** Figures under the last page's table. */
  totals?: PrintFact[];
  /** Anything that is not a table: a summary block, a receipt body. */
  children?: React.ReactNode;
  /** Where wide tables go. Landscape also swaps the `@page` size. */
  orientation?: Orientation;
  /** ISO timestamp from the API, so the sheet says when the data was read. */
  printedAt?: string;
  /** Said on the paper when the selection was capped. */
  truncated?: boolean;
  /** Suppress the automatic print dialog. For a preview somebody is reading. */
  autoPrint?: boolean;
};

export function PrintDocument<T>({
  organisation,
  title,
  subtitle,
  filters = [],
  columns,
  rows,
  rowKey = (_row, index) => String(index),
  totals = [],
  children,
  orientation = "portrait",
  printedAt,
  truncated = false,
  autoPrint = true,
}: PrintDocumentProps<T>) {
  const d = useDict();
  const measureRef = useRef<HTMLTableSectionElement>(null);
  const [measured, setMeasured] = useState<number[][] | null>(null);

  const size = PAGE[orientation];

  // A document with no rows is one empty page, and that is knowable while
  // rendering - so it is derived here rather than set from the effect below.
  const pages = rows.length === 0 ? EMPTY_DOCUMENT : measured;

  useLayoutEffect(() => {
    const body = measureRef.current;
    if (!rows.length || !body) return;

    const heights = Array.from(body.rows).map((row) => row.getBoundingClientRect().height);
    setMeasured(
      distribute(heights, {
        pageHeight: size.height * MM_TO_PX,
        masthead: MASTHEAD_MM * MM_TO_PX,
        footer: FOOTER_MM * MM_TO_PX,
        totals: totals.length ? TOTALS_MM * MM_TO_PX : 0,
        // Measured once, from the real header, so a two-line column heading
        // is accounted for rather than guessed at.
        header: body.parentElement?.querySelector("thead")?.getBoundingClientRect().height ?? 0,
      }),
    );
    // `rows` is the identity that matters; the rest are stable per document.
  }, [rows, size.height, totals.length]);

  // Printed only once the pages exist, so the dialog never opens over a
  // document that is still one long column.
  useEffect(() => {
    if (!autoPrint || pages === null) return;
    const timer = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(timer);
  }, [autoPrint, pages]);

  const total = pages?.length ?? 1;

  return (
    <div className="sheet" data-orientation={orientation}>
      {/*
        The page size is a property of this document, not of the stylesheet -
        a wide register goes landscape and a student list does not, and both
        are the same component.
      */}
      <style>{`@page { size: A4 ${orientation}; margin: 14mm; }`}</style>

      <Controls />

      {/* --- the measuring pass ---------------------------------------- */}
      {pages === null ? (
        <div className="sheet-page" style={{ width: `${size.width}mm` }}>
          <Masthead organisation={organisation} title={title} subtitle={subtitle} filters={filters} printedAt={printedAt} d={d} />
          <table>
            <Head columns={columns} />
            <tbody ref={measureRef}>
              {rows.map((row, index) => (
                <Row key={rowKey(row, index)} columns={columns} row={row} index={index} />
              ))}
            </tbody>
          </table>
          {children}
        </div>
      ) : (
        pages.map((indices, pageIndex) => (
          <div
            key={pageIndex}
            className="sheet-page"
            style={{ width: `${size.width}mm`, minHeight: `${size.height}mm` }}
          >
            {pageIndex === 0 ? (
              <Masthead
                organisation={organisation}
                title={title}
                subtitle={subtitle}
                filters={filters}
                printedAt={printedAt}
                d={d}
              />
            ) : (
              // Continuation pages carry a one-line reminder of what they are
              // part of. A page four found on a desk on its own should still
              // say which report it came from.
              <p className="sheet-continued">
                {organisation.name} · {title}
                {subtitle ? ` · ${subtitle}` : ""}
              </p>
            )}

            <div className="sheet-body">
              {indices.length ? (
                <table>
                  <Head columns={columns} />
                  <tbody>
                    {indices.map((index) => (
                      <Row
                        key={rowKey(rows[index], index)}
                        columns={columns}
                        row={rows[index]}
                        index={index}
                      />
                    ))}
                  </tbody>
                </table>
              ) : columns.length && rows.length === 0 && pageIndex === 0 ? (
                // Only where a table was expected. A receipt has no columns
                // and is not empty; saying "nothing to print" on one would be
                // the document contradicting itself.
                <p className="py-10 text-center text-[color:var(--paper-ink-soft)]">
                  {d.print.nothingToPrint}
                </p>
              ) : null}

              {/* Anything that is not the table, and the totals, belong to
                  the last page - a summary block halfway through a list of
                  students would read as a subtotal. */}
              {pageIndex === total - 1 ? (
                <>
                  {children}
                  {totals.length ? (
                    <div className="sheet-totals keep-together">
                      {totals.map((fact) => (
                        <div key={fact.label}>
                          <span className="sheet-totals-label">{fact.label}</span>
                          <span className="sheet-totals-value">{fact.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {truncated ? (
                    <p className="sheet-note">{d.print.truncated}</p>
                  ) : null}
                </>
              ) : null}
            </div>

            <footer className="sheet-footer">
              <span>{organisation.print_footer || organisation.legal_name || organisation.name}</span>
              <span>{fill(d.print.pageOf, { page: pageIndex + 1, total })}</span>
            </footer>
          </div>
        ))
      )}
    </div>
  );
}

function Head<T>({ columns }: { columns: PrintColumn<T>[] }) {
  return (
    <thead>
      <tr>
        {columns.map((column) => (
          <th
            key={column.key}
            className={column.numeric ? "num" : undefined}
            style={column.width ? { width: column.width } : undefined}
          >
            {column.header}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function Row<T>({
  columns,
  row,
  index,
}: {
  columns: PrintColumn<T>[];
  row: T;
  index: number;
}) {
  return (
    <tr>
      {columns.map((column) => (
        <td key={column.key} className={column.numeric ? "num" : undefined}>
          {column.cell(row, index)}
        </td>
      ))}
    </tr>
  );
}

/**
 * The masthead, from the institute's own profile.
 *
 * Nothing here is hard-coded but the artwork, which is the one thing that
 * genuinely is the platform's: `public/brand/` under the rule that the logo
 * is placed and never redrawn. The name beside it is set in the sheet's own
 * ink and always present, so a printed report says which organisation it
 * belongs to even on a day the image fails to load.
 */
function Masthead({
  organisation,
  title,
  subtitle,
  filters,
  printedAt,
  d,
}: {
  organisation: Organisation;
  title: string;
  subtitle?: string;
  filters: PrintFilter[];
  printedAt?: string;
  d: ReturnType<typeof useDict>;
}) {
  const { intl } = useLocale();
  const [artworkMissing, setArtworkMissing] = useState(false);

  return (
    <header className="sheet-masthead keep-together">
      <div className="sheet-identity">
        {artworkMissing ? null : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={(node) => {
              if (node?.complete && node.naturalWidth === 0) setArtworkMissing(true);
            }}
            src="/brand/sm-academy.png"
            alt=""
            aria-hidden
            style={{ height: 46 }}
            className="w-auto"
            onError={() => setArtworkMissing(true)}
          />
        )}
        <div>
          <p dir="ltr" className="sheet-org-name">
            {organisation.name}
          </p>
          {organisation.address ? (
            <p className="sheet-org-line">{organisation.address}</p>
          ) : null}
          {organisation.contact_line ? (
            <p className="sheet-org-line">{organisation.contact_line}</p>
          ) : null}
          {organisation.registration_number ? (
            <p className="sheet-org-line">{organisation.registration_number}</p>
          ) : null}
        </div>
      </div>

      <div className="sheet-title">
        <h1>{title}</h1>
        {subtitle ? <p className="sheet-subtitle">{subtitle}</p> : null}
        {filters.length ? (
          <p className="sheet-filters">
            {filters.map((filter) => `${filter.label}: ${filter.value}`).join(" · ")}
          </p>
        ) : null}
        <p className="sheet-generated">
          {d.print.generated}{" "}
          {new Intl.DateTimeFormat(intl, {
            day: "2-digit",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            // An office writes 14:30, not 2:30 PM - and `fr-DZ` resolves to a
            // 12-hour clock in some ICU builds, which puts two conventions on
            // one line of a French document.
            hourCycle: "h23",
          }).format(printedAt ? new Date(printedAt) : new Date())}
        </p>
      </div>
    </header>
  );
}

/**
 * The bar above the paper. Screen only.
 *
 * "Save as PDF" is the browser's own print destination on every operating
 * system, and it produces exactly this layout because it *is* this layout.
 * Saying so on the button is the whole of the PDF feature: a second rendering
 * path would be a second thing to keep matching this one.
 */
function Controls() {
  const d = useDict();
  return (
    <div className="no-print sheet-controls">
      <p>{d.print.dialogHint}</p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => window.print()} className="sheet-button">
          <Icon name="printer" size={16} />
          {d.print.print}
        </button>
        <button type="button" onClick={() => window.print()} className="sheet-button">
          <Icon name="download" size={16} />
          {d.print.savePdf}
        </button>
        <button type="button" onClick={() => window.close()} className="sheet-button-quiet">
          {d.common.close}
        </button>
      </div>
    </div>
  );
}
