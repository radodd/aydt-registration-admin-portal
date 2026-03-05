# Development Workflow & Scaling Practices

Notes for when the pricing/discount model is stabilized.

---

## 1. Dev Tools, Workflows, and Practices

**Local Supabase first.** Run `supabase start` so every developer has a fully isolated Postgres+Auth+Storage stack locally. This eliminates shared staging state corruption and lets you reset freely. The local instance mirrors production schema via migrations — you're testing against the real engine, not a mock.

**Server action logging.** Add a thin wrapper around your server actions that logs input/output in dev. For a system like this with complex multi-step flows (cart → batch → payment → webhook → finalize), structured logs make it easy to trace exactly what state each step received and produced without the UI.

**Supabase's database branching** (on pro tier) creates isolated DB instances per git branch, which is excellent for PRs that include schema changes.

---

## 2. Realistic Test Data Generation

**`supabase/seed.sql`** is the standard Supabase mechanism — it runs automatically after `supabase db reset`. For complex object graphs like yours (semester → classes → schedules → sessions → registration_batches → installments), you want:

- A **seed script in TypeScript** (not raw SQL) that calls your actual server actions or inserts via the Supabase client. This validates your action layer as a side effect of seeding.
- **Scenario-based seeds**: not just one generic seed, but named scenarios. For example:
  - `seed:semester-published` — published semester with 3 classes, 2 pricing models, realistic sessions
  - `seed:registration-pending` — a batch in pending state awaiting payment confirmation
  - `seed:payment-confirmed` — a completed registration batch
- **`@faker-js/faker`** for realistic names, emails, dates. Deterministic seeds (`faker.seed(42)`) give reproducible data.

---

## 3. Environment Resets

```bash
supabase db reset
```

Drops the local DB, re-runs all migrations in order, then runs `seed.sql`. Should take under 10 seconds locally.

The pattern that works well: **one `seed.sql` that calls a SQL function**, and that function calls scenario-specific procedures. Keeps `seed.sql` clean and lets you add scenarios without touching the entrypoint.

For staging, a standalone Node seed script that runs against a clean Supabase project works well. Never seed production — maintain a separate `staging` Supabase project that you can reset freely.

---

## 4. Visualizing Data Flows

**Mermaid diagrams checked into the repo.** Write sequence diagrams for each major flow (admin-creates-semester, user-registers, payment-webhook-confirms). They live in `/docs` or as comments in the relevant action file. They're text, so they diff. The key discipline: update them when the flow changes.

**State machines for multi-step flows.** Your registration flow (`email → participants → form → payment → success`) and semester lifecycle (`draft → scheduled → published → archived`) are explicit state machines. Document the valid transitions and what triggers each.

**TypeScript as the diagram.** Your `RegistrationAction` union type and `SemesterAction` in `types/index.ts` are already a machine-readable record of what transitions exist. When you add a new state or transition, the type system tells you what else needs updating.

**Supabase's schema visualizer** (in the dashboard) is useful for DB-level relationships.

---

## 5. Automated Testing Levels

**Level 1 — Unit tests for pure functions (start here, highest ROI).**
Test: `computePricingQuote`, `buildPaymentSchedule`, `detectTimeConflicts`, session generation algorithm in `syncSemesterSessions`. These are pure-ish functions with complex logic where bugs are expensive. **Vitest** works well, zero setup friction with Next.js.

**Level 2 — Integration tests for server actions.**
Run against a local Supabase instance. Test that `createRegistrations` correctly creates the batch, installments, and registrations given a specific cart state. Vitest + Supabase JS client pointing at `localhost:54321`.

**Level 3 — E2E tests for critical user-facing flows (defer until stable).**
**Playwright** for: full registration flow start-to-finish, payment webhook path, semester publish. Expensive to maintain while UI is in flux — wait until flows stabilize.

**Typical ratio:** ~60% unit, ~30% integration, ~10% E2E.

---

## 6. Not Holding the Entire App in Your Head

**Explicit domain boundaries with co-located files.** The `app/admin/semesters/actions/` pattern is already good — actions for a domain live next to the UI that uses them. Never let a user-facing action import from admin actions.

**Server actions as the seam.** Because server actions are the only way the client touches the DB, they're a natural contract boundary. Document the expected input/output of each action at the top of the file. When something breaks, check the action's contract first.

**Architecture Decision Records (ADRs).** One markdown file per significant decision — e.g. "Why we use `schedule_enrollments` instead of `registrations` for full_schedule mode", "Why pricing is computed server-side and validated against client quote." Store in `/docs/decisions/`. These are decisions impossible to reconstruct from code alone six months later.

**Make illegal states unrepresentable.** Union types for `pricingModel`, `SemesterStatus`, etc. already do this. Exhaustive `switch` statements with `default: satisfies never` catch every callsite that needs updating at compile time rather than runtime.

**Narrow the blast radius of changes.** Before touching a shared utility like `computePricingQuote`, grep for all callers first. The TypeScript compiler is your second safety net.

---

## Recommended First Steps (when ready)

1. Add `supabase/seed.sql` with 2–3 scenarios covering the most common dev state (published semester + realistic sessions, pending batch, confirmed payment)
2. Write Vitest unit tests for `computePricingQuote` and the session generation algorithm in `syncSemesterSessions` — highest complexity, highest risk
3. Add a sequence diagram in `/docs` for the payment flow (cart → batch → EPG → webhook → finalize) since that's the hardest flow to reconstruct mentally
