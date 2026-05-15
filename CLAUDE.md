# AYDT Registration Admin Portal

## Automatic Agent Workflow

Before implementing any non-trivial feature, launch the appropriate agents **in parallel** to gather full context first. Do not start writing code until agent results are back.

### Task type → agents to launch

| Task involves                                  | Agents to launch in parallel                                    |
| ---------------------------------------------- | --------------------------------------------------------------- |
| New UI (component, modal, page, layout)        | `ui-pattern-explorer` + `schema-and-query-explorer` (if DB)     |
| Payment / EPG / installments / webhooks        | `epg-researcher` + `schema-and-query-explorer`                  |
| New page or multi-layer feature (3+ files)     | `feature-touch-point-mapper` first, then other agents as needed |
| DB-only work (query, server action, migration) | `schema-and-query-explorer`                                     |
| After any implementation                       | `test-runner` (run in background)                               |

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

## Scope Contract (read before any code change)

Before editing any file, state a **scope contract** in the response:

1. **Goal:** one sentence describing what's changing and why.
2. **In scope:** explicit list of files/directories that may be modified.
3. **Out of scope:** zones from the table below that are NOT to be touched.
4. **Open questions / assumptions:** anything unclear that, if wrong, would expand scope.

Then wait for confirmation OR proceed only if the task is small and unambiguous (single file, single zone, < ~30 lines). If during implementation a change appears necessary outside the declared scope, **stop and ask** — do not silently expand. Renames, "while I'm here" cleanups, formatting changes in untouched files, and refactors of adjacent code all count as scope expansion.

## Scope Zones

The project is partitioned into zones. A task should declare which zone(s) it belongs to, and edits should stay inside those zones unless the user explicitly approves crossing a boundary.

