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
| F1 Frontend foundation | **Done** 25 Aug | Next 16 App Router, the BFF proxy, session auth, permission-driven navigation, the dashboard. |
| F2 Payments and enrolments | **Done** 25 Aug | List and detail for both, the approval panel, proof download, the balance card. The column factory. |
| F3 Courses, schedule, grades | **Done** 25 Aug | Catalogue and course detail, the week grid, the gradebook, the mark sheet, publishing, a student's own marks. |
| F4 People | **Done** 25 Aug | The list, the create form, roles, status and password reset — with the escalation boundaries stated on screen. |
| F5 Reviews, reports, audit | **Done** 25 Aug | Moderation queue, the three reports with CSV export, the append-only log. |
| 17-20 Hardening and deployment | **Done** 25 Aug | CI covering every gate, production compose, Nginx, backup and restore — all rehearsed against a running stack. See `docs/deployment.md`. |

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
| Tests | `pytest` | 392 passed in ~21s |
| Frontend build | `npm run build` | compiles, TypeScript clean |
| Frontend lint | `npm run lint` | clean |
| Permission drift | `export_permissions --check` | in sync (exits 1 on drift, verified) |
| Choice drift | `export_choices --check` | in sync |

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
| `src/lib/choices.ts` | the Django `TextChoices` enums | `manage.py export_choices --check`, same contract |

The permission union is the one that matters. `can("payment.aprove")` must be
a compile error, not a button hidden forever - the worst kind of authorization
bug, because the screen looks correct.

### One table, many column sets

`paymentColumns(can)` and `enrollmentColumns(can)` return different columns for
different callers, and the same `DataTable` renders all of them. Five parallel
tables is how a fix to one silently misses the other four.

Verified against the running stack rather than reasoned about:

| Caller | Payment columns |
| --- | --- |
| Owner | Reference, Student, Course, Amount, Paid on, Method, Status, **Recorded / approved** |
| Student | Reference, Course, Amount, Paid on, Method, Status |

| Caller | Enrolment columns |
| --- | --- |
| Professor | Student, Course, **Age, Level, Wilaya**, Enrolled, Status |
| Reception | Student, Course, **Agreed price**, Enrolled, Status |

The professor's set has no price and the student's has no payer, because
neither is a column those roles have a permission for. Filters follow the same
rule: a student gets no "Student" box, since it could only ever match
themselves.

Omitting a column is presentation, not protection. The API already declines to
send rows outside the caller's scope, so there is no row on any of these
screens the caller was not entitled to receive.

### Separation of duty is explained, not just enforced

`approve()` refuses when `created_by == actor`. The approval panel says so and
disables the button, rather than letting someone press it and receive a 409.
A rule people discover by being refused is one they learn to resent; one the
screen explains is one they understand.

Both layers were checked end to end: the owner's own payment renders a disabled
Approve with the reason beside it, and `POST .../approve` on it returns **409**
regardless of what the browser does.

### Filters live in the URL

Not in component state. A receptionist who has narrowed the ledger to one
student and one month needs to be able to send that view to a colleague, and to
still have it after a refresh. Filter state in `useState` is state nobody can
share.

### The escalation boundaries are on screen, not just in the 403

People is the one screen that creates accounts and hands out powers, so every
limit is stated rather than left to be discovered by refusal. All of them are
enforced by Django; the UI only says them out loud.

| Rule | How the screen shows it |
| --- | --- |
| The roles you may hand out are bounded by your own | The create dropdown offers owner ▸ all five, admin ▸ reception/professor/student, reception ▸ professor/student. Verified against the API, which refuses the rest with "Your role cannot create a ADMIN account." |
| Only the owner grants roles | An admin sees "an administrator manages people but cannot hand out powers, including to themselves" where the buttons would be. The API answers **403**. |
| Nobody changes their own roles, the owner included | Your own record says so. The API answers **400**, "You cannot change your own roles." |
| Nobody changes their own status | Your own record explains that the button would be a way to lock yourself out of the system you administer. |
| Reception never sees an owner or admin account | `GET /users/OWN-000002` as reception is **404**, not 403 — a forbidden response would confirm the ID is real. |
| A reset shows the temporary password once | Rendered in a warning block saying it is not shown again, with a note that existing sessions are already invalid. |

`manageableRoles()` mirrors `can_manage_role` and says so. Mirroring is safe
here because it only decides what a dropdown offers: the serializer refuses
anything outside its own answer, so the worst a drift can do is offer a choice
that comes back as a validation error — never grant one.

### A schema bug the wilaya dropdown found

