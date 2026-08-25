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

> **New files and the dev container.** Turbopack inside the container does not
> always see a file that appears in the bind mount after it started. If an
> import of a file you just created resolves as missing, `docker compose
> restart frontend` — it is a file-watching quirk, not a broken import.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on :3000 |
| `npm run build` | Production build (runs TypeScript) |
| `npm run typecheck` | TypeScript alone |
| `npm run lint` | ESLint |
| `npm run types` | Regenerate `src/types/api.d.ts` from `openapi.json` |

Refresh the schema from a running backend first:

```bash
docker compose exec -T backend sh -c \
  "python manage.py spectacular --format openapi-json --file /tmp/s.json && cat /tmp/s.json" \
  > openapi.json
npm run types
```

## Generated files — do not edit

| File | Source | Guard |
| --- | --- | --- |
| `src/types/api.d.ts` | Django's OpenAPI schema | a serializer change the frontend has not caught up with fails `npm run typecheck` |
| `src/lib/permissions.ts` | `backend/apps/rbac/catalog.py` | `manage.py export_permissions --check` exits 1 on drift, with a diff |
| `src/lib/choices.ts` | Django's choice lists | `manage.py export_choices --check` |

The permission union is the important one. `can("payment.aprove")` has to be a
compile error rather than a button that stays hidden forever — the worst kind
of authorization bug, because the screen looks correct.

## How this is laid out

```
src/
  app/
    (auth)/login/            sign in
    (dash)/                  the signed-in shell: rail, top bar, session
      dashboard/             role-shaped, from one endpoint
      courses/ enrollments/ schedules/ grades/ payments/
      users/ reviews/ notifications/ reports/ audit/ account/
      loading.tsx            per route: a skeleton shaped like the page
      error.tsx not-found.tsx
    api/v1/[...path]/        the BFF — the only thing that talks to Django
  components/
    navigation/              rail, drawer, top bar, nav as data
    ui/                      the design system (below)
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

## The design system

`app/globals.css` holds every token — surface, ink, rule, accent, the four
semantic pairs, radii, five shadows, three durations and one easing curve.
Nothing in a component picks a hex value or a duration of its own, which is
why the dark palette is a redefinition of that list rather than a sweep
through every screen.

The navigation rail keeps its deep navy in both themes. It is the one piece of
chrome that says which product this is, and chrome that inverts with the theme
says nothing.

`components/ui` is the vocabulary every screen is built from:

| | |
| --- | --- |
| `Button` `IconButton` `LinkButton` | five intents, three sizes; a link that navigates is never a button |
| `Field` `Select` `TextArea` `FieldSet` `FormActions` `FormError` `Note` | label above, error or hint below, both wired with `aria-describedby` |
| `DataTable` | one table, many column sets — and cards, not sideways scroll, below `md` |
| `Card` `CardHeader` `SectionHeader` `PageHeader` `BackLink` | the page furniture, laid out the same way every time |
| `Badge` `StatusBadge` | one status vocabulary for the whole application |
| `StatTile` `Figure` `Meter` `Stars` | figures, at the size a figure deserves |
| `EmptyState` `ErrorState` `NoAccess` `Skeleton*` | the four things a screen shows when it has no rows |
| `Modal` `ConfirmDialog` | the platform's `<dialog>`, so the focus trap is not ours to get wrong |
| `Toast` `Dropdown` `Tabs` `Timeline` `Avatar` `Icon` | |

`Icon` is one set of 24×24 outlines on a single stroke weight, as path data
rather than a package: an icon library ships a thousand glyphs to render the
thirty this application uses, and every one of them arrives before the first
row of the table does.

## Things that are deliberate

**Nothing here is a security boundary.** A hidden nav link is an invitation not
extended, not a lock. Every real check is Django's: it refuses requests without
a live session, refuses roles without the permission, and returns 404 rather
than 403 for rows outside the caller's scope. `NoAccess` says a screen is not
part of your role; it is not what stops you reaching it.

**The session is read on the server, every render.** No cached permission set,
nothing about who you are living in the browser. A revoked role takes effect on
the next page load.

**Dashboard tiles are absent, not hidden.** The page has no permission checks
over a figure. The API sends only the numbers the caller may see, so a
receptionist's payload has no revenue key at all — nothing to find in the
network tab.

**No arithmetic on money.** Amounts arrive as integer minor units plus a
currency and are formatted with `Intl.NumberFormat`. Totals, balances and
remainders come from Django. The one conversion in the other direction —
`toMinorUnits`, for the amount somebody types into the payment form — is done
by string, because `20000.10 * 100` is `2000009.9999999998` in binary floating
point and that is a centime missing from the ledger.

**Pending money is never drawn as paid.** It is amber wherever it appears, it
sits beside the remainder rather than being subtracted from it, and no progress
bar fills on the strength of it.

**No global search box.** There is no endpoint that searches across courses,
people and payments at once, and a search field that works on some pages and
not others is worse than none.

**No sticky table headers.** A box with `overflow-x: auto` is a scrollport on
both axes, so a sticky `thead` inside one sticks to a box that never scrolls
vertically. The mark sheet's sticky *first column* does work, because that
container really does scroll horizontally.
