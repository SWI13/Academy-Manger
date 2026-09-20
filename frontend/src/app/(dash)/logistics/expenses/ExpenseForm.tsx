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
import { PAYMENT_METHODS } from "@/lib/choices";
import { formatMoney, toMinorUnits } from "@/lib/format";
import { monthName } from "@/lib/logistics";
import type { Expense } from "@/types";

import type { Option } from "../ItemForm";

/**
 * Recording or correcting one expense.
 *
 * The accounting month is a field of its own, not a consequence of the date.
 * It follows the date by default - typing 3 March files it in March - and can
 * be moved, because February's electricity bill paid in March belongs in
 * February and an office that cannot say so will argue with its own totals.
 *
 * The amount is typed as a person types money and converted by string. There
 * is no total on this screen: what the month came to is the backend's figure
 * and appears on the list once this is saved.
 */
export function ExpenseForm({
  expense,
  categories,
}: {
  expense?: Expense;
  categories: Option[];
}) {
  const d = useDict();
  const router = useRouter();
  const toast = useToast();

  const editing = Boolean(expense);
  const currency = expense?.currency ?? "DZD";
  const now = new Date();

  const [name, setName] = useState(expense?.name ?? "");
  const [category, setCategory] = useState(expense ? String(expense.category) : "");
  const [amount, setAmount] = useState(
    expense ? majorFromMinor(expense.amount_minor) : "",
  );
  const [spentOn, setSpentOn] = useState(expense?.spent_on ?? today());
  const [periodYear, setPeriodYear] = useState(
    String(expense?.period_year ?? now.getFullYear()),
  );
  const [periodMonth, setPeriodMonth] = useState(
    String(expense?.period_month ?? now.getMonth() + 1),
  );
  const [method, setMethod] = useState(expense?.method ?? "");
  const [reference, setReference] = useState(expense?.reference ?? "");
  const [notes, setNotes] = useState(expense?.notes ?? "");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // `toMinorUnits` refuses anything that is not digits and one separator, so
  // a negative amount cannot get this far - the wording it shares with the
  // payments form is the one for an amount that is not a number at all.
  const minor = amount.trim() === "" ? null : toMinorUnits(amount, currency);
  const amountError =
    amount.trim() !== "" && minor === null ? d.payments.amountInvalid : undefined;

  /**
   * Moving the date moves the month with it, unless somebody has already
   * moved the month by hand.
   *
   * Without this the two fields drift apart silently: a receptionist who
   * corrects the date from 3 March to 3 April leaves the expense filed under
   * March and nothing on screen says so.
   */
  const [monthTouched, setMonthTouched] = useState(false);

  function changeDate(value: string) {
    setSpentOn(value);
    if (monthTouched || !value) return;
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return;
    setPeriodYear(String(parsed.getFullYear()));
    setPeriodMonth(String(parsed.getMonth() + 1));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (minor === null) return;

    setBusy(true);
    setError(null);
    setFieldErrors({});

    const body = {
      name: name.trim(),
      category: Number(category),
      amount_minor: minor,
      currency,
      spent_on: spentOn,
      period_year: Number(periodYear),
      period_month: Number(periodMonth),
      method,
      reference: reference.trim(),
      notes: notes.trim(),
    };

    try {
      if (editing && expense) {
        await api.patch<Expense>(`/logistics/expenses/${expense.public_id}`, body);
        toast({
          tone: "ok",
          title: d.logistics.expenseSaved,
          description: expense.public_id,
        });
      } else {
        const created = await api.post<Expense>("/logistics/expenses", body);
        toast({
          tone: "ok",
          title: d.logistics.expenseAdded,
          description: created.public_id,
        });
      }
      // Back to the month this expense belongs to, not the one the list
      // happened to be showing - otherwise saving an entry into February
      // returns to March and looks as though nothing was recorded.
      router.push(`/logistics/expenses?year=${periodYear}&month=${periodMonth}`);
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

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, index) => thisYear - index);

  return (
    <form onSubmit={submit} className="flex max-w-3xl flex-col gap-6">
      <Card>
        <FieldSet legend={d.logistics.sectionExpense}>
          <Field
            label={d.logistics.name}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Sonelgaz — March"
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
            label={d.logistics.amount}
            required
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="12000"
            suffix={currency}
            error={amountError ?? fieldErrors.amount_minor}
            hint={
              minor !== null && !amountError ? formatMoney(minor, currency) : undefined
            }
          />

          <Select
            label={d.logistics.method}
            optional
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            placeholder={d.common.none}
            options={PAYMENT_METHODS}
            error={fieldErrors.method}
          />

          <Field
            label={d.logistics.reference}
            optional
            autoComplete="off"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="F-2026-0184"
            error={fieldErrors.reference}
          />
        </FieldSet>
      </Card>

      <Card>
        <FieldSet
          legend={d.logistics.sectionFiling}
          description={d.logistics.accountingMonthHint}
        >
          <Field
            label={d.logistics.spentOn}
            type="date"
            required
            value={spentOn}
            onChange={(event) => changeDate(event.target.value)}
            error={fieldErrors.spent_on}
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label={d.logistics.accountingMonth}
              required
              value={periodMonth}
              onChange={(event) => {
                setMonthTouched(true);
                setPeriodMonth(event.target.value);
              }}
              placeholder={d.ui.chooseOne}
              options={Array.from({ length: 12 }, (_, index) => ({
                value: String(index + 1),
                label: monthName(index + 1),
              }))}
              error={fieldErrors.period_month}
            />
            <Select
              label={d.filters.year}
              required
              value={periodYear}
              onChange={(event) => {
                setMonthTouched(true);
                setPeriodYear(event.target.value);
              }}
              placeholder={d.ui.chooseOne}
              options={years.map((year) => ({
                value: String(year),
                label: String(year),
              }))}
              error={fieldErrors.period_year}
            />
          </div>

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
          disabled={!name.trim() || !category || minor === null || Boolean(amountError)}
        >
          {editing ? d.common.save : d.logistics.addExpense}
        </Button>
        <Button type="button" variant="quiet" onClick={() => router.back()} disabled={busy}>
          {d.common.cancel}
        </Button>
      </FormActions>
    </form>
  );
}

/** Minor units back into the text a person would have typed. See ItemForm. */
function majorFromMinor(minor: number): string {
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
