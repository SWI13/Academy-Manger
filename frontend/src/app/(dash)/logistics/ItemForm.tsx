"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useDict } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  Field,
  FieldSet,
  FormActions,
  FormError,
  Note,
  Select,
  TextArea,
} from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { ApiFailure, api } from "@/lib/api";
import { ITEM_CONDITIONS, ITEM_STATUSES } from "@/lib/choices";
import { formatMoney, toMinorUnits } from "@/lib/format";
import type { LogisticsItem } from "@/types";

/**
 * What a dropdown needs of a category or a room: an id and a label.
 *
 * Narrower than the full serialized row on purpose. The edit page has to be
 * able to add the item's own category back into the list when it has since
 * been retired, and it should not have to fabricate `created_at` and
 * `usage_count` to do it.
 */
export type Option = { id: number; name: string };

/**
 * Adding or editing one line of the inventory.
 *
 * One component for both, because they are the same fourteen fields and the
 * only difference is which verb the button carries. Two forms is how a field
 * added to one of them goes missing from the other.
 *
 * The category and room dropdowns are built from rows the server sent, so
 * this form offers exactly what exists and nothing that would come back as a
 * validation error. When there are no categories at all it says so and points
 * at the page that fixes it, rather than presenting an empty required select.
 *
 * The price is typed as a person types money and converted with
 * `toMinorUnits`, by string - `value * 100` cannot represent 20000.10 and
 * would record a centime less than was paid.
 */
