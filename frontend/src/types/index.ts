import type { components } from "./api";

/**
 * Names for the generated schema types.
 *
 * `api.d.ts` is produced from Django's OpenAPI schema by `npm run types` and
 * is never edited by hand. Aliasing here means a serializer change shows up
 * as a type error at the place that uses the field, rather than as
 * `undefined` on a screen in front of a receptionist.
 */

type Schemas = components["schemas"];

export type User = Schemas["User"];
export type UserSummary = Schemas["UserSummary"];
export type Course = Schemas["Course"];
export type Enrollment = Schemas["Enrollment"];
export type Schedule = Schemas["Schedule"];
export type Assessment = Schemas["Assessment"];
export type Payment = Schemas["Payment"];
export type PaymentProof = Schemas["PaymentProof"];
/**
 * Narrowed on purpose.
 *
 * `ReviewSerializer.to_representation` *removes* the author fields for a
 * professor rather than blanking them - absent, not empty, so there is
 * nothing in the network tab to find. drf-spectacular cannot see that: a
 * read-only field is always listed as required in the response schema, so the
 * generated type says both are always present.
 *
 * Narrowing here rather than in `api.d.ts`, which is generated and must stay
 * that way. The runtime is the authority; this makes the compiler agree with
 * it.
 */
export type Review = Omit<
  Schemas["Review"],
  "student_name" | "student_public_id"
> & {
  readonly student_name?: string;
  readonly student_public_id?: string;
};
export type Notification = Schemas["Notification"];
export type AuditLog = Schemas["AuditLog"];
export type ReportExport = Schemas["ReportExport"];
export type ReportResult = Schemas["ReportResult"];
export type CourseProfessor = Schemas["CourseProfessor"];
export type Score = Schemas["Score"];
export type Average = Schemas["Average"];
export type AssessmentComponent = Schemas["AssessmentComponent"];
export type Gradebook = Schemas["Gradebook"];
export type GradebookRow = Schemas["GradebookRow"];
