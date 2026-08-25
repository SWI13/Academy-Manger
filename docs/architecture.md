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
| D-2 | Review attached to student+course, or to enrolment? | Enrolment. Makes "only enrolled students may review" a foreign key. | **Settled** — built that way in Phase 12. |
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
| Tests | `pytest` | 32 passed (128 after Phase 2) |
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

All dates 2026. Every row marked **Done** was merged to `develop` with
`--no-ff` after the verification gate below passed on the running stack.

| Phase | State | Notes |
| --- | --- | --- |
| 1-3 Skeleton | **Done** 24 Aug | Repo, Docker Compose, settings split, `core`, custom user model, health endpoint, CI. |
| 4-5 Auth + RBAC | **Done** 24 Aug | `rbac` app, permission catalogue + seed, cached resolution, the two gates, session login, password change and staff reset. |
| 6 User management | **Done** 24 Aug | All five roles, scoped listing, role assignment, deactivation. |
| 7-9 Courses, enrolments, schedules | **Done** 24 Aug | Catalogue, professor assignment, enrolment with frozen price, recurring weekly schedule. |
| 9b Grades | **Done** 24 Aug | `Assessment`, `AssessmentScore`, averages computed on read, gradebook, professor roster and next-session view. Added by D-6. |
| 10-11 Payments and proofs | **Done** 24 Aug | Terminal states, separation of duty, presigned upload/download, balances computed on read. |
| 16 Audit log | **Done** 24 Aug | Append-only, enforced by a PostgreSQL trigger. No foreign keys. Brought forward, immediately after payments. |
| 13-14 Notifications, dashboards | **Done** 24 Aug | Channel abstraction (in-app registered, SMS stubbed per D-8), two idempotent beat jobs, one permission-driven dashboard endpoint. |
| 12 Reviews | **Done** 24 Aug | Attached to enrolment per D-2. Moderation workflow, author withheld from professors (D-9). |
| 15 Reports | **Done** 24 Aug | Three reports, operational split from financial, CSV export as a Celery job writing to the private bucket. |
| 17-18 Hardening, tests | Not started | |
| 19-20 Deployment | Not started | Production compose, Nginx, backups. |
| F1 Frontend foundation | **Done** 25 Aug | Next 16 App Router, the BFF proxy, session auth, permission-driven navigation, the dashboard. |
| F2+ Frontend features | Not started | Courses, enrolments, schedules, grades, payments, people, reviews, reports, audit. |

### Verification gate

Run against the real stack on every merge, not asserted from reading the code.

| Check | Command | After reviews + reports |
| --- | --- | --- |
| Tests | `pytest` | 381 passed |
| Lint | `ruff check .` | clean |
| Migration drift | `makemigrations --check` | no changes |
| Production posture | `check --deploy` (prod settings) | 0 issues |
| OpenAPI | `manage.py spectacular` | 56 paths, no warnings |
| Background jobs | `celery inspect registered` | 3 tasks, worker and beat both live |
| Frontend build | `npm run build` | compiles, TypeScript clean |
| Frontend lint | `npm run lint` | clean |
| Permission drift | `export_permissions --check` | in sync (exits 1 on drift, verified) |

## Frontend

Next.js 16 (App Router) + TypeScript. Five roles, one set of components: a
payments table is a payments table, and what differs between reception and the
owner is which columns and actions render, not which component.

### Django is not routed publicly

The browser talks only to Next. Next talks to Django over the internal
network, through one catch-all route handler at `/api/v1/[...path]`.

| Concern | How |
| --- | --- |
| Session | Django's session cookie, HttpOnly, re-emitted by the BFF onto the Next origin. The browser never holds a token, so no script that gets onto the page can read one. |
| CSRF | The BFF echoes the `csrftoken` cookie into `X-CSRFToken` and sets `Origin`/`Referer` to the site URL, which is what `CSRF_TRUSTED_ORIGINS` expects. The settings anticipated this: `CSRF_COOKIE_HTTPONLY = False` with the comment "the BFF must read it to echo the header". |
| Interpretation | None. The proxy forwards status and body unchanged. It does not reinterpret a 403 or retry a 409 - Django owns every authorization answer, and a proxy that second-guesses one is a proxy that can get it wrong. |
| Trailing slashes | Django wants one, Next redirects one away. The client writes paths without, the BFF adds it back. A 308 on a POST is a silent no-op and a miserable thing to debug. |

### Three mechanisms, not five directory trees

1. **The session, read on the server, on every render.** `getSession()` asks
   Django `/auth/me/` in the shell layout. Nothing about who you are is cached
   or stored in the browser, so a revoked role takes effect on the next page
   load rather than whenever something expires.
2. **Navigation as data.** Each nav item names the permission it needs.
   Granting reception `audit.view` tomorrow makes the Audit link appear with no
   code change.
