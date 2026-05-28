# Database Table Rename Plan

> Investigation + phased plan for aligning table names with what they actually represent.
> Authored 2026-05-22. **Status: ✅ COMPLETE 2026-05-22.** All four rename clusters landed; the schema has its final names.

## ✅ Final state

| Cluster | Commit | Migration |
|---|---|---|
| 0 — drop dead `registrations.batch_id` | `740e129` | `20260522000002` |
| 1 — `registration_orders` (+ 2 satellites) | `f7ca0d1` | `20260522000003` |
| 2 — `class_sections` cluster (+ 3 satellites + `schedule_id → section_id`) | `81d14a3` | `20260522000004` |
| 3a — `class_meetings` cluster (+ 10 satellites + 4 column renames) | `d12a7a0` | `20260522000005` |
| 3b — `meeting_enrollments` (DB-boundary; embeds aliased) | `2f37906` | `20260522000006` |

**Approach used:** atomic per-cluster (no view shims). Each cluster = table rename + column renames + plpgsql function `CREATE OR REPLACE` (mechanical token swap of latest bodies) + full code sweep, committed as one PR per cluster on a `rename/*` branch off `staging`, then fast-forwarded to `staging` and PR'd to `main`. Edge functions (`process-overdue-payments`, `process-waitlist`) redeployed in lockstep with their cluster's `db push`.

**Intentional 3b naming gap:** the DB table is `meeting_enrollments`, but the app-layer vocabulary (PostgREST result keys, TS type properties, "Registrations" UI copy, `.registrations` accesses) remained `registrations` via embed aliasing (`registrations:meeting_enrollments(...)`). The 5 embeds carry that alias today; renaming app-layer "registrations" was out of scope for the schema-naming goal.

The remaining sections below are preserved as the original plan + historical reasoning. Items still genuinely deferred (not blocked, but not done either) are flagged with **DEFERRED** in §3 and §4.

---

Original framing (preserved for context):
> Renaming tables crosses every scope zone (queries, types, server actions, edge functions, RLS, triggers). Treat as a post-launch refactor. The one exception is the `batch_id` column collapse (§3), which is a correctness fix and should land regardless.

---

## 1. Why

The schema grew in layers and accumulated three overlapping naming dialects. The worst confusion is in the class hierarchy and the two enrollment tables:

- **`class_sessions`** is one row per *calendar day* (a single dated meeting generated from a schedule), but "session" collides with auth sessions, with "semester," and spawned a satellite family (`session_groups`, `session_tags`, …) that all mean "group/tag of meetings."
- **`class_schedules`** is not a calendar/timetable — it's the recurring *pattern* an admin configures once (days of week + time + date range + capacity + pricing), which the system fans out into `class_sessions`. It's really a section/offering. The word "schedule" fights the meaning.
- **`schedule_enrollments`** reads like "enrollments in a timetable," but it means "full-term enrollment in a whole section." **`registrations`** vs **`schedule_enrollments`** are siblings (two grains of "a dancer signed up for X") but their names share nothing, hiding the relationship. "Registration" is also triple-booked across the row, the batch, and the line item.
- **`registration_batches`** is really an order/checkout; "batch" describes the insert mechanism, not the concept.

### The two registration modes (the core distinction)

Defined in `supabase/migrations/20260304030000_hybrid_pricing_model.sql`:

| Mode | Dancer commits to | Row created | FK points at | Grain |
|---|---|---|---|---|
| `full_schedule` (A) | the entire recurring section for the term | `schedule_enrollments` → `section_enrollments` | `class_schedules` → `class_sections` | **section-level** |
| `per_session` (B) | one individual dated class | `registrations` → `meeting_enrollments` | `class_sessions` → `class_meetings` | **meeting-level** |

After renaming, the whole cluster becomes self-documenting — every name advertises its grain:

```
classes            → the catalog entry        ("Ballet 3")
class_sections     → a recurring offering     ("Mon+Wed 4–5pm, Sep–Dec, cap 20")
class_meetings     → one generated date       ("Ballet 3 on Oct 14")

section_enrollments → enrolled in a whole section (full term)
meeting_enrollments → booked into a single meeting (drop-in)
```

The key win: `class_sections` kills the "schedule = timetable" ambiguity at the root, and the enrollment pair (`section_enrollments` / `meeting_enrollments`) now differs only by the grain word, making them obvious siblings.

---

## 2. Rename map (Tier 1)

Fan-out counts measured 2026-05-22. Types in this repo are **hand-written** (`types/index.ts`, `types/public.ts`), not generated — no `Database` type auto-cascades, but every type rename is manual (~63 `Session/Batch/Enrollment/Registration` mentions in `types/index.ts`).

