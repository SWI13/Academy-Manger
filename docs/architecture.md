# Architecture

The approved architecture — runtime topology, full schema, ERD, role and
permission matrix, API surface, frontend structure, security model, phase plan
and MVP scope — lives here:

**<https://claude.ai/code/artifact/662f4709-1b5d-4b38-be8c-9beea1b4a5a3>**

Revision C, 24 August 2026. Phase 1 merged; grades added by D-6.

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
| D-6 | What do professors manage? | **Answered 24 Aug 2026: grades.** Plus the class roster (name, age, wilaya, prior level) and the next session date. New Phase 9b. | Settled. |
| D-7 | Who may correct a mark, and until when? | **Answered 24 Aug 2026: no time limit.** A professor may change marks on any course they are assigned to, whenever. Marks do not freeze when a course completes. | Settled. |
| D-8 | Professor "updates" — in-app only, or SMS? | **Answered 24 Aug 2026: in-app now, SMS later, for students and professors both.** Notification carries `channel` + delivery status from the start; phone numbers stored in E.164 from day one. | Settled. Adding the SMS channel is a new class, not a schema change. |

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
| 9b Grades | Not started | `Assessment`, `AssessmentScore`, averages, professor roster and next-session view. Added by D-6. |
| 10–11 Payments and proofs | Not started | |
| 16 Audit log | Not started | Brought forward, immediately after payments. |
| 13–14 Notifications, dashboards | Not started | |
| 12 Reviews | Not started | |
| 15 Reports | Not started | |
| 17–18 Hardening, tests | Not started | |
| 19–20 Deployment | Not started | |

## Domain rules settled by D-6 (24 Aug 2026)

Professors manage **grades** (*les notes*), not free-text remarks.

- `Assessment` belongs to a Course and carries its own `max_score` and `weight`.
  The grading scale is data, so a /20 quiz and a /100 final coexist and next
  term's change is a form rather than a deploy.
- `AssessmentScore` is unique on `(assessment, enrollment)`. It hangs off the
  enrolment, not the student, so a retaken course gets a clean second set of
  marks and last year's results stay reproducible.
- Averages are computed on read from raw marks. Never stored — a stored
  average cannot be re-derived after the scheme changes.
- **Age is never stored.** `StudentProfile.date_of_birth` is stored and age is
  derived; a stored age is wrong within a year.
- `StudentProfile.wilaya` is a fixed list of Algeria's 58 codes, not free
  text, so rosters and reports can group by it.
- `StudentProfile.prior_level` is a fixed level list, used for placement and
  filtering.

Professor scope, enforced in `get_queryset()` and tested per role:

- Reads and writes reach only courses with an `ACTIVE` `CourseProfessor` row
  for that professor. The scope is a **who, not a when** — there is no deadline
  on entering or correcting a mark (D-7).
- Touching another professor's class returns **404, not 403** — an existing
  row the caller may not see must be indistinguishable from a missing one.
- Professors hold no `payment.*` permission at all. They see who is in the
  room, not who has paid.

## The professor surface is deliberately two screens

Confirmed 24 Aug 2026. A professor opens this platform for exactly two
reasons. This is a **constraint on future work**, not a summary: anything
proposed for the professor role that does not serve one of these two jobs is
out of scope until the constraint is revisited.

| Job | Endpoint |
| --- | --- |
| Enter marks | `GET /courses/{id}/assessments`, `PUT /assessments/{id}/scores` |
| Know what is next | `GET /professors/me/next-session`, `GET /courses/{id}/roster` |

`PUT /assessments/{id}/scores` takes the whole mark sheet in one atomic
write — forty marks either all save or none do. A half-entered mark sheet on
a dropped connection is the failure mode this prevents.

### "Updates" is a push, not a page

A professor teaching twice a week will not open the app to check whether
anything changed. Four events notify a professor, and no others:

1. Assigned to a course — a new `CourseProfessor` row.
2. Next session reminder — Celery beat, evening before, with time, room and
   current head-count.
3. Roster changed — enrolment or drop, **batched to one message a day** so a
   busy enrolment week is not forty notifications.
4. Schedule changed — an admin moved the time or the room.

In-app in MVP, behind a channel interface so SMS is an added class rather
than a refactor. See D-8.

## Designed for SMS before SMS exists (D-8, 24 Aug 2026)

SMS is planned for **students and professors both**, but not in the MVP. Two
things are cheap now and expensive once there is production data, so they were
done in Phase 1 rather than deferred with the feature:

**1. Phone numbers are stored in E.164.** An SMS gateway cannot dial
`0555123456`. Reception still types the local form and it is normalised on the
way in with libphonenumber; `DEFAULT_PHONE_REGION` (default `DZ`) is a setting,
not an assumption in the code. This also closed a duplicate-account hole:
`+213555123456` and `0555123456` are different strings, so the unique index
would have admitted both and given one student two accounts.

**2. Notification carries `channel` and delivery status from the start** —
`IN_APP` is the only channel in MVP, but the column and the per-recipient
delivery record exist, so adding SMS is a new channel class rather than an
ALTER on a table with history.

What is deliberately *not* built yet: a provider integration, credentials,
cost controls, opt-out handling, or delivery-receipt reconciliation. Those
arrive with the feature.


## Marks never lock (D-7, 24 Aug 2026)

A professor can change a mark at any time on a course they are assigned to.
Marks do not freeze when a course completes. The scope constraint is unchanged:
their own courses, never anyone else's.

Because there is no time lock, **the audit trail carries the entire weight of
the control** — which puts two obligations on the implementation:

1. Every score write records actor, timestamp, old value and new value in
   `AuditLog`. No exceptions, including bulk mark-sheet saves.
2. `AssessmentScore` carries `last_changed_by`, `last_changed_at` and
   `change_count` **on the row itself**, not only in the audit log. A mark
   edited a year after the course ended must say so where people actually look
   at marks, not only where an owner would have to go digging.

Trade accepted deliberately: a professor fixing a typo months later does not
have to chase an admin, and every such change is visible rather than silent.
