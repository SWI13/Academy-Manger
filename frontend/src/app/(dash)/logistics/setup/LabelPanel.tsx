"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useDict, useFill } from "@/components/LocaleProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field, FormError } from "@/components/ui/Field";
import type { IconName } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { ApiFailure, api } from "@/lib/api";
import { formatNumber } from "@/lib/format";

/**
 * One list of labels, with a box to add another.
 *
 * The same component for item categories, expense categories and rooms,
 * because they are the same thing three times: a name, whether it is still
 * offered, and how much is filed under it. Three near-identical panels is how
 * a fix to one of them misses the other two.
 *
 * `usage_count` is why the panel is worth having rather than a bare list. A
 * label with nothing under it can be retired without a thought; one with
 * ninety items under it is a decision, and the number is what turns it into
 * one.
 *
 * Retiring is a PATCH of `is_active`, not a DELETE. The API offers no DELETE
 * here at all - see the viewset - so this cannot be made to destroy a label
 * even by someone calling it directly.
 */
type Row = {
  id: number;
  name: string;
  is_active?: boolean;
  usage_count?: number;
};

export function LabelPanel({
  title,
  icon,
  rows,
  endpoint,
  createBody,
  addLabel,
  placeholder,
}: {
  title: string;
  icon: IconName;
  rows: Row[];
  /** "/logistics/categories" or "/logistics/locations". */
  endpoint: string;
  /** Whatever else the create needs - `{ kind: "ITEM" }` for a category. */
  createBody: Record<string, string>;
  addLabel: string;
  placeholder: string;
}) {
  const d = useDict();
  const t = useFill();
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which row is mid-request, so only that row's button goes quiet rather
  // than the whole panel freezing.
  const [pending, setPending] = useState<number | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setBusy(true);
    setError(null);
    try {
      await api.post(endpoint, { ...createBody, name: trimmed });
      setName("");
      toast({
        tone: "ok",
        title: endpoint.endsWith("locations")
          ? d.logistics.roomAdded
          : d.logistics.categoryAdded,
        description: trimmed,
      });
      router.refresh();
    } catch (failure) {
      setError(failure instanceof ApiFailure ? failure.message : d.ui.serverUnreachable);
    }
    setBusy(false);
  }

  async function toggle(row: Row) {
    setPending(row.id);
    setError(null);
    try {
      await api.patch(`${endpoint}/${row.id}`, { is_active: !row.is_active });
      router.refresh();
    } catch (failure) {
      setError(failure instanceof ApiFailure ? failure.message : d.ui.serverUnreachable);
    }
    setPending(null);
  }

  return (
    <Card padded={false} solid className="flex flex-col overflow-hidden">
      <CardHeader title={title} icon={icon} className="px-4 pt-4" />

      <ul className="mt-3 flex-1">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-3 border-t border-rule px-4 py-2"
          >
            <div className="min-w-0">
              <p
                className={`truncate text-sm ${
                  row.is_active === false ? "text-ink-faint line-through" : "text-ink"
                }`}
              >
                {row.name}
              </p>
              <p className="text-xs text-ink-faint">
                {row.usage_count
                  ? t(d.logistics.filedUnder, {
                      count: formatNumber(row.usage_count),
                    })
                  : d.logistics.nothingFiled}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {row.is_active === false ? (
                <Badge tone="neutral" size="sm">
                  {d.logistics.retired}
                </Badge>
              ) : null}
              <Button
                size="sm"
                variant="quiet"
                busy={pending === row.id}
                onClick={() => toggle(row)}
              >
                {row.is_active === false ? d.logistics.restore : d.logistics.retire}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <form onSubmit={add} className="border-t border-rule p-4">
        <div className="flex items-end gap-2">
          <Field
            label={addLabel}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={placeholder}
            wrapperClassName="flex-1"
          />
          <Button
            type="submit"
            icon="plus"
            variant="secondary"
            busy={busy}
            disabled={!name.trim()}
          >
            {d.common.save}
          </Button>
        </div>
        {error ? (
          <div className="mt-3">
            <FormError>{error}</FormError>
          </div>
        ) : null}
      </form>
    </Card>
  );
}
