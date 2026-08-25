/**
 * The permission codenames the backend recognises.
 *
 * GENERATED FILE - do not edit.
 * Regenerate with `python manage.py export_permissions` in backend/.
 *
 * Written from `apps/rbac/catalog.py`, which is the single source of truth.
 * The union type is the point: a typo in a permission name is a compile
 * error, not a button that is hidden forever.
 */

export const PERMISSIONS = [
  // Users & access
  "user.view",
  "user.create",
  "user.update",
  "user.deactivate",
  "user.reset_password",
  "user.assign_role",
  "role.manage",
  // Catalogue
  "course.view",
  "course.create",
  "course.update",
  "course.archive",
  "course.assign_professor",
  "schedule.view",
  "schedule.manage",
  // Enrolment
  "enrollment.view",
  "enrollment.create",
  "enrollment.update",
  "enrollment.cancel",
  // Grades
  "assessment.view",
  "assessment.manage",
  "score.view",
  "score.enter",
  "score.publish",
  // Money
  "payment.view",
  "payment.create",
  "payment.approve",
  "payment.reject",
  "payment.cancel",
  "proof.upload",
  "proof.view",
  // Engagement
  "review.create",
  "review.view",
  "review.moderate",
  "notification.send",
  // Oversight
  "report.view_operational",
  "report.view_financial",
  "report.export",
  "audit.view",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type RoleCode =
  | "OWNER"
  | "ADMIN"
  | "RECEPTION"
  | "PROFESSOR"
  | "STUDENT";

export const ROLE_LABELS: Record<RoleCode, string> = {
  OWNER: "Owner",
  ADMIN: "Administrator",
  RECEPTION: "Reception",
  PROFESSOR: "Professor",
  STUDENT: "Student",
};
