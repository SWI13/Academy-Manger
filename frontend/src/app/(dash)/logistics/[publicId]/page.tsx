import { notFound } from "next/navigation";

import { StatusBadge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { PageHeader } from "@/components/ui/PageHeader";
import { getJson } from "@/lib/django";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { getDict } from "@/lib/i18n.server";
import { can, cookieHeader, getSession } from "@/lib/session";
import type { LogisticsItem } from "@/types";

import { DeleteItem } from "./DeleteItem";

type Props = { params: Promise<{ publicId: string }> };

export async function generateMetadata({ params }: Props) {
  return { title: (await params).publicId };
}

/**
 * One line of the inventory, in full.
 *
 * A soft-deleted item is not here: the API's default manager hides it, so
 * this 404s rather than rendering a record that every list says does not
 * exist. That is the right answer - "deleted" and "never existed" look the
 * same from outside on purpose.
 */
export default async function LogisticsItemPage({ params }: Props) {
  const d = await getDict();
  const { publicId } = await params;
  const cookie = await cookieHeader();

  const [item, session] = await Promise.all([
    getJson<LogisticsItem>(`/api/v1/logistics/items/${publicId}/`, cookie),
    getSession(),
  ]);
  if (!item) notFound();

  const mayManage = can(session, "logistics.manage");
  const seesPrice = can(session, "report.view_financial");

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader
        back={{ href: "/logistics", label: d.logistics.title }}
        title={item.name}
        eyebrow={item.public_id}
        badge={<StatusBadge status={item.status} />}
        actions={
          mayManage ? (
            <>
              <LinkButton href={`/logistics/${item.public_id}/edit`} icon="settings">
                {d.logistics.editItem}
              </LinkButton>
              <DeleteItem publicId={item.public_id} name={item.name} />
            </>
          ) : null
        }
      />

      <Card>
        <DescriptionList
          items={[
            { label: d.logistics.category, value: item.category_name },
            {
              label: d.logistics.quantity,
              value: (
                <span className="tabular font-semibold">
                  {formatNumber(item.quantity)}
                </span>
              ),
            },
            {
              label: d.logistics.condition,
              value: <StatusBadge status={item.condition} size="sm" />,
            },
            {
              label: d.logistics.status,
              value: <StatusBadge status={item.status} size="sm" />,
            },
            {
              label: d.logistics.location,
              value: item.location_name ?? d.common.none,
            },
            item.serial_number
              ? {
                  label: d.logistics.serial,
                  value: <span className="tabular">{item.serial_number}</span>,
                }
              : null,
            item.purchase_date
              ? {
                  label: d.logistics.purchaseDate,
                  value: formatDate(item.purchase_date),
                }
              : null,
            // The price is a commercial figure, so it follows the same
            // permission the rest of them do rather than being visible to
            // everyone who can see a chair.
            seesPrice &&
            item.purchase_price_minor !== null &&
            item.purchase_price_minor !== undefined
              ? {
                  label: d.logistics.purchasePrice,
                  value: formatMoney(item.purchase_price_minor, item.currency ?? "DZD"),
                }
              : null,
            item.notes
              ? { label: d.logistics.notes, value: item.notes, wide: true }
              : null,
          ]}
        />
      </Card>

      <Card>
        <CardHeader title={d.logistics.lastUpdated} icon="clock" divider />
        <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <div>
            <dt className="eyebrow">{d.logistics.added}</dt>
            <dd className="tabular mt-1.5 text-sm text-ink">
              {formatDateTime(item.created_at)}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">{d.logistics.lastUpdated}</dt>
            <dd className="tabular mt-1.5 text-sm text-ink">
              {formatDateTime(item.updated_at)}
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