| Zone                        | Paths                                                                                                       | Notes                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Admin UI**                | `app/admin/**` (except `app/admin/payments/**` and `_components/**`)                                        | Subdivided into per-feature sub-zones — see "Admin UI Sub-Zones" below.                                |
| **Admin shared layout**     | `app/admin/_components/**`                                                                                  | TopBar, NotificationBell, right panels. Changes here affect every admin page — treat as cross-cutting. |
| **Public / user-facing**    | `app/(user-facing)/**`, `app/v2/**`, `app/sms-opt-in/**`, `app/unsubscribe/**`                              | Family/dancer-facing flows. Do NOT modify when working on admin tasks.                                 |
| **Instructor app**          | `app/instructor/**`                                                                                         | Separate surface. Out of scope for admin or public work.                                               |
| **Auth**                    | `app/auth/**`, `middleware.ts`                                                                              | Login, callbacks, session. High-blast-radius — never touch as a side effect.                           |
| **Payments / EPG**          | `utils/payment/**`, `app/admin/payments/**`, `app/api/epg/**`, `supabase/functions/epg-*`, `docs/elavon/**` | Requires `epg-researcher` agent before edits. Never modify as a side effect of unrelated work.         |
| **Server actions (global)** | `app/actions/**`                                                                                            | Cross-cutting. Changing a signature here can break many callers — survey usage first.                  |
| **Queries**                 | `queries/**`                                                                                                | Supabase query layer. Verify column names against `supabase/migrations/`.                              |
| **DB schema**               | `supabase/migrations/**`                                                                                    | Append-only. Never edit existing migrations; create a new one.                                         |
| **Edge functions**          | `supabase/functions/**`                                                                                     | Scheduled jobs and webhook handlers. Deploy implications — confirm before editing.                     |
| **Shared types**            | `types/index.ts`                                                                                            | Touch only when the task explicitly involves a type contract change.                                   |
| **Shared UI primitives**    | `app/components/**`, `lib/**`, `app/lib/**`                                                                 | Used across surfaces. Changing one affects many places — survey usage first.                           |
| **Styling globals**         | `app/globals.css`, `scss/**`, `tailwind.config.js`, `postcss.config.mjs`                                    | Visual blast radius is the whole app. Prefer scoped Tailwind classes over editing these.               |
| **Tests**                   | `tests/**`, `vitest.*`, `playwright.config.ts`                                                              | Free to add/edit when the task changes covered behavior.                                               |
| **Tooling / config**        | `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `package.json`                                      | Never modify as a side effect. Requires explicit approval.                                             |
| **Docs**                    | `docs/**`, `README.md`, `CHANGELOG.md`, `CLAUDE.md`                                                         | Never modify unless the task is explicitly documentation.                                              |
| **Seed / scripts**          | `scripts/**`, `supabase/seed*`                                                                              | Only when task explicitly involves seeding or one-off scripts.                                         |

### Cross-zone rules

- **Out-of-zone discoveries:** If a bug or smell is spotted outside the declared scope, mention it in the response — do not fix it.
- **Cross-cutting zones** (Admin shared layout, Auth, Server actions, Shared types, Shared UI primitives, Styling globals): assume edits here are out of scope by default; require explicit user approval to enter.
- **Migrations are append-only:** never edit a file under `supabase/migrations/` that already exists.

## Admin UI Sub-Zones

The Admin UI zone is partitioned by feature directory. Each row below is an isolated sub-zone — work scoped to one sub-zone must not modify files in another without explicit approval.

| Sub-zone               | Paths                                                                                                              | Notes                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Semester — create**  | `app/admin/semesters/new/**`, `app/admin/semesters/SemesterForm.tsx`, `app/admin/semesters/steps/**`               | Multi-step create flow. ⚠️ `steps/**` and `actions/**` are SHARED with edit — see shared note below.        |
| **Semester — edit**    | `app/admin/semesters/[id]/**`, `app/admin/semesters/SemesterTabs.tsx`                                              | Per-semester edit, dashboard, invites, lifecycle. Shares `steps/**` with create flow.                       |
| **Semester — shared** | `app/admin/semesters/actions/**`, `app/admin/semesters/steps/**`, `app/admin/semesters/page.tsx`                    | Server actions and step components consumed by BOTH create and edit. Editing here affects both flows — call this out explicitly in the scope contract. |
| **Semester — dev**     | `app/admin/semesters/dev/**`                                                                                       | Dev-only tooling for semesters. Never modified as a side effect.                                            |
| **Families**           | `app/admin/families/**`                                                                                            | Family list, detail, dancers under a family.                                                                |
| **Dancers**            | `app/admin/dancers/**`                                                                                             | Dancer list and detail.                                                                                     |
| **Classes**            | `app/admin/classes/**`                                                                                             | Class list, detail, actions.                                                                                |
| **Sessions**           | `app/admin/sessions/**`                                                                                            | Session table. Right panel lives in Admin shared layout.                                                    |
| **Register (admin)**   | `app/admin/register/**`                                                                                            | Admin-driven registration flow (incl. drop-in). Distinct from public registration.                          |
| **Emails**             | `app/admin/emails/**`                                                                                              | Email templates, list, edit, steps.                                                                         |
| **Reports**            | `app/admin/reports/**`                                                                                             | Reporting page and client.                                                                                  |
| **Credits**            | `app/admin/credits/**`                                                                                             | Credit management.                                                                                          |
| **Instructors**        | `app/admin/instructors/**`                                                                                         | Instructor management. Distinct from the instructor app surface (`app/instructor/**`).                      |
| **Warnings**           | `app/admin/warnings/**`                                                                                            | Warnings list and actions.                                                                                  |
| **Profile**            | `app/admin/profile/**`                                                                                             | Admin's own profile page.                                                                                   |
| **Users**              | `app/admin/users/**`                                                                                               | User management.                                                                                            |
| **Media**              | `app/admin/media/**`                                                                                               | Media management.                                                                                           |

### Admin UI sub-zone rules

- **Default isolation:** working in one sub-zone (e.g. Semester — create) means no edits to any other sub-zone, even if a "related" change seems obvious.
- **Shared sub-zones are dangerous:** Semester — shared, Admin shared layout, and global server actions all have multi-flow blast radius. Treat any edit there as cross-cutting: name it in the scope contract, and confirm before changing.
- **Cross-feature data (queries, types):** if a sub-zone task requires changes to `queries/**` or `types/index.ts`, declare those zones explicitly in the scope contract — they're not auto-included.

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