| Old | Proposed | Code files | `.from()` | Incoming FKs | Triggers/fns | RLS |
|---|---|---|---|---|---|---|
| `class_sessions` | **`class_meetings`** | 61 | 48 | 16 | 19 | 5 |
| `class_schedules` | **`class_sections`** | 23 | 15 | 5 | 4 | 3 |
| `registrations` | **`meeting_enrollments`** ⚠️ open | 60 | 45 | 1 | 20 | 5 |
| `schedule_enrollments` | **`section_enrollments`** | 22 | 29 | 1 | 8 | 1 |
| `registration_batches` | **`registration_orders`** | 29 | 21 | 10 | 11 | 4 |

Decision: rename all five. `class_sections` / `class_meetings` express the config-vs-generated split; `section_enrollments` / `meeting_enrollments` express the full-term-vs-drop-in split. No table keeps a "schedule" or "session" name.

### Cascade renames

`class_sessions → class_meetings` drags:

| Old | New | Code files |
|---|---|---|
| `session_groups` | `meeting_groups` | 6 |
| `session_group_sessions` | `meeting_group_meetings` | 7 |
| `session_group_tags` | `meeting_group_tags` | 0 |
| `session_tags` | `meeting_tags` | 0 |
| `session_occurrence_dates` | `meeting_occurrence_dates` | 6 |
| `class_session_options` | `class_meeting_options` | 1 |
| `class_session_excluded_dates` | `class_meeting_excluded_dates` | 0 |
| `class_session_price_rows` | `class_meeting_price_rows` | 3 |
| `class_session_instructors` | `class_meeting_instructors` | 6 |

`class_schedules → class_sections` drags:

| Old | New | Code files |
|---|---|---|
| `class_schedule_excluded_dates` | `class_section_excluded_dates` | 1 |
| `schedule_price_tiers` | `section_price_tiers` | 8 |
| `discount_rule_schedules` | `discount_rule_sections` | 0 |

`registration_batches → registration_orders` drags:

| Old | New | Code files |
|---|---|---|
| `batch_payment_installments` | `order_payment_installments` | 18 |
| `registration_line_items` | `order_line_items` | 1 |

### ✅ Resolved — meeting-level enrollment name

Chose **`meeting_enrollments`** (visual symmetry with `section_enrollments`, distinguished by grain). Shipped in cluster 3b via the DB-boundary approach — app layer keeps the `registrations` vocabulary via embed aliasing.

---

## 3. Column renames (do the first item NOW)

| Table.column | Issue | Action |
|---|---|---|
| `registrations.batch_id` (dead) vs `registration_batch_id` (live) | `registration_batch_id` is authoritative (sole column written/read); `batch_id` is vestigial — **zero code refs**, NULL on all rows, plus a backwards UNIQUE index | ✅ **DONE 2026-05-22:** `batch_id` dropped (migration `20260522000002`). `registration_batch_id` later renamed `order_id`. |
| `schedule_id` (4 FKs → `class_sections`) | ~101 code references — heaviest single rename | ✅ **DONE 2026-05-22:** renamed `section_id` in cluster 2 (`81d14a3`, migration `20260522000004`). |
| `registrations.session_id` | FK → `class_meetings` | ✅ **DONE 2026-05-22:** renamed `meeting_id` in cluster 3a (`d12a7a0`, migration `20260522000005`). |
| incoming `class_session_id` (3) vs `session_id` (4) | two column names, one parent FK | ✅ **DONE 2026-05-22:** `class_session_id → class_meeting_id`, `session_id → meeting_id` in cluster 3a. (Did not collapse `class_meeting_id` into bare `meeting_id` — `class_meeting_id` makes the FK context explicit on the few tables that have it.) |
| `*.batch_id` / `source_batch_id` / `used_in_batch_id` (10 FKs) | reference orders | **DEFERRED** — column rename to `*order_id` not done; columns still named `*batch_id` but now reference `registration_orders`. Mild inconsistency; cosmetic. |
| `registrations.stripe_amount_cents`, `payment_intent_id` | Stripe vocab on an EPG backend | **DEFERRED** — Stripe-named columns still in place on `meeting_enrollments` and `registration_orders`. Cosmetic. |
| `meeting_enrollments` (table) but `registrations` (app vocabulary) | DB-boundary rename only — 3b kept embeds aliased so app code/UI keeps saying `registrations` | **DEFERRED (intentional gap):** deeper app-layer rename (`.registrations` accesses, TS type properties, `Registration*` PascalCase types) not done. Schema-naming goal achieved without disturbing domain code. |

