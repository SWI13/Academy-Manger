"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useCan } from "@/components/SessionProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  Field,
  FieldSet,
  FormActions,
  FormError,
  Note,
  Select,
} from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { ApiFailure, api } from "@/lib/api";
import { PRIOR_LEVELS, WILAYAS } from "@/lib/choices";
import { manageableRoles } from "@/lib/manageable";
import { ROLE_LABELS, type RoleCode } from "@/lib/permissions";
import type { User } from "@/types";

/**
 * Creating an account.
 *
 * The role dropdown offers only what this caller may hand out - reception
 * cannot create an admin, which would be privilege escalation with extra
 * steps. That list mirrors `can_manage_role` in the backend, and mirroring is
 * safe here precisely because it is only a dropdown: the serializer refuses
 * anything outside its own answer, so at worst a drift offers a choice that
 * comes back as a validation error.
 *
 * The extra fields follow the role rather than all being shown at once. A
 * professor has no wilaya-and-prior-level; a student has no specialisation.
 * Fourteen inputs in one column is a form people abandon halfway down.
 */
export function NewPersonForm() {
  const router = useRouter();
  const can = useCan();
  const toast = useToast();
  const roles = manageableRoles(can);

  const [role, setRole] = useState<RoleCode | "">(
    roles.includes("STUDENT") ? "STUDENT" : "",
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set(field: string, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);

    // Only non-empty fields. Sending "" for an optional date is a validation
    // error, not an omission.
    const body: Record<string, unknown> = { primary_role: role };
    for (const [key, value] of Object.entries(values)) {
      if (value.trim() !== "") body[key] = value.trim();
    }

    try {
      const created = await api.post<User>("/users", body);
      toast({
        tone: "ok",
        title: "Account created",
        description: `${created.full_name} is ${created.public_id}.`,
      });
      router.push(`/users/${created.public_id}`);
      router.refresh();
    } catch (failure) {
      if (failure instanceof ApiFailure) {
        setErrors(failure.fieldErrors());
        setMessage(failure.message);
      } else {
        setMessage("Could not reach the server.");
      }
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex max-w-3xl flex-col gap-5">
      <Card>
        <FieldSet
          legend="Who they are"
          description="A phone number or an email is how they are reached; the identifier is how they sign in."
        >
          <Select
            label="Role"
            required
            value={role}
            onChange={(event) => setRole(event.target.value as RoleCode)}
            options={roles.map((code) => ({
              value: code,
              label: ROLE_LABELS[code],
            }))}
            placeholder="Choose a role"
            error={errors.primary_role}
            hint="Decides which dashboard they land on, and which fields below apply."
            wrapperClassName="sm:col-span-2"
          />

          <Field
            label="First name"
            required
            autoComplete="off"
            value={values.first_name ?? ""}
            onChange={(event) => set("first_name", event.target.value)}
            error={errors.first_name}
          />
          <Field
            label="Last name"
            required
            autoComplete="off"
            value={values.last_name ?? ""}
            onChange={(event) => set("last_name", event.target.value)}
            error={errors.last_name}
          />
          <Field
            label="Phone"
            icon="phone"
            autoComplete="off"
            value={values.phone ?? ""}
            onChange={(event) => set("phone", event.target.value)}
            error={errors.phone}
            hint="Stored in international form. 0555 12 34 56 is fine."
          />
          <Field
            label="Email"
            type="email"
            icon="mail"
            autoComplete="off"
            value={values.email ?? ""}
            onChange={(event) => set("email", event.target.value)}
            error={errors.email}
          />
        </FieldSet>
      </Card>

      {role === "STUDENT" ? (
        <Card className="animate-rise">
          <FieldSet
            legend="Student record"
            description="Everything here is optional and can be filled in later."
          >
            <Field
              label="Date of birth"
              type="date"
              value={values.date_of_birth ?? ""}
              onChange={(event) => set("date_of_birth", event.target.value)}
              error={errors.date_of_birth}
              // Age is derived from this and never stored: a stored age is
              // wrong within a year.
              hint="Age is worked out from this, not stored."
            />
            <Select
              label="Wilaya"
              options={WILAYAS}
              value={values.wilaya ?? ""}
              onChange={(event) => set("wilaya", event.target.value)}
              error={errors.wilaya}
              placeholder="Not given"
            />
            <Select
              label="Prior level"
              options={PRIOR_LEVELS}
              value={values.prior_level ?? ""}
              onChange={(event) => set("prior_level", event.target.value)}
              error={errors.prior_level}
              placeholder="Not assessed"
            />
            <Field
              label="Address"
              value={values.address ?? ""}
              onChange={(event) => set("address", event.target.value)}
              error={errors.address}
            />
            <Field
              label="Emergency contact"
              value={values.emergency_contact_name ?? ""}
              onChange={(event) =>
                set("emergency_contact_name", event.target.value)
              }
              error={errors.emergency_contact_name}
            />
            <Field
              label="Emergency phone"
              icon="phone"
              value={values.emergency_contact_phone ?? ""}
              onChange={(event) =>
                set("emergency_contact_phone", event.target.value)
              }
              error={errors.emergency_contact_phone}
            />
          </FieldSet>
        </Card>
      ) : null}

      {role === "PROFESSOR" ? (
        <Card className="animate-rise">
          <FieldSet legend="Professor record">
            <Field
              label="Specialisation"
              value={values.specialisation ?? ""}
              onChange={(event) => set("specialisation", event.target.value)}
              error={errors.specialisation}
            />
            <Field
              label="Hired on"
              type="date"
              value={values.hired_at ?? ""}
              onChange={(event) => set("hired_at", event.target.value)}
              error={errors.hired_at}
            />
            <Field
              label="Qualifications"
              value={values.qualifications ?? ""}
              onChange={(event) => set("qualifications", event.target.value)}
              error={errors.qualifications}
              wrapperClassName="sm:col-span-2"
            />
          </FieldSet>
        </Card>
      ) : null}

      <Note tone="info" icon="key">
        They get an identifier on creation. Set their password with a reset from
        their own page — there is no password field here, because nobody should
        type someone else’s password into a form.
      </Note>

      {message ? <FormError>{message}</FormError> : null}

      <FormActions>
        <Button
          type="submit"
          variant="primary"
          icon="user-plus"
          busy={busy}
          disabled={!role}
        >
          Create account
        </Button>
      </FormActions>
    </form>
  );
}
