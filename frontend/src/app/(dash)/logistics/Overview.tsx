import Link from "next/link";

import { Card, SectionHeader } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { formatNumber } from "@/lib/format";
import { getDict } from "@/lib/i18n.server";
import type { LogisticsOverview, Tally } from "@/types";

/**
 * The state of the institute's equipment, in figures.
 *
 * Every number here came from the API. Nothing on this page adds anything up:
 * a dashboard that counts the twenty-five rows it happens to be showing is a
 * dashboard that disagrees with the inventory as soon as anybody filters it.
 *
 * Deliberately plain. This is a management screen for a real organisation,
 * not a landing page - so the tiles carry a figure and a label, the
 * breakdowns are tables rather than charts, and there is nothing on it that
 * exists to look impressive.
 */
export async function Overview({ overview }: { overview: LogisticsOverview }) {
  const d = await getDict();

  return (
    <div className="flex flex-col gap-6">
      {/*
        Six tiles, in the order the questions get asked: how much is there,
        then what is wrong with it. The four on the right are the ones that
        mean somebody has to do something, which is why they carry colour and
        the first two do not.
      */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label={d.logistics.totalUnits}
          value={formatNumber(overview.units_total)}
          note={d.logistics.totalUnitsNote}
          icon="layers"
        />
        <StatTile
          label={d.logistics.totalItems}
          value={formatNumber(overview.items_total)}
          icon="file"
        />
        <StatTile
          label={d.logistics.inUse}
          value={formatNumber(overview.in_use_units)}
          tone="accent"
          icon="check-circle"
          href="/logistics?status=IN_USE"
        />
        <StatTile
          label={d.logistics.needingRepair}
          value={formatNumber(overview.needs_repair_units)}
          tone={overview.needs_repair_items ? "warn" : "plain"}
          icon="wrench"
          href="/logistics?condition=NEEDS_REPAIR"
        />
        <StatTile
          label={d.logistics.damaged}
          value={formatNumber(overview.damaged_units)}
          tone={overview.damaged_items ? "bad" : "plain"}
          icon="alert"
          href="/logistics?condition=DAMAGED"
        />
        <StatTile
          label={d.logistics.missing}
          value={formatNumber(overview.missing_units)}
          tone={overview.missing_items ? "bad" : "plain"}
          icon="search"
          href="/logistics?status=MISSING"
        />
      </div>

      {/*
        The category breakdown is the answer to "how many chairs", "how many
        tables", "how many TVs" - and it is built from the category rows, so a
        category invented this morning has a line here without anybody
        deploying anything.
      */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Breakdown
          title={d.logistics.byCategory}
          rows={overview.by_category}
          hrefFor={(row) => `/logistics?category=${row.key}`}
          itemsLabel={d.logistics.lines}
          empty={d.empty.nothing}
        />
        <Breakdown
          title={d.logistics.byLocation}
          rows={overview.by_location.filter((row) => row.key !== "")}
          hrefFor={(row) => `/logistics?location=${row.key}`}
          itemsLabel={d.logistics.lines}
          empty={d.logistics.noLocations}
        />
        <Breakdown
          title={d.logistics.byCondition}
          rows={overview.by_condition}
          hrefFor={(row) => `/logistics?condition=${row.key}`}
          itemsLabel={d.logistics.lines}
          empty={d.empty.nothing}
          // Condition labels come from the API in English; the interface has
          // its own word for each of the four, and this is the interface.
          labelFor={(row) =>
            (d.status as Record<string, string | undefined>)[row.key] ?? row.label
          }
        />
      </div>
    </div>
  );
}

/**
 * One breakdown table.
 *
 * A table rather than a chart, and a small one. Somebody looking at this
 * wants to read "Chairs 120" and then go and look at the chairs, so every
 * row is a link into the filtered list rather than a wedge of a pie.
 */
function Breakdown({
  title,
  rows,
  hrefFor,
  labelFor,
  itemsLabel,
  empty,
}: {
  title: string;
  rows: Tally[];
  hrefFor: (row: Tally) => string;
  labelFor?: (row: Tally) => string;
  itemsLabel: string;
  empty: string;
}) {
  return (
    <Card padded={false} solid className="overflow-hidden">
      <SectionHeader title={title} className="mb-0 px-4 pt-4" />
      {rows.length ? (
        <table className="mt-3 w-full border-collapse text-sm">
          <tbody>
            {rows.map((row) => (
              <tr key={row.key || row.label} className="border-t border-rule">
                <td className="px-4 py-2">
                  <Link
                    href={hrefFor(row)}
                    className="text-ink-soft transition-colors hover:text-accent"
                  >
                    {labelFor ? labelFor(row) : row.label}
                  </Link>
                </td>
                <td className="tabular px-2 py-2 text-end text-xs text-ink-faint">
                  {formatNumber(row.items)} {itemsLabel}
                </td>
                <td className="tabular px-4 py-2 text-end font-semibold text-ink">
                  {formatNumber(row.units)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-4 pb-4 pt-3 text-[13px] text-ink-faint">{empty}</p>
      )}
    </Card>
  );
}