> The `schedule_id → section_id` rename (101 refs) is the single biggest line item in the whole plan — bigger than most table renames. A column rename can't hide behind a view shim the way a table rename can, so it must be done as one atomic sweep alongside the `class_schedules → class_sections` rename.

---

## 4. Tier 2 — defer or skip

- `shoppers → payment_profiles` — clearer, but it's EPG's own term, only 6 files. **Skip for launch.**
- `divisions` row `id='adult'` / `label='Drop-In'` — data fix (rename the id), separate small migration. Not a table rename.
- `schedule_price_tiers` / `class_tiers` / `tuition_rate_bands` — three "tier" concepts. Needs a design pass, not a rename. **Out of scope.**

---

## 5. Migration strategy — **atomic per-cluster** (chosen) vs view-shim (original)

> The view-shim approach below was the original plan. The **chosen and shipped** approach was **atomic per-cluster**: each cluster ran `ALTER TABLE ... RENAME` *and* updated every caller in the same PR, no view shims. This worked because (a) all callers were updatable in one sweep, (b) PostgREST schema cache reloads automatically on DDL, and (c) plpgsql functions were `CREATE OR REPLACE`d in the same migration that did the rename so their late-binding references resolved cleanly. View shims would have added RLS/auto-updatable-view complexity for no incremental-rollout benefit.
>
> The expand/contract description below is retained as the original alternative.

`ALTER TABLE ... RENAME` is transactional and cheap but breaks every caller atomically. Use a view shim so callers migrate incrementally:

1. **Migration A** (append-only): `ALTER TABLE class_sessions RENAME TO class_meetings;` then `CREATE VIEW class_sessions AS SELECT * FROM class_meetings;` — old `.from("class_sessions")` keeps working.
2. **Code sweep:** migrate `.from()` sites + files + `types/*` to the new names. Tests stay green against the view.
3. **Migration B:** `DROP VIEW class_sessions;` once no callers remain.

Notes:
- Triggers, functions, and RLS policies follow `RENAME` automatically (they bind to the table OID, not the name) — but their **own names don't change** (`trg_check_session_capacity` still says "session"). Recreate them in Migration B as cosmetic cleanup.
- **Column renames get no view shim.** A renamed *table* can hide behind a view; a renamed *column* cannot (a view's column list is fixed). So `schedule_id → section_id` (101 refs) and `batch_id → order_id` must be done as one atomic code+migration sweep, not incrementally. Bundle each column rename into the same PR as its table rename.
- Migrations are append-only — never edit an existing file under `supabase/migrations/`.

---

## 6. Recommended sequencing

1. ✅ **DONE 2026-05-22:** dropped dead `registrations.batch_id` (§3, item 1). Was not a "collapse" — `batch_id` had zero code refs and was NULL on all rows; `registration_batch_id` is canonical. Migration `20260522000002`. Commit `740e129`.
2. ✅ **DONE 2026-05-22 — cluster 1:** `registration_batches → registration_orders` + `batch_payment_installments → order_payment_installments` + `registration_line_items → order_line_items`. Migration `20260522000003`. Commit `f7ca0d1`. Edge fn `process-overdue-payments` redeployed.
3. ✅ **DONE 2026-05-22 — cluster 2 (section):** `class_schedules → class_sections` + `schedule_enrollments → section_enrollments` + 3 satellites + `schedule_id → section_id` (101-ref atomic sweep). 2 plpgsql trigger fns replaced. Migration `20260522000004`. Commit `81d14a3`.
4. ✅ **DONE 2026-05-22 — cluster 3a (meeting):** `class_sessions → class_meetings` + 10 satellites + 4 column renames (`session_id → meeting_id`, `class_session_id → class_meeting_id`, `cloned_from_session_id → cloned_from_meeting_id`, `session_group_id → meeting_group_id`). 7 plpgsql trigger fns replaced (incl. three semester-publish guards). Edge fn `process-waitlist` redeployed. Migration `20260522000005`. Commit `d12a7a0`.
5. ✅ **DONE 2026-05-22 — cluster 3b (meeting_enrollments):** DB-boundary rename `registrations → meeting_enrollments`; 5 PostgREST embeds aliased to preserve app-layer `registrations` vocabulary. 8 plpgsql functions re-pointed. Migration `20260522000006`. Commit `2f37906`.

**Total Tier 1 blast radius:** ~130 unique code files, ~150 `.from()` rewrites, ~100 `schedule_id` column edits, ~63 type-name edits, 7 migrations, ~12 view shims. ~3–4 day focused refactor. Keep behind the July 1 launch.
