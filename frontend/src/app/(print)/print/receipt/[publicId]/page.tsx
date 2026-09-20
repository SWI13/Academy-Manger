import { notFound } from "next/navigation";

import { getJson } from "@/lib/django";
import { formatDate, formatMoney } from "@/lib/format";
import { getDict } from "@/lib/i18n.server";
import { label } from "@/lib/print";
import { cookieHeader } from "@/lib/session";
import type { Payment } from "@/types";

import { PrintDocument } from "../../../PrintDocument";
import { printGuard } from "../../../guard";

import type { Balance } from "../../../../(dash)/enrollments/[id]/BalanceCard";

type Props = { params: Promise<{ publicId: string }> };

export async function generateMetadata({ params }: Props) {
  const d = await getDict();
  return { title: `${d.print.receiptTitle} ${(await params).publicId}` };
}

/**
 * A payment receipt - the one printed document that is handed to somebody
 * outside the institute.
 *
 * Not a table, so it passes no columns: `PrintDocument` renders the masthead,
 * the page furniture and the footer, and the body is the receipt itself.
 * That is the shape the universal component was built for - a document is a
 * header plus content plus totals, and a table is only the most common kind
 * of content.
 *
 * The remaining balance comes from the balance endpoint rather than being
 * worked out here. The receipt a parent takes away has to agree with the
 * ledger, and a figure this page subtracted itself would eventually not.
 *
 * A pending payment still prints - somebody has handed money over and wants
 * paper for it - but the sheet says on its face that it is awaiting approval,
 * so it cannot be mistaken for a confirmed receipt.
 */
export default async function PrintReceiptPage({ params }: Props) {
  const d = await getDict();
  const { publicId } = await params;
  const { organisation, session } = await printGuard("payment.view");

  const cookie = await cookieHeader();
  const payment = await getJson<Payment>(`/api/v1/payments/${publicId}/`, cookie);
  if (!payment) notFound();

  const balance = await getJson<Balance>(
    `/api/v1/enrollments/${payment.enrollment}/balance/`,
    cookie,
  );

  const currency = payment.currency ?? "DZD";

  return (
    <PrintDocument
      organisation={organisation}
      title={d.print.receiptTitle}
      subtitle={payment.public_id}
      columns={[]}
      rows={[]}
      totals={[{ label: d.print.amountPaid, value: formatMoney(payment.amount_minor, currency) }]}
    >
      <section className="sheet-section keep-together">
        <dl className="sheet-facts">
          <div>
            <dt>{d.print.receiptNumber}</dt>
            <dd>{payment.public_id}</dd>
          </div>
          <div>
            <dt>{d.print.date}</dt>
            <dd>{formatDate(payment.paid_on)}</dd>
          </div>
          <div>
            <dt>{d.print.payer}</dt>
            <dd>
              {payment.student_name} ({payment.student_public_id})
            </dd>
          </div>
          <div>
            <dt>{d.print.forCourse}</dt>
            <dd>
              {payment.course_title} ({payment.course_public_id})
            </dd>
          </div>
          <div>
            <dt>{d.payments.method}</dt>
            <dd>{label(d.payments, payment.method, payment.method ?? "—")}</dd>
          </div>
          <div>
            <dt>{d.print.status}</dt>
            <dd>{label(d.status, payment.status)}</dd>
          </div>
          {balance ? (
            <>
              <div>
                <dt>{d.payments.agreed}</dt>
                <dd>{formatMoney(balance.total_minor, balance.currency)}</dd>
              </div>
              <div>
                <dt>{d.payments.paid}</dt>
                <dd>{formatMoney(balance.paid_minor, balance.currency)}</dd>
              </div>
              <div>
                <dt>{d.print.remainingBalance}</dt>
                <dd>{formatMoney(balance.remaining_minor, balance.currency)}</dd>
              </div>
            </>
          ) : null}
        </dl>

        {payment.notes ? (
          <p className="sheet-note">{payment.notes}</p>
        ) : null}

        {payment.status !== "APPROVED" ? (
          <p className="sheet-note">{d.print.pendingNotice}</p>
        ) : null}
      </section>

      {/*
        Two signature lines, because a receipt is a thing two people agree
        about. The left is the member of staff who issued it - named, because
        "who took my money" is the first question anybody asks about a receipt.
      */}
      <div className="sheet-signature keep-together">
        <div>
          <div className="sheet-signature-line" />
          {d.print.preparedBy}: {session.full_name}
        </div>
        <div>
          <div className="sheet-signature-line" />
          {d.print.receivedBy}
        </div>
      </div>
    </PrintDocument>
  );
}