3. **Tiles that are absent, not hidden.** The dashboard page has no permission
   checks in it at all. It renders a tile when its number arrived, and the API
   simply does not send figures the caller may not see - so there is nothing in
   the DOM or the network tab to find.

None of this is a security boundary. A hidden link is an invitation not
extended, not a lock; `src/proxy.ts` says so in as many words, because a
cookie-presence check that reads like authentication is how someone later
assumes it is one.

### Generated, never hand-written

| File | From | Guard |
| --- | --- | --- |
| `src/types/api.d.ts` | Django's OpenAPI schema | `npm run types`; a serializer change the frontend has not caught up with fails `npm run typecheck` |
| `src/lib/permissions.ts` | `apps/rbac/catalog.py` | `manage.py export_permissions --check` exits 1 on drift, with a diff |

The permission union is the one that matters. `can("payment.aprove")` must be
a compile error, not a button hidden forever - the worst kind of authorization
bug, because the screen looks correct.

### Money is never arithmetic in the browser

Amounts arrive as integer minor units plus a currency code and are formatted at
the edge with `Intl.NumberFormat`. Totals, balances and outstanding amounts are
computed by Django and rendered as received. A browser that adds up payments
will eventually disagree with the ledger, and the receptionist will believe the
screen in front of them.

## Decisions settled while building reviews and reports (24 Aug 2026)

| Ref | Question | Answer |
| --- | --- | --- |
| D-9 | May a professor see who wrote a review of their course? | **No.** A professor enters the marks of the student who wrote it. Knowing that STU-000042 gave two stars hands them a motive, the student knows it, and the channel then only ever returns fives. Professors read approved reviews of their own courses with the author omitted from the payload - not blanked, absent. |
| D-10 | When may a course be reviewed, and may a review be edited? | **On completion, and until a moderator rules.** A review written in week two is a review of the enrolment process. After moderation the text is frozen, mirroring the payment rule: editable until somebody has acted on it, immutable afterwards. |

### Review rules

- A review hangs off `Enrollment` (D-2), so "only someone who took this course
  may review it" is a foreign key and "one review per attempt" is a unique
  constraint.
- Created `PENDING` always. `status` is not a writable field, so no client can
  publish past moderation.
- **Never deleted.** `HIDDEN` and `REJECTED` keep the row, the moderator and
  the timestamp; `DELETE` answers 405 for everyone, including the owner. A
  moderation decision nobody can inspect afterwards is not moderation.
- Averages are computed on read over approved reviews only. A stored average
  cannot be re-derived once a review is hidden.
- The owner deliberately does not hold `review.create`. Only a student who took
  the course may review it, and the owner is not exempt from that.

### Report rules

- `report.view_operational` and `report.view_financial` are separate grants,
  and this is the whole reason the split exists: reception and professors hold
  the operational one. The enrolment report therefore carries no money at all -
  not even a course price.
- Every report is a function of `(user, filters)` and narrows through the same
  scoping helpers the API uses. The export runs in a worker with no request; if
  it built its own queryset it would eventually build an unscoped one.
- The worker **re-checks permissions and re-runs the query as the requester**.
  The gap between queueing a job and running it is exactly when a role gets
  revoked, and a queue message is not a place to put an authorization decision.
- Exports are private to whoever asked for them, including from the owner.
  Someone else's export is 404, never 403.
- CSV cells are guarded against spreadsheet formula injection, and money is
  written as minor units with a separate currency column - never a localised
  decimal that changes meaning depending on who opens the file.

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


## Phase 2 verification record (24 Aug 2026)

| Check | Result |
| --- | --- |
| Migrations | `rbac.0001` + `rbac.0002` applied |
| Seed | 39 permissions, 5 roles — OWNER 38, ADMIN 34, RECEPTION 14, PROFESSOR 12, STUDENT 12 |
| Tests | **128 passed** |
| Lint | clean |
| Migration drift | none |
| `check --deploy` | 0 issues |
| OpenAPI | 6 paths, generates clean |

### Decisions made during Phase 2

**Custom Role/Permission tables, not `contrib.auth` Group/Permission.**
Django ties every `Permission` row to a `ContentType`, forcing each one to be
about exactly one model. `report.view_financial` and `settings.manage` are not
about a model.

**`catalog.py` is the single source of truth.** The seed migration applies it
and the tests assert against it, so the two cannot drift. Adding a permission
without deciding who holds it fails the suite.

**Cache invalidation by global version bump, not targeted deletion.**
Permission changes are rare; a missed invalidation leaves a revoked power in
place. One counter is blunt and impossible to get subtly wrong. Signals cover
every route into the tables so invalidation never depends on a call site.

**No self-service password reset.** Students frequently have no email and SMS
is not in the MVP, so there is no delivery channel to trust. Reset is
staff-initiated and returns a temporary password once, in the response.

**Deny by default everywhere.** A view declaring no permission is closed. A
viewset that never implements `scope_queryset` raises rather than returning
every row. An action the view did not map is denied even for the owner.