Wilaya codes are strings `"01"`–`"58"`. In the YAML schema, `01`–`07` came out
quoted and **`08` and `09` came out bare** — PyYAML quotes the first seven
because they would otherwise resolve as octal, and leaves `08`/`09` alone
because they are not valid octal. A YAML 1.2 parser then reads those two as
the integers 8 and 9, so the generated TypeScript typed Béchar and Blida as
numbers.

The type pipeline now reads `openapi.json` rather than `openapi.yaml`
(`spectacular --format openapi-json`), where `"08"` cannot be anything but a
string. This is worth knowing beyond this project: any consumer of a
drf-spectacular YAML schema with leading-zero string enums has the same
problem.

### Three more the frontend found, all of the same shape

Each was invisible from inside the network and obvious the moment something
outside it tried to follow a link.

**Pagination links named the container.** DRF builds absolute URLs from
`request.get_host()`, which behind the BFF is `backend:8000`. So `next` came
back as `http://backend:8000/api/v1/payments/?page=2` — the internal hostname
handed to the browser, and a link it could not follow, so paging broke on any
list longer than one page. The BFF now sends `X-Forwarded-Host`/`-Proto` and
Django honours them. `ALLOWED_HOSTS` still checks the forwarded value, and a
test asserts an unrecognised one is refused with 400 — "nothing but the proxy
can set this header" is a topology claim, and the host check is what makes the
setting safe if that claim ever stops holding.

**Signed storage URLs named the container too, and could not be rewritten.**
`presign_download` signed against `http://minio:9000`, so proof downloads and
report exports produced links that failed before leaving the machine. SigV4
covers the host header, so this could not be patched after signing — a
rewritten URL is an invalid signature. There are now two clients: `_client()`
for what Django does itself (head, put, delete) and `_signing_client()` for
URLs the browser follows, chosen by `S3_PUBLIC_ENDPOINT_URL`. **Proof download
had been broken in a browser since it was built**, and no test caught it
because the tests run inside the network, where `minio:9000` resolves.

**Two schema gaps.** `AuditLog.old_values`/`new_values` generated as `unknown`
(a bare `JSONField` carries no shape), so the frontend could not read a key off
a diff without casting — the exact check generated types exist to give. Both
are declared `DictField` now. And `Review.student_name` is *removed* for
professors rather than blanked; drf-spectacular lists every read-only field as
required, so the schema claims it is always present. That one is narrowed in
`src/types/index.ts` with the reason written down, because `api.d.ts` is
generated and must stay that way.

### Two defects the frontend work uncovered

Neither was visible from the backend alone. Both were found by building a
screen and watching it behave wrongly.

**The test suite was never running under test settings.** `pyproject.toml` set
`DJANGO_SETTINGS_MODULE` as an ini key, but the container exports
`DJANGO_SETTINGS_MODULE=config.settings.dev` for `runserver`, and
pytest-django resolves `--ds` > environment variable > ini key. The
environment won silently. Every run to this point used Argon2 instead of the
fast hasher, `DEBUG = True`, and **the real Redis instead of LocMemCache** — so
the autouse `cache.clear()` fixtures were flushing the development cache on
every test, which is what kept signing people out mid-session. Fixed by
putting `--ds=config.settings.test` in `addopts`, where nothing can outrank
it. The suite went from 77 seconds to 20, and all 385 tests still pass — so
nothing had come to depend on dev settings.

**Sessions shared a Redis database with the permission cache.** The default
cache is scratch space by design: RBAC permission sets live there precisely so
they can be discarded. With sessions in the same store, `cache.clear()` was a
mass logout — a receptionist halfway through taking a payment returned to a
login screen because someone changed a role. Sessions now have their own alias
on db3, and four tests hold the two apart, including one that signs a
receptionist in, flushes the permission cache, and checks they are still
signed in.

### The professor's two screens

D-6 fixed the professor surface at exactly two jobs. Both are now built, and
the constraint held — nothing was added for them beyond it.

*Enter marks.* The whole class saves in one request, because the API replaces
the sheet in one transaction: forty marks either all land or none do. A blank
is not a zero and is left out of the payload entirely. Per D-7 there is no
deadline anywhere in the UI, and a corrected mark carries `corrected ×n` with
who changed it and when — on the professor's sheet *and* on the student's own
list, because a mark that quietly changes between two visits is worse than one
that says it changed.

*Know what is next.* The week grid draws seven columns, Sunday first, because
the schedule is a recurring weekly pattern and not a diary of dated sessions
(D-3). A calendar of individual dates would imply per-session cancellation
exists, and it does not.

### Publishing gates the student view, and there is no unpublish

