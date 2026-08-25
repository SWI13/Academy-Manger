# SM Academy Platform

Course and institute management: students, professors, reception, admins and an
owner, over courses, enrolments, schedules, payments and their proofs.

Django + DRF + PostgreSQL + Redis + Celery, with a Next.js frontend.
Modular monolith, not microservices.

Full architecture: see `docs/architecture.md` for the link to the approved
blueprint (topology, ERD, permission matrix, security model, phase plan).

---

## Quick start

Requires Docker Desktop. Nothing else needs installing — Python, PostgreSQL,
Redis and the object store all live in containers, which is also how the
runtime stays pinned to Python 3.13 regardless of what is on your machine.

```bash
cp .env.example .env
# then edit .env: set DJANGO_SECRET_KEY and the two passwords
python -c "import secrets; print(secrets.token_urlsafe(64))"

docker compose up -d
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py seed_demo
```

`seed_demo` fills the database with a term's worth of invented data and prints
the accounts to sign in with. Then open **<http://localhost:3000>**.

**`docs/testing.md`** is the walkthrough: what to open as which role, and the
handful of `curl` checks that show the authorization rules are the backend's
and not the screen's.

```bash
curl http://localhost:8000/api/v1/health/
```

Expected response:

```json
{"status": "ok", "database": "ok", "cache": "ok"}
```

## Everyday commands

```bash
docker compose logs -f backend           # follow the API logs
docker compose exec backend pytest       # run the test suite
docker compose exec backend ruff check . # lint
docker compose exec backend python manage.py makemigrations
docker compose exec backend python manage.py migrate
docker compose logs -f frontend          # follow the Next.js logs
docker compose down                      # stop
docker compose down -v                   # stop and wipe the database
```

Interfaces while the stack is up:

| URL | What |
| --- | --- |
| `http://localhost:3000` | the application |
| `http://localhost:8000/api/v1/health/` | health check |
| `http://localhost:8000/api/docs/` | API documentation (dev only) |
| `http://localhost:9001` | MinIO console — object storage browser |

In production Django is not published at all. The browser reaches Next, Next
reaches Django on the internal network. Port 8000 is exposed here because it is
useful in development, not because anything depends on it.

## Layout

```
backend/
  config/          settings (base/dev/test/staging/prod), urls, celery
  apps/
    core/          abstract models, identifiers, storage, the scoped viewset
    rbac/          roles, permissions, the catalogue, the two gates
    accounts/      the user model and authentication
    students/ professors/ courses/ enrollments/ schedules/
    assessments/   marks and gradebook
    payments/      payments and proofs
    reviews/       reviews and moderation
    reports/       dashboard, reports, CSV export
    audit/ notifications/
frontend/          Next.js — BFF, shell, dashboard (see frontend/README.md)
docs/              architecture and runbooks
```

## Environments

| Environment | Settings module | Notes |
| --- | --- | --- |
| Development | `config.settings.dev` | Docker Compose, insecure cookies, debug on |
| Test | `config.settings.test` | Real PostgreSQL, fast hashing, eager Celery |
| Staging | `config.settings.staging` | Production posture, anonymised data |
| Production | `config.settings.prod` | TLS-only cookies, HSTS, JSON renderer only |

Secrets come from the environment in every case. `.env` is git-ignored and
must never be committed; `.env.example` documents every variable. The frontend
has its own pair, `frontend/.env.example` and `frontend/.env.local`.

## Generated files

Two files are written from the backend and committed. Both have a check that
fails rather than letting them drift:

```bash
# TypeScript types, from the OpenAPI schema.
# JSON, not YAML: a YAML 1.2 parser reads the bare enum members 08 and 09 as
# integers, which types two wilayas wrongly.
docker compose exec -T backend sh -c   "python manage.py spectacular --format openapi-json --file /tmp/s.json && cat /tmp/s.json"   > frontend/openapi.json
cd frontend && npm run types

# The frontend's permission union and choice lists
cd backend && python manage.py export_permissions
python manage.py export_choices
python manage.py export_permissions --check   # exits 1 on drift, with a diff
python manage.py export_choices --check
```

## Deploying

Production is a separate compose file with only Nginx published, TLS at the
edge, and a rehearsed backup/restore pair. See **`docs/deployment.md`** — it
also lists the four things that bit during the first real deploy, each of
which is silent until it is not.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

The `--env-file` flag is not optional; the runbook explains why.

## Branches

`main` is always deployable. `develop` integrates. Each phase is built on
`feature/phase-N-name` and merged by pull request with a green CI run.
