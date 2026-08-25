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
export type Review = Schemas["Review"];
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