Verified end to end: before publish a student's marks page says "No marks
published yet"; after publish the mark appears. Hiding a mark a class has
already seen does not unsee it, so the honest remedy for a wrong mark is to
correct it — which the same screen supports at any time.

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

---

## Logistics: the inventory and what it costs to run (29 Aug 2026)

The academy's physical resources and its monthly operating costs, added as one
app with two halves. They answer the same question from opposite sides: the
inventory is what the money bought, and the expenses are what the money went
on, so they share a category table rather than owning one each.

| Ref | Question | Answer |
| --- | --- | --- |
| D-11 | How does the office add a kind of equipment nobody wrote code for? | **Categories are rows.** `logistics.Category` is a table with a `kind` discriminator (`ITEM` / `EXPENSE`), seeded with twenty-four labels and editable from a setup screen. A `TextChoices` would have been a deploy every time the institute bought something new. Condition and status stay enumerations, because the interface reasons about those four values - they drive colours, tiles and filters. |
| D-12 | Reception must see everything and change nothing. Where does that live? | **In `required_permissions`, per action.** Four permissions, two per half: `logistics.view` / `logistics.manage` and `expense.view` / `expense.manage`. Reception holds both `.view`s and neither `.manage`. A single `logistics.access` permission could not express the distinction without a role check somewhere else, which is the thing this platform does not do. |
| D-13 | An expense is dated. Why does it also carry a month? | **Because February's bill is often paid in March.** `spent_on` is when the money left; `period_year` / `period_month` are the accounting month it belongs to. The period defaults to the month of `spent_on` and moves with it when the date is corrected, and can be set apart from it deliberately. Every total is computed over the period, so "March" means the same thing on the dashboard, in the history table and on the printed report. |
| D-14 | Delete, when the platform's rule is that nothing is deleted? | **Soft, and the first user of `SoftDeleteModel`.** The requirement asked for a delete button; the row leaves every list, every count and every printed sheet at once, and `LOGISTICS_ITEM_DELETED` / `EXPENSE_DELETED` keep who removed it. A deleted item 404s rather than 403s - "deleted" and "never existed" look the same from outside. |

### Inventory rules

- `quantity` is what lets forty chairs and one projector be one shape. Anything
  with a serial number is a line of its own with a quantity of one, and a
  partial unique index refuses two live rows claiming the same serial. An
  inventory that counts a laptop twice is worse than one nobody wrote down.
- Every figure is counted two ways: `items` is how many lines match, `units` is
  how many objects they describe. "12 items needing repair" and "12 chairs
  needing repair" are different sentences and the second is usually the one
  meant.
- Categories and rooms are **retired, never deleted** - `DELETE` answers 405,
  as it does for reviews. Every row filed under a label refers to it, so
  deleting one would either orphan those rows or take them with it. Retiring
  removes it from the dropdowns; the edit forms put an item's own retired
  category back into its dropdown, so re-saving cannot silently re-file it.
- The purchase price follows `report.view_financial`, not `logistics.view`. It
  is a commercial figure and the permission that governs the rest of them
  governs this one.

### Printing

Two A4 sheets, rendered by the application rather than generated as PDFs:
`/print/logistics` and `/print/expenses`, in their own route group so they
inherit no dashboard chrome.

- They read the same filters the list screens put in the URL, which is what
  makes "print all", "print the filtered list", "print one room" and "print one
  category" the same feature rather than four buttons.
- They fetch `/logistics/items/print/` and `/logistics/expenses/print/`, which
  answer **unpaginated**. A printed inventory that silently stops at the
  twenty-fifth row is worse than no printed inventory: it looks complete.
- The totals travel with the rows and describe the same filtered selection, and
  the sheet says in words what narrowed it - "Room 3" in the heading is the
  difference between a document filed as the whole inventory and one filed as
  one room's.
- `globals.css` gains a `.sheet` block that deliberately opts out of the design
  system. Everything else here is built on black being the ground; paper is
  not, and half the ink in a dark interface disappears on a laser printer.
- Reception can print. Printing changes nothing, and the desk is who walks the
  list around the building.

---

## Printing as a platform feature, and attendance (30 Aug 2026)

Fifteen printed documents, one system, and a register to print. The three
pieces arrived together because the printing was the requirement and the other
two were what it turned out to need: a document has to say whose institute it
belongs to, and an attendance report has to have attendance to report.

