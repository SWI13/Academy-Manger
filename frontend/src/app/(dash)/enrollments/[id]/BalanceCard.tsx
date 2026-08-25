import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Meter } from "@/components/ui/Stars";
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
 * a filtered page, a rounding difference, a pending row counted once too
 * often - and the person at the desk would believe the screen.
 *
 * Pending is shown beside the remainder, never subtracted from it, and it is
 * the only figure drawn in the warn amber. Money claimed but not confirmed is
 * not money received, and a family whose cheque has not cleared still owes
 * it. Making that visually obvious is the whole job of this card.
 */
export function BalanceCard({ balance }: { balance: Balance }) {
  const figures = [
    {
      key: "agreed",
      label: "Agreed",
      value: balance.total_minor,
      tone: "text-ink",
      note: "Frozen at enrolment",
    },
    {
      key: "paid",
      label: "Paid",
      value: balance.paid_minor,
      tone: "text-ok",
      note: "Approved payments",
    },
    {
      key: "pending",
      label: "Awaiting approval",
      value: balance.pending_minor,
      tone: "text-warn",
      note: "Not counted as paid",
    },
    {
      key: "remaining",
      label: "Remaining",
      value: balance.remaining_minor,
      tone: balance.remaining_minor > 0 ? "text-bad" : "text-ok",
      note: balance.remaining_minor > 0 ? "Still owed" : "Settled",
    },
  ];

  return (
    <Card aria-label="Balance">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Balance</p>
          <p className="mt-1 text-[13px] text-ink-faint">
            Computed from the payment rows on every read, never stored.
          </p>
        </div>
        <Badge tone={balance.is_settled ? "ok" : "warn"} dot>
          {balance.is_settled ? "Settled" : "Outstanding"}
        </Badge>
      </div>

      {/*
        The bar is paid against agreed - a proportion of two figures the API
        sent, not a new amount of money. Pending deliberately does not extend
        it: a bar that filled on a claim would say the course was paid for.
      */}
      <Meter
        value={balance.paid_minor}
        max={balance.total_minor}
        tone={balance.is_settled ? "ok" : "accent"}
        label={`${formatMoney(balance.paid_minor, balance.currency)} paid of ${formatMoney(
          balance.total_minor,
          balance.currency,
        )}`}
        className="mt-4"
      />

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        {figures.map((figure) => (
          <div key={figure.key}>
            <dt className="eyebrow">{figure.label}</dt>
            <dd
              className={`tabular mt-1.5 text-xl font-semibold tracking-tight ${figure.tone}`}
            >
              {formatMoney(figure.value, balance.currency)}
            </dd>
            <dd className="mt-0.5 text-xs text-ink-faint">{figure.note}</dd>
          </div>
        ))}
      </dl>

      {balance.pending_minor > 0 ? (
        <p className="mt-5 flex items-start gap-2 rounded-lg border border-warn-line bg-warn-wash px-3 py-2.5 text-[13px] leading-relaxed text-warn">
          <Icon name="info" size={16} className="mt-px shrink-0" />
          <span>
            The pending figure is not deducted from the remainder. It becomes
            paid when someone approves it.
          </span>
        </p>
      ) : null}
    </Card>
  );
}
