# AYDT Registration Admin Portal

## Automatic Agent Workflow

Before implementing any non-trivial feature, launch the appropriate agents **in parallel** to gather full context first. Do not start writing code until agent results are back.

### Task type → agents to launch

| Task involves | Agents to launch in parallel |
|---|---|
| New UI (component, modal, page, layout) | `ui-pattern-explorer` + `schema-and-query-explorer` (if DB) |
| Payment / EPG / installments / webhooks | `epg-researcher` + `schema-and-query-explorer` |
| New page or multi-layer feature (3+ files) | `feature-touch-point-mapper` first, then other agents as needed |
| DB-only work (query, server action, migration) | `schema-and-query-explorer` |
| After any implementation | `test-runner` (run in background) |

### When to use `feature-touch-point-mapper`

Launch this agent **first** (before the others) when the feature:
- Touches more than 3 files
- Spans multiple layers (UI + server actions + DB + types)
- Involves a new admin section or multi-step flow

Use the returned file map to decide which other agents to launch.

---

## Standing Rules

### Design System
Always match existing Tailwind and CSS variable patterns exactly. Before writing any JSX:
- Reference existing components in `app/admin/families/page.tsx` (modals, inline editing)
- Reference `app/admin/payments/page.tsx` (badges, status pills)
- Reference `app/admin/sessions/SessionsTable.tsx` (tables, buttons)
- Use `ui-pattern-explorer` agent to extract exact class strings — do not invent styles

### EPG / Payments
Always read `docs/elavon/` before implementing any new EPG utility function. Use the `epg-researcher` agent — it will surface the relevant spec sections and what's already in `utils/payment/epg.ts`.

### Database
- `families` table uses `family_name` column — NOT `name`
- Verify all column names against `supabase/migrations/` before writing queries
- Use `schema-and-query-explorer` agent to map tables, types, and existing query patterns

---

## Project Stack

- **Framework:** Next.js (App Router) + TypeScript
- **Database:** Supabase (PostgreSQL + RLS + Edge Functions)
- **Payments:** Elavon EPG (hosted checkout + stored cards/ACH + recurring)
- **Styling:** Tailwind CSS + SCSS + CSS custom properties
- **Tests:** Vitest (`tests/` directory, `npx vitest run`)

## Key Directories

```
app/admin/              — admin pages and page-specific components
app/admin/_components/  — shared layout (TopBar, NotificationBell, right panels)
app/actions/            — global server actions
queries/                — Supabase query functions
utils/payment/epg.ts    — Elavon EPG API client
types/index.ts          — all shared TypeScript types
supabase/migrations/    — DB schema history (source of truth for column names)
supabase/functions/     — scheduled edge functions
docs/elavon/            — Elavon API documentation (read before any EPG work)
```
