import type { Permission, RoleCode } from "./permissions";

/**
 * Which roles this caller may create or edit.
 *
 * A mirror of `can_manage_role` in `apps/accounts/scoping.py`, and mirrored
 * deliberately rather than fetched: it only decides what the role dropdown
 * offers. The backend refuses anything outside its own answer, so the worst a
 * drift here can do is offer a choice that comes back as a validation error -
 * not grant one.
 *
 * Reception creating an admin account would be privilege escalation with
 * extra steps. The rule is that the roles you may hand out are bounded by
 * your own.
 */
export function manageableRoles(
  can: (permission: Permission) => boolean,
): RoleCode[] {
  if (can("user.assign_role")) {
    // Owner. The only role that can make another owner.
    return ["OWNER", "ADMIN", "RECEPTION", "PROFESSOR", "STUDENT"];
  }
  if (can("user.deactivate")) {
    // Admin: everyone below them, and notably not another admin or an owner.
    return ["RECEPTION", "PROFESSOR", "STUDENT"];
  }
  if (can("user.create")) {
    // Reception: the people they serve.
    return ["PROFESSOR", "STUDENT"];
  }
  return [];
}