export function ItemForm({
  item,
  categories,
  locations,
}: {
  /** Absent when adding. Present when editing, and the form starts filled. */
  item?: LogisticsItem;
  categories: Option[];
  locations: Option[];
}) {
  const d = useDict();
  const router = useRouter();
  const toast = useToast();

  const editing = Boolean(item);
  const currency = item?.currency ?? "DZD";

  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState(item ? String(item.category) : "");
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1));
  // Typed as string rather than as the schema union: a <select> hands back
  // a string, and the four values it can hand back are the four it was built
  // from. The API is what refuses a fifth.
  const [condition, setCondition] = useState<string>(item?.condition ?? "GOOD");
  const [status, setStatus] = useState<string>(item?.status ?? "AVAILABLE");
  const [location, setLocation] = useState(item?.location ? String(item.location) : "");
  const [purchaseDate, setPurchaseDate] = useState(item?.purchase_date ?? "");
  const [price, setPrice] = useState(
    item?.purchase_price_minor !== null && item?.purchase_price_minor !== undefined
      ? majorFromMinor(item.purchase_price_minor)
      : "",
  );
  const [serial, setSerial] = useState(item?.serial_number ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Refused here as well as by the database. The check constraint is the
  // guarantee; this is the sentence next to the box that caused it.
  const quantityValue = Number.parseInt(quantity, 10);
  const quantityError =
    quantity.trim() !== "" && (!Number.isFinite(quantityValue) || quantityValue < 0)
      ? d.logistics.quantityHint
      : undefined;

  const priceMinor = price.trim() === "" ? null : toMinorUnits(price, currency);
  const priceError =
    price.trim() !== "" && priceMinor === null ? d.logistics.priceHint : undefined;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (quantityError || priceError) return;

    setBusy(true);
    setError(null);
    setFieldErrors({});

    const body = {
      name: name.trim(),
      category: Number(category),
      quantity: Number.isFinite(quantityValue) ? quantityValue : 0,
      condition,
      status,
      location: location ? Number(location) : null,
      purchase_date: purchaseDate || null,
      purchase_price_minor: priceMinor,
      currency,
      serial_number: serial.trim(),
      notes: notes.trim(),
    };

    try {
      if (editing && item) {
        await api.patch<LogisticsItem>(`/logistics/items/${item.public_id}`, body);
        toast({ tone: "ok", title: d.logistics.itemSaved, description: item.public_id });
        router.push(`/logistics/${item.public_id}`);
      } else {
        const created = await api.post<LogisticsItem>("/logistics/items", body);
        toast({ tone: "ok", title: d.logistics.itemAdded, description: created.public_id });
        router.push(`/logistics/${created.public_id}`);
      }
      router.refresh();
    } catch (failure) {
      if (failure instanceof ApiFailure) {
        setFieldErrors(failure.fieldErrors());
        setError(failure.message);
      } else {
        setError(d.ui.serverUnreachable);
      }
      setBusy(false);
    }
  }

  if (!categories.length) {
    return (
      <Card>
        <Note tone="neutral" icon="info">
          {d.logistics.noCategories}
        </Note>
      </Card>
    );
  }

  return (
    <form onSubmit={submit} className="flex max-w-3xl flex-col gap-6">
      <Card>
        <FieldSet legend={d.logistics.sectionItem} description={d.logistics.itemLede}>
          <Field
            label={d.logistics.name}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Plastic stacking chair"
            error={fieldErrors.name}
            wrapperClassName="sm:col-span-2"
          />

          <Select
            label={d.logistics.category}
            required
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder={d.ui.chooseOne}
            options={categories.map((row) => ({
              value: String(row.id),
              label: row.name,
            }))}
            error={fieldErrors.category}
          />

          <Field
            label={d.logistics.quantity}
            required
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            error={quantityError ?? fieldErrors.quantity}
            hint={d.logistics.quantityHint}
          />

          <Select
            label={d.logistics.condition}
            required
            value={condition}
            onChange={(event) => setCondition(event.target.value)}
            placeholder={d.ui.chooseOne}
            options={ITEM_CONDITIONS.map((choice) => ({
              value: choice.value,
              label:
                (d.status as Record<string, string | undefined>)[choice.value] ??
                choice.label,
            }))}
            error={fieldErrors.condition}
          />

          <Select
            label={d.logistics.status}
            required
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            placeholder={d.ui.chooseOne}
            options={ITEM_STATUSES.map((choice) => ({
              value: choice.value,
              label:
                (d.status as Record<string, string | undefined>)[choice.value] ??
                choice.label,
            }))}
            error={fieldErrors.status}
          />

          <Select
            label={d.logistics.location}
            value={location}
            optional
            onChange={(event) => setLocation(event.target.value)}
            placeholder={d.common.none}
            options={locations.map((row) => ({
              value: String(row.id),
              label: row.name,
            }))}
            error={fieldErrors.location}
            hint={locations.length ? undefined : d.logistics.noLocations}
          />
        </FieldSet>
      </Card>

      <Card>
        <FieldSet legend={d.logistics.sectionPurchase} columns={2}>
          <Field
            label={d.logistics.purchaseDate}
            type="date"
            optional
            max={today()}
            value={purchaseDate}
            onChange={(event) => setPurchaseDate(event.target.value)}
            error={fieldErrors.purchase_date}
          />

          <Field
            label={d.logistics.purchasePrice}
            optional
            inputMode="decimal"
            autoComplete="off"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="12000"
            suffix={currency}
            error={priceError ?? fieldErrors.purchase_price_minor}
            hint={
              priceMinor !== null && !priceError
                ? formatMoney(priceMinor, currency)
                : d.logistics.priceHint
            }
          />

          <Field
            label={d.logistics.serial}
            optional
            autoComplete="off"
            value={serial}
            onChange={(event) => setSerial(event.target.value)}
            placeholder="SN-4471-B"
            error={fieldErrors.serial_number}
            hint={d.logistics.serialHint}
          />

          <TextArea
            label={d.logistics.notes}
            optional
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            error={fieldErrors.notes}
            wrapperClassName="sm:col-span-2"
          />
        </FieldSet>
      </Card>

      {error ? <FormError>{error}</FormError> : null}

      <FormActions>
        <Button
          type="submit"
          variant="primary"
          icon="check"
          busy={busy}
          disabled={!name.trim() || !category || Boolean(quantityError) || Boolean(priceError)}
        >
          {editing ? d.common.save : d.logistics.addItem}
        </Button>
        <Button
          type="button"
          variant="quiet"
          onClick={() => router.back()}
          disabled={busy}
        >
          {d.common.cancel}
        </Button>
      </FormActions>
    </form>
  );
}

/**
 * Minor units back into the text a person would have typed.
 *
 * The inverse of `toMinorUnits`, and the only place it is needed: an edit
 * form has to start with the value that is stored. Division is safe in this
 * one direction because the result is immediately turned into a string and
 * shown, never added to anything.
 */
function majorFromMinor(minor: number): string {
  // Two, for all three currencies this platform formats (see lib/format).
  // Named rather than inlined so that the day a zero-decimal currency arrives,
  // this is where it is fixed.
  const EXPONENT = 2;
  return (minor / 10 ** EXPONENT).toFixed(EXPONENT);
}

/** Today, in the yyyy-mm-dd a date input wants, in the reader's own zone. */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
