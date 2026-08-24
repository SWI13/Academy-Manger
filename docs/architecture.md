# Architecture

The approved architecture — runtime topology, full schema, ERD, role and
permission matrix, API surface, frontend structure, security model, phase plan
and MVP scope — lives here:

**<https://claude.ai/code/artifact/662f4709-1b5d-4b38-be8c-9beea1b4a5a3>**

Revision B, 24 August 2026. Supersedes Revision A.

## Decisions carried into the code

These were open at approval time and were built to the stated default. Any of
them can still change; the note says what it would cost.

| Ref | Decision | Built as | Cost to change now |
| --- | --- | --- | --- |
| D-1 | One role per user, or several? | Several, via `UserRole` (Phase 5). `User.primary_role` is a denormalised routing hint only. | Low until Phase 5 lands. |
| D-2 | Review attached to student+course, or to enrolment? | Enrolment. Makes "only enrolled students may review" a foreign key. | Low until Phase 12. |
| D-3 | Recurring weekly schedule, or dated sessions? | Recurring weekly. Per-session cancellation is not modelled. | Medium — a second table, decided before Phase 9. |
| D-4 | Can an APPROVED payment be reversed? | No. Approved is terminal; a correction is a new record. | Medium — a reversal model and permission, before Phase 10. |
| D-5 | Block double-booked rooms and professors? | Warn, allow override. | Low — a validator change, or a range-overlap exclusion constraint. |
| D-6 | What do professors manage? | Nothing. Read-only: assigned courses, rosters, own schedule. | Depends entirely on the answer. |

## Deviations from the blueprint made during implementation

| Blueprint said | Built as | Why |
| --- | --- | --- |
| `User.primary_role_id` (FK to Role) | `User.primary_role` (CharField with choices) | It is a routing hint read on every request, and role codes are a fixed system set. A CharField avoids a join on the hot path and avoids altering the users table when the rbac app lands in Phase 5. The authoritative role set is still `UserRole`. |
| `User.last_login_at` | Django's built-in `last_login` | `AbstractBaseUser` already provides and maintains it. A second column would drift. |
| `django.contrib.admin` available | Not installed | A second administrative surface with its own authorization model is a parallel access path the permission matrix does not cover. The owner dashboard is the administrative interface. |

## Phase 1 verification record

Run against the real stack on 24 August 2026, not asserted from reading the code.

| Check | Command | Result |
| --- | --- | --- |
| Compose valid | `docker compose config` | 7 services resolve |
| Migrations | `manage.py migrate` | 17 applied, `accounts.0001` first |
| Health | `GET /api/v1/health/` | `200 {"status":"ok","database":"ok","cache":"ok"}` |
| Tests | `pytest` | 32 passed |
| Lint | `ruff check .` | clean |
| Migration drift | `makemigrations --check` | no changes detected |
| Production posture | `check --deploy` (prod settings) | 0 issues |
| OpenAPI | `manage.py spectacular` | generates, no warnings |
| Object storage | `minio-init` logs | bucket `sm-academy-private` created, access `none` |

### Environment notes

- Docker Desktop installs per-user on this machine
  (`%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin`), not to `Program Files`.
  A terminal opened before the install will not have it on `PATH`.
- WSL2 is required for the engine. Docker reports its absence as
  "virtualisation support not detected", which is misleading — the CPU flags
  were fine throughout.
- Git Bash rewrites absolute paths before they reach a container. Prefix
  `MSYS_NO_PATHCONV=1` when passing a container-side path to
  `docker compose exec`.

## Phase log

| Phase | State | Notes |
| --- | --- | --- |
| 1–3 Skeleton | **Done** — merged to `develop` 24 Aug 2026 | Repo, Docker Compose, settings split, `core`, custom user model, health endpoint, CI. |
| 4–5 Auth + RBAC | Not started | |
| 6 User management | Not started | |
| 7–9 Courses, enrolments, schedules | Not started | |
| 10–11 Payments and proofs | Not started | |
| 16 Audit log | Not started | Brought forward, immediately after payments. |
| 13–14 Notifications, dashboards | Not started | |
| 12 Reviews | Not started | |
| 15 Reports | Not started | |
| 17–18 Hardening, tests | Not started | |
| 19–20 Deployment | Not started | |
