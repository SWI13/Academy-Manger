"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useDict } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field, FieldSet, FormActions, FormError, Note } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { ApiFailure, api } from "@/lib/api";
import type { Organisation } from "@/types";

/**
 * What every printed document says at the top of it.
 *
 * The preview at the bottom is the point of the screen. Somebody editing a
 * phone number is not really editing a database field - they are editing the
 * line under the logo on a receipt a parent will be handed, and showing them
 * that line as they type is the difference between a settings form and a
 * settings form anybody trusts.
 *
 * Every field is optional but the name. A blank line is left off the printed
 * page rather than printed as an empty row, so an institute with no website
 * simply has one fewer line under its address.
 */
export function OrganisationForm({
  organisation,
  mayManage,
}: {
  organisation: Organisation;
  mayManage: boolean;
}) {
  const d = useDict();
  const router = useRouter();
  const toast = useToast();

  const [form, setForm] = useState({
    // Every field is a plain string in form state: the schema types some of
    // them as optional, and a controlled input whose value can be undefined
    // switches to uncontrolled on the first keystroke.
    name: organisation.name ?? "",
    legal_name: organisation.legal_name ?? "",
    address_line: organisation.address_line ?? "",
    city: organisation.city ?? "",
    wilaya: organisation.wilaya ?? "",
    phone: organisation.phone ?? "",
    email: organisation.email ?? "",
    website: organisation.website ?? "",
    registration_number: organisation.registration_number ?? "",
    tagline: organisation.tagline ?? "",
    print_footer: organisation.print_footer ?? "",
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function set(key: keyof typeof form) {
    return (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    try {
      await api.patch<Organisation>("/organisation", {
        ...form,
        name: form.name.trim(),
      });
      toast({ tone: "ok", title: d.settings.saved });
      router.refresh();
    } catch (failure) {
      if (failure instanceof ApiFailure) {
        setFieldErrors(failure.fieldErrors());
        setError(failure.message);
      } else {
        setError(d.ui.serverUnreachable);
      }
    }
    setBusy(false);
  }

  // Composed the same way the server composes it, so what is previewed is
  // what will be printed once this is saved.
  const address = [form.address_line, form.city, form.wilaya].filter(Boolean).join(", ");
  const contact = [form.phone, form.email, form.website].filter(Boolean).join(" · ");

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <Card>
        <FieldSet legend={d.settings.identity} description={d.settings.identityLede}>
          <Field
            label={d.settings.name}
            required
            disabled={!mayManage}
            value={form.name}
            onChange={set("name")}
            error={fieldErrors.name}
            wrapperClassName="sm:col-span-2"
          />
          <Field
            label={d.settings.legalName}
            optional
            disabled={!mayManage}
            value={form.legal_name}
            onChange={set("legal_name")}
            error={fieldErrors.legal_name}
          />
          <Field
            label={d.settings.registrationNumber}
            optional
            disabled={!mayManage}
            value={form.registration_number}
            onChange={set("registration_number")}
            error={fieldErrors.registration_number}
          />
          <Field
            label={d.settings.tagline}
            optional
            disabled={!mayManage}
            value={form.tagline}
            onChange={set("tagline")}
            error={fieldErrors.tagline}
            wrapperClassName="sm:col-span-2"
          />
        </FieldSet>
      </Card>

      <Card>
        <FieldSet legend={d.settings.contact} description={d.settings.contactLede}>
          <Field
            label={d.settings.addressLine}
            optional
            disabled={!mayManage}
            value={form.address_line}
            onChange={set("address_line")}
            error={fieldErrors.address_line}
            wrapperClassName="sm:col-span-2"
          />
          <Field
            label={d.settings.city}
            optional
            disabled={!mayManage}
            value={form.city}
            onChange={set("city")}
            error={fieldErrors.city}
          />
          <Field
            label={d.settings.wilaya}
            optional
            disabled={!mayManage}
            value={form.wilaya}
            onChange={set("wilaya")}
            error={fieldErrors.wilaya}
          />
          <Field
            label={d.settings.phone}
            optional
            disabled={!mayManage}
            value={form.phone}
            onChange={set("phone")}
            error={fieldErrors.phone}
          />
          <Field
            label={d.settings.email}
            type="email"
            optional
            disabled={!mayManage}
            value={form.email}
            onChange={set("email")}
            error={fieldErrors.email}
          />
          <Field
            label={d.settings.website}
            optional
            disabled={!mayManage}
            value={form.website}
            onChange={set("website")}
            error={fieldErrors.website}
            wrapperClassName="sm:col-span-2"
          />
        </FieldSet>
      </Card>

      <Card>
        <FieldSet legend={d.settings.documents} description={d.settings.documentsLede} columns={1}>
          <Field
            label={d.settings.printFooter}
            optional
            disabled={!mayManage}
            value={form.print_footer}
            onChange={set("print_footer")}
            error={fieldErrors.print_footer}
          />
        </FieldSet>

        <div className="mt-5 border-t border-rule pt-5">
          <CardHeader title={d.settings.previewTitle} icon="printer" />
          {/*
            A scrap of the printed masthead, in the printed masthead's own
            colours rather than the interface's. Showing it in white-on-black
            would preview something that does not exist.
          */}
          <div className="mt-3 rounded-lg bg-white p-4 text-[#101317]">
            <p className="display text-[15px] font-bold leading-tight">
              {form.name || "—"}
            </p>
            {address ? (
              <p className="mt-0.5 text-[11px] text-[#6b7885]">{address}</p>
            ) : null}
            {contact ? (
              <p className="text-[11px] text-[#6b7885]">{contact}</p>
            ) : null}
            {form.registration_number ? (
              <p className="text-[11px] text-[#6b7885]">{form.registration_number}</p>
            ) : null}
            <p className="mt-3 border-t border-[#b9c3cc] pt-1.5 text-[10px] text-[#6b7885]">
              {form.print_footer || form.legal_name || form.name}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <Note tone="neutral" icon="info">
            {d.settings.logoNote}
          </Note>
        </div>
      </Card>

      {error ? <FormError>{error}</FormError> : null}

      {mayManage ? (
        <FormActions>
          <Button
            type="submit"
            variant="primary"
            icon="check"
            busy={busy}
            disabled={!form.name.trim()}
          >
            {d.common.save}
          </Button>
        </FormActions>
      ) : null}
    </form>
  );
}
