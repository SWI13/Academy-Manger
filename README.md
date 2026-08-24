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
docker compose down                      # stop
docker compose down -v                   # stop and wipe the database
```

Interfaces while the stack is up:

| URL | What |
| --- | --- |
| `http://localhost:8000/api/v1/health/` | health check |
| `http://localhost:8000/api/docs/` | API documentation (dev only) |
| `http://localhost:9001` | MinIO console — object storage browser |

## Layout

```
backend/
  config/          settings (base/dev/test/staging/prod), urls, celery
  apps/
    core/          abstract models, identifier allocation, pagination, errors
    accounts/      the user model
frontend/          Next.js — arrives in a later phase
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
must never be committed; `.env.example` documents every variable.

## Branches

`main` is always deployable. `develop` integrates. Each phase is built on
`feature/phase-N-name` and merged by pull request with a green CI run.
