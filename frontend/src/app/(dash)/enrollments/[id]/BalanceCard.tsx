import { formatMoney } from "@/lib/format";

export type Balance = {
  currency: string;
  total_minor: number;
  paid_minor: number;
  pending_minor: number;
  remaining_minor: number;
  is_settled: boolean;
};

/**
 * The four figures, exactly as Django sent them.
 *
 * Nothing is added up here. `remaining` is not `total - paid` computed in the
 * browser; it is the number the backend derived from the payment rows. If
 * this page did the arithmetic it would eventually disagree with the ledger -
 * a filtered page, a pending row counted once too often - and the person at
 * the desk would believe the screen.
 *
 * Pending is shown beside the remainder, never subtracted from it. Money
 * claimed but not confirmed is not money received, and a family whose cheque
 * has not cleared still owes it.
 */
export function BalanceCard({ balance }: { balance: Balance }) {
  const figures = [
    { label: "Agreed", value: balance.total_minor, tone: "text-ink" },
    { label: "Paid", value: balance.paid_minor, tone: "text-ok" },
    { label: "Awaiting approval", value: balance.pending_minor, tone: "text-warn" },
    {
      label: "Remaining",
      value: balance.remaining_minor,
      tone: balance.remaining_minor > 0 ? "text-bad" : "text-ok",
    },
  ];

  return (
    <section className="rounded border border-rule bg-surface p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Balance
        </h2>
        <p className="text-xs text-ink-faint">
          Computed from the payment rows on every read, never stored.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {figures.map((figure) => (
          <div key={figure.label}>
            <dt className="text-xs text-ink-faint">{figure.label}</dt>
            <dd className={`tabular mt-0.5 text-lg font-semibold ${figure.tone}`}>
              {formatMoney(figure.value, balance.currency)}
            </dd>
          </div>
        ))}
      </dl>

      {balance.pending_minor > 0 ? (
        <p className="mt-3 text-xs text-ink-faint">
          The pending figure is not deducted from the remainder. It becomes
          paid when someone approves it.
        </p>
      ) : null}
    </section>
  );
}
