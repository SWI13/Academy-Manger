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
/** Who this institute is, on paper. The header of every printed document. */
export type Organisation = Schemas["Organisation"];

// --- attendance -----------------------------------------------------------
export type AttendanceSession = Schemas["AttendanceSession"];
export type AttendanceRecord = Schemas["AttendanceRecord"];
export type AttendanceSummary = Schemas["AttendanceSummary"];
export type AttendanceTally = Schemas["AttendanceTally"];
export type AttendanceStudentRow = Schemas["AttendanceStudentRow"];
export type SessionSheet = Schemas["SessionSheet"];
export type RosterRow = Schemas["RosterRow"];

// --- whole-institute reports ----------------------------------------------
export type FinancialSummary = Schemas["FinancialSummary"];
export type ManagementReport = Schemas["ManagementReport"];
export type MoneyTally = Schemas["MoneyTally"];
export type MonthlyMoney = Schemas["MonthlyMoney"];

/**
 * What every `.../print/` endpoint answers with.
 *
 * One shape across nine resources, so a print route reads `sheet.results`
 * and `sheet.count` whatever it is printing.
 */
export type UserPrint = Schemas["UserPrint"];
export type CoursePrint = Schemas["CoursePrint"];
export type EnrollmentPrint = Schemas["EnrollmentPrint"];
export type SchedulePrint = Schemas["SchedulePrint"];
export type PaymentPrint = Schemas["PaymentPrint"];
export type AttendanceSessionPrint = Schemas["AttendanceSessionPrint"];
export type AttendanceRecordPrint = Schemas["AttendanceRecordPrint"];

export type LogisticsItem = Schemas["LogisticsItem"];
export type LogisticsCategory = Schemas["LogisticsCategory"];
export type LogisticsLocation = Schemas["LogisticsLocation"];
export type LogisticsOverview = Schemas["LogisticsOverview"];
export type LogisticsPrint = Schemas["LogisticsPrint"];
/** One row of a breakdown: chairs, or Room 3, or "Needs repair". */
export type Tally = Schemas["Tally"];
export type Expense = Schemas["Expense"];
export type ExpenseSummary = Schemas["ExpenseSummary"];
export type ExpenseTally = Schemas["ExpenseTally"];
export type ExpenseMonth = Schemas["ExpenseMonth"];
export type ExpenseHistoryRow = Schemas["ExpenseHistoryRow"];
export type ExpensePrint = Schemas["ExpensePrint"];
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
