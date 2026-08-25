# Trying it out

Two different questions, two different answers.

- **"Does it work?"** — the automated gates, below. They run in about a minute.
- **"Is it right?"** — sign in as each role and look. That is the part no test
  suite answers, because the interesting properties here are about *who sees
  what*, and a passing assertion cannot tell you a screen makes sense.

## Start it

```bash
cp .env.example .env          # then set DJANGO_SECRET_KEY and the passwords
docker compose up -d
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py seed_demo
```

`seed_demo` prints the accounts. It creates a term's worth of invented data:
three courses (one finished, one running, one draft), eleven people, nine
enrolments, marks with one assessment deliberately unpublished, payments in
every state, and a review waiting for moderation.

It is idempotent — run it again and nothing doubles — and it refuses to run
against production or staging settings.

Then open **<http://localhost:3000>**. Everyone's password is
`demo-passphrase-2026`.

| Sign in as | ID | |
| --- | --- | --- |
| Owner | `OWN-000001` | everything, including the audit log |
| Administrator | `ADMIN-000001` | everything except roles and the audit log |
| Reception | `REC-000001` | records payments, cannot approve them |
| Professor | `PROF-000002` | marks and the roster; no money at all |
| Professor | `PROF-000001` | teaches the *finished* course — empty week, published marks |
| Student | `STU-000001` | own marks, own payments, own review |

## What to look at

The point of this platform is that five roles share one set of screens and
see different things. So the useful test is to open **the same page** as two
people and compare.

**Payments** — open as the owner, then as `STU-000001`. The owner's table has
a *Student* column and a *Recorded / approved* column; the student's has
neither, because every row is theirs and they cannot approve anything. Then
open a pending payment as the owner: **Approve** is disabled if the owner
recorded it, with the reason beside it. Reception has no Approve button at
all.

**Enrolments** — open as `PROF-000002`, then as reception. The professor sees
*Age*, *Level* and *Wilaya* and no price; reception sees the price and none of
the roster fields. A professor holds no payment permission, so the price is
not hidden from them — the API never sends it.

**Grades** — as `PROF-000002`, put a course ID (`C-2026-002`) in the box. One
student is deliberately unmarked, so the gradebook shows an honest blank
rather than a 0%. Open a mark sheet: the *Final exam* is unpublished, so
`STU-000001` cannot see their mark for it. Publish it and they can.

**Reviews** — as the owner there is one waiting for moderation. Approve it,
then look at the same page as `PROF-000001`. The comment is there; the
author's name is not — it is not in the payload at all, so there is nothing to
find in the network tab.

**Enrol somebody** — as reception, **Enrolments → Enrol a student**. The
course list offers only what accepts enrolments *and* what you can see: an
administrator is offered the draft course, reception is not. The panel shows
the price that is about to be frozen onto the enrolment.

**Reports** — the owner has three; reception has one, and it contains no money
at all. Queue a CSV export as the owner and download it.

**Audit log** — owner only. The administrator gets bounced to the dashboard,
because an admin cannot read the record of what they did.

## Poking at the edges

The screens hide things, but hiding is not what protects them. These are worth
trying with `curl`, because they are the properties the whole design rests on.

```bash
API=http://localhost:3000/api/v1
signin () {
  curl -s -c "$2" -X POST $API/auth/login -H 'Content-Type: application/json' \
    -d "{\"identifier\":\"$1\",\"password\":\"demo-passphrase-2026\"}" -o /dev/null
}

signin STU-000001   student.txt
signin REC-000001   reception.txt
signin OWN-000001   owner.txt
signin ADMIN-000001 admin.txt
```

**Someone else's payment is 404, not 403.** A "forbidden" would confirm the
reference is real, and payment references are sequential — iterate and you have
mapped the table.

```bash
curl -b student.txt -o /dev/null -w '%{http_code}\n' $API/payments/PAY-000007
# 404 — belongs to STU-000005

curl -b student.txt -o /dev/null -w '%{http_code}\n' $API/payments/PAY-000001
# 200 — theirs
```

**Reception cannot create an administrator**, whatever the dropdown offers.

```bash
curl -b reception.txt -X POST $API/users -H 'Content-Type: application/json' \
  -d '{"first_name":"A","last_name":"B","primary_role":"ADMIN"}'
# 400  "Your role cannot create a ADMIN account."
```

**Nobody grants themselves a role, the owner included.**

```bash
curl -b owner.txt -X POST $API/users/OWN-000001/roles \
  -H 'Content-Type: application/json' -d '{"role":"ADMIN"}'
# 400  "You cannot change your own roles."
```

**Whoever takes the money does not confirm it arrived.** Two different
refusals, and the difference matters: reception is told it is not their job,
the owner is told it is not their *turn*.

```bash
# Reception records one; note the public_id it returns
curl -b reception.txt -X POST $API/payments -H 'Content-Type: application/json' \
  -d '{"enrollment_id":1,"amount_minor":100000,"paid_on":"2026-08-01","method":"CASH"}'

curl -b reception.txt -X POST $API/payments/PAY-00000N/approve   # 403, no permission
curl -b owner.txt     -X POST $API/payments/PAY-00000N/approve   # 200

# Now the owner records one and tries to approve their own
curl -b owner.txt -X POST $API/payments -H 'Content-Type: application/json' \
  -d '{"enrollment_id":1,"amount_minor":50000,"paid_on":"2026-08-02","method":"CASH"}'
curl -b owner.txt -X POST $API/payments/PAY-00000M/approve
# 409  "You recorded this payment, so you cannot approve it."
```

**An administrator cannot read the audit log.**

```bash
curl -b admin.txt -o /dev/null -w '%{http_code}\n' $API/audit
# 403

curl -b admin.txt -o /dev/null -w '%{http_code}\n' http://localhost:3000/audit
# 307 — bounced to the dashboard
```

## The automated gates

```bash
docker compose exec backend pytest                     # 392 tests, ~20s
docker compose exec backend ruff check .
docker compose exec backend ruff format --check .
docker compose exec backend python manage.py makemigrations --check --dry-run

docker compose exec -e DJANGO_SETTINGS_MODULE=config.settings.prod \
  -e DJANGO_ALLOWED_HOSTS=example.com backend \
  python manage.py check --deploy --fail-level WARNING
```

Frontend:

```bash
cd frontend
npm run lint
npm run typecheck
npm run build
```

Generated files must match their source of truth. Both exit non-zero on drift,
with a diff:

```bash
cd backend
python manage.py export_permissions --check
python manage.py export_choices --check
```

All of the above run in CI on every push. `.github/workflows/ci.yml` is the
authoritative list; if something is worth checking, it belongs there rather
than in a habit.

## Starting from nothing

```bash
docker compose down -v        # deletes the database and the bucket
docker compose up -d
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py seed_demo
```

## What is not tested

Worth saying plainly.

- **No load testing.** This has never run against more than a few dozen rows.
  The queries are indexed and paginated, but "should be fine" is not a
  measurement.
- **No browser automation.** Every screen has been driven with `curl` against
  the running stack — which is how the header, cookie and scoping bugs were
  found — but nothing clicks buttons in a real browser. Client-side behaviour
  (the mark sheet's validation, the export polling) has been exercised by
  hand, not by a test.
- **SMS is a stub.** Deliberately, per D-8. The channel exists so adding it is
  a class rather than a schema change; it is not registered.
- **Not every record can be created from the screens yet.** Enrolling a student
  can. Creating a course, recording a payment, adding a schedule slot or
  setting up an assessment are still API-only — the screens list and act on
  those records but do not yet make new ones.
