# SM Academy — frontend

Next.js 16 (App Router) + TypeScript. Talks to Django, which is not routed
publicly: the browser reaches only this app, and this app reaches Django over
the internal network.

## Running it

Everything, in Docker:

```bash
docker compose up -d          # from the repo root
# http://localhost:3000
```

Just this app, against a backend already running:

```bash
cp .env.example .env.local
npm install
npm run dev
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on :3000 |
| `npm run build` | Production build (runs TypeScript) |
| `npm run typecheck` | TypeScript alone |
| `npm run lint` | ESLint |
| `npm run types` | Regenerate `src/types/api.d.ts` from `openapi.yaml` |

Refresh the schema from a running backend first:

```bash
docker compose exec -T backend sh -c \
  "python manage.py spectacular --file /tmp/schema.yml && cat /tmp/schema.yml" \
  > openapi.yaml
npm run types
```

## Generated files — do not edit

| File | Source | Guard |
| --- | --- | --- |
| `src/types/api.d.ts` | Django's OpenAPI schema | a serializer change the frontend has not caught up with fails `npm run typecheck` |
| `src/lib/permissions.ts` | `backend/apps/rbac/catalog.py` | `manage.py export_permissions --check` exits 1 on drift, with a diff |

The permission union is the important one. `can("payment.aprove")` has to be a
compile error rather than a button that stays hidden forever — the worst kind
of authorization bug, because the screen looks correct.

## How this is laid out

```
src/
  app/
    (auth)/login/            sign in
    (dash)/                  the signed-in shell: header, sidebar, session
      dashboard/
    api/v1/[...path]/        the BFF — the only thing that talks to Django
  components/
    navigation/              sidebar filtered by permission, user menu
    ui/                      button, field, stat tile
  lib/
    django.ts                server-only: the one module that knows Django's address
    session.ts               getSession(), read on the server on every render
    api.ts                   the client-side caller, one error shape
    permissions.ts           GENERATED
    format.ts                money and dates, formatted at the edge
  types/
    api.d.ts                 GENERATED
  proxy.ts                   fast bounce for visitors with no session cookie
```

## Things that are deliberate

**Nothing here is a security boundary.** A hidden nav link is an invitation not
extended, not a lock. Every real check is Django's: it refuses requests without
a live session, refuses roles without the permission, and returns 404 rather
than 403 for rows outside the caller's scope.

**The session is read on the server, every render.** No cached permission set,
nothing about who you are living in the browser. A revoked role takes effect on
the next page load.

**Dashboard tiles are absent, not hidden.** The page has no permission checks
in it. The API sends only the figures the caller may see, so a receptionist's
payload has no revenue key at all — nothing to find in the network tab.

**No arithmetic on money.** Amounts arrive as integer minor units plus a
currency and are formatted with `Intl.NumberFormat`. Totals and balances come
from Django. A browser that adds up payments will eventually disagree with the
ledger, and the receptionist will believe the screen.