| Ref | Question | Answer |
| --- | --- | --- |
| D-15 | How does a print button print *what the reader is looking at*? | **The filters are already in the URL.** The toolbar has kept search, dates and categories in the query string since Phase 6, because a filtered view is a thing people send each other. `PrintButton` copies the ones its screen declares onto the print route, and the print route hands them to `.../print/` - the same scoped queryset the list ran, without the page boundary. "Print the filtered list" was not built; it fell out. |
| D-16 | Can printing become a way around a permission? | **No, and the mechanism is that there is no second door.** `PrintableMixin.printable` is an action on the same viewset, mapped to the same codename the list uses, running `get_queryset` - scope and all. A professor printing a roster gets their own courses because `scope_queryset` says so. `apps/core/tests/test_printing.py` asserts this against every printable resource. |
| D-17 | Where do "Page 1 of 5", repeating headers and clean breaks come from? | **Measured JavaScript, not CSS.** `@page { @bottom-right { content: counter(page) }}` is real CSS that no browser engine implements; Chrome's own page numbers are a print-dialog setting that also stamps the URL across the top. So `PrintDocument` measures the rendered rows and deals them into fixed-height page boxes. That buys a true page count, a column header at the top of every page, and totals at the foot of the last one - none of which `break-inside: avoid` can do alone. |
| D-18 | Where does the letterhead come from? | **A singleton `core.Organisation`, edited by the owner.** A phone number on a receipt is not deployment configuration. This is what `settings.manage` has been reserved for since Phase 5, where it was seeded to the owner and governed nothing. The *logo* is deliberately not in it: the official artwork already lives in `public/brand/` under the rule that it is placed and never redrawn, and a second copy uploaded through a form is how an institute ends up with two logos and no answer about which is current. |
| D-19 | Does late count as attendance? | **Yes, and the decision lives in one function.** `attendance.services.attendance_rate` is `(present + late) / total`. Somebody who walked in twenty minutes after the start was in the room, and a register that scores them the same as a student who never came is one a professor stops trusting. It is one function precisely because somebody will eventually want it changed. |
| D-20 | What does an empty register mean? | **That nobody has taken it** - not that everybody was away, and the two are not the same thing to a parent asking why their child is marked absent. Opening a register is a deliberate act, unmarked rows are omitted from the PUT rather than defaulted to ABSENT, and a rate over no records is `null` rather than 0%. |

### The print system

- `apps/core/printing.py` gives any list resource a `GET .../print/`: the
  caller's own filters, unpaginated, capped at 2,000 with a `truncated` flag
  the sheet prints when it is reached. Nine resources use it.
- `PrintDocument` is the only printed layout in the platform. A route supplies
  a title, columns, rows and totals; the masthead, filter line, page breaks,
  repeated headers, page numbers and footer are not a route's business. The
  logistics inventory sheet - which predates the system and had a layout of
  its own - was migrated onto it, which is the evidence that one system is
  enough.
- A route with a table is **two files**: a server `page.tsx` that guards,
  fetches and passes plain data, and a colocated client component that
  declares the columns. `PrintDocument` must be a client component (it
  measures the DOM and calls `window.print()`), and a `cell` function cannot
  cross that boundary - the same split the dashboard's tables already use. A
  document with no table stays one server file.
- **PDF is the browser's.** The print dialog's "Save as PDF" destination
  produces this exact layout because it *is* this layout, on every operating
  system. The button says so rather than hiding it in the dialog. A
  server-side renderer would be a second rendering path to keep matching the
  first, forever.
- `globals.css` grew a `PAPER` section that deliberately opts out of the
  design system. Everything else here is built on black being the ground;
  paper is not, and half the ink in a dark interface disappears on a laser
  printer.

### Attendance

- `AttendanceSession` is one register - one course, one date, unique together.
  `AttendanceRecord` hangs off an `Enrollment` rather than a student, the same
  decision `Payment` makes: a record cannot exist for somebody who is not on
  the course, and the roster the register offers is the roster by construction.
- Written a whole sheet at a time through `PUT .../register/`, never a row at
  a time. A professor marking forty names on institute Wi-Fi either saves all
  of them or none, and a second write path is how one of them ends up without
  an audit trail. `AttendanceRecordViewSet` is read-only for the same reason.
- Registers do not lock, for the same reason marks do not (D-7). The weight is
  on the trail: `change_count`, `last_changed_by` and `last_changed_at` sit on
  the row, and a correction writes `ATTENDANCE_CHANGED` with both values.
  Taking a register writes one `ATTENDANCE_TAKEN`, not forty.
- Reception holds `attendance.view` and not `attendance.record`: the desk is
  asked "was my child in on Tuesday" and must be able to answer it without
  being able to change the answer.
- An untaken register prints as a **blank sheet** - the roster down the page
  with three empty boxes beside each name - which is how a register is often
  actually taken in a room with no laptop in it. Same route, same layout as a
  taken one, because they are the same document at two points in its life.
