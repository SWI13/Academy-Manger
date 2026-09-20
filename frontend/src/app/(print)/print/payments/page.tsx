import { redirect } from "next/navigation";

import { getJson } from "@/lib/django";
import { formatDate } from "@/lib/format";
import { getDict } from "@/lib/i18n.server";
import type { SearchParams } from "@/lib/list";
import { describeFilters, label, printQuery } from "@/lib/print";
import { cookieHeader } from "@/lib/session";
import type { PaymentPrint } from "@/types";

import { printGuard } from "../../guard";
import { IncomeSheet } from "./IncomeSheet";

export const PAYMENT_FILTERS = ["status", "student", "course", "from", "to"] as const;

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.print.incomeReport };
}

/**
 * INCOME REPORT - the payments ledger, on paper.
 *
 * The API answers ascending by `paid_on`, because a ledger anybody can follow
 * down the page runs the way the period ran - see `PaymentViewSet`.
 */
export default async function PrintPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const d = await getDict();
  const params = await searchParams;
  const { organisation } = await printGuard("payment.view");

  const sheet = await getJson<PaymentPrint>(
    `/api/v1/payments/print/?${printQuery(params, PAYMENT_FILTERS)}`,
    await cookieHeader(),
  );
  if (!sheet) redirect("/payments");

  return (
    <IncomeSheet
      organisation={organisation}
      rows={sheet.results}
      printedAt={sheet.printed_at}
      truncated={sheet.truncated}
      subtitle={periodLabel(params, d.print.allTime)}
      filters={describeFilters(params, [
        { param: "student", label: d.filters.student },
        { param: "course", label: d.filters.course },
        { param: "status", label: d.print.status, resolve: (value) => label(d.status, value) },
      ])}
    />
  );
}

/** "1 Aug 2026 — 31 Aug 2026", or "All time" when neither end is set. */
function periodLabel(params: SearchParams, allTime: string): string {
  const read = (key: string) => {
    const raw = params[key];
    return (Array.isArray(raw) ? raw[0] : raw)?.trim() || null;
  };
  const from = read("from");
  const to = read("to");
  if (!from && !to) return allTime;
  return `${from ? formatDate(from) : "…"} — ${to ? formatDate(to) : "…"}`;
}
