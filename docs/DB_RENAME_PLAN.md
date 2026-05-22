# Database Table Rename Plan

> Investigation + phased plan for aligning table names with what they actually represent.
> Authored: 2026-05-22. Status: **proposal — do not execute before the July 1 launch.**
> Renaming tables crosses every scope zone (queries, types, server actions, edge functions, RLS, triggers). Treat as a post-launch refactor. The one exception is the `batch_id` column collapse (§3), which is a correctness fix and should land regardless.

---

## 1. Why

The schema grew in layers and accumulated three overlapping naming dialects. The worst confusion is in the class hierarchy and the two enrollment tables:

- **`class_sessions`** is one row per *calendar day* (a single dated meeting generated from a schedule), but "session" collides with auth sessions, with "semester," and spawned a satellite family (`session_groups`, `session_tags`, …) that all mean "group/tag of meetings."
- **`registrations`** vs **`schedule_enrollments`** are siblings (two grains of "a dancer signed up for X") but their names share nothing, hiding the relationship. "Registration" is also triple-booked across the row, the batch, and the line item.
- **`registration_batches`** is really an order/checkout; "batch" describes the insert mechanism, not the concept.

### The two registration modes (the core distinction)

Defined in `supabase/migrations/20260304030000_hybrid_pricing_model.sql`:

| Mode | Dancer commits to | Row created | FK points at | Grain |
|---|---|---|---|---|
| `full_schedule` (A) | the entire recurring schedule for the term | `schedule_enrollments` | `class_schedules` (config block) | **schedule-level** |
| `per_session` (B) | one individual dated class | `registrations` | `class_sessions` (one date) | **meeting-level** |

After renaming `class_sessions → class_meetings`, the enrollment pair becomes self-documenting — distinguished by **grain**:

```
schedule_enrollments → attaches to a class_schedule (whole term)
meeting_enrollments  → attaches to a class_meeting  (one date)
```

---

## 2. Rename map (Tier 1)

Fan-out counts measured 2026-05-22. Types in this repo are **hand-written** (`types/index.ts`, `types/public.ts`), not generated — no `Database` type auto-cascades, but every type rename is manual (~63 `Session/Batch/Enrollment/Registration` mentions in `types/index.ts`).

| Old | Proposed | Code files | `.from()` | Incoming FKs | Triggers/fns | RLS |
|---|---|---|---|---|---|---|
| `class_sessions` | **`class_meetings`** | 61 | 48 | 16 | 19 | 5 |
| `registrations` | **`meeting_enrollments`** ⚠️ open | 60 | 45 | 1 | 20 | 5 |
| `registration_batches` | **`registration_orders`** | 29 | 21 | 10 | 11 | 4 |
| `class_schedules` | **keep** ✓ | 23 | 15 | 5 | 4 | 3 |
| `schedule_enrollments` | **keep** ✓ | 22 | 29 | 1 | 8 | 1 |

Decision: keep `class_schedules` and `schedule_enrollments` (already the clearest names) and bend the others toward them.

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

`registration_batches → registration_orders` drags:

| Old | New | Code files |
|---|---|---|
| `batch_payment_installments` | `order_payment_installments` | 18 |
| `registration_line_items` | `order_line_items` | 1 |

### ⚠️ Open decision — meeting-level enrollment name

- **`meeting_enrollments`** — visual symmetry with `schedule_enrollments`; distinguished by grain. *(recommended)*
- **`meeting_bookings`** — reads naturally for drop-ins ("book a class"); distinguished by verb (book vs enroll).
- **keep `registrations`** — lowest risk; do only the column fixes in §3. The sibling asymmetry remains.

---

## 3. Column renames (do the first item NOW)

| Table.column | Issue | Action |
|---|---|---|
| `registrations.batch_id` **+** `registration_batch_id` | **two columns, same target** (`registration_batches`); split 48 vs 37 uses | **collapse to one `order_id` — correctness fix, do before any table rename** |
| `registrations.session_id` | FK → `class_meetings` | rename `meeting_id` |
| incoming `class_session_id` (3) vs `session_id` (4) | two column names, one parent FK | standardize on `meeting_id` |
| `*.batch_id` / `source_batch_id` / `used_in_batch_id` (10 FKs) | reference orders | standardize on `*order_id` |
| `registrations.stripe_amount_cents`, `payment_intent_id` | Stripe vocab on an EPG backend | rename `amount_cents`; drop/rename intent |

---

## 4. Tier 2 — defer or skip

- `shoppers → payment_profiles` — clearer, but it's EPG's own term, only 6 files. **Skip for launch.**
- `divisions` row `id='adult'` / `label='Drop-In'` — data fix (rename the id), separate small migration. Not a table rename.
- `schedule_price_tiers` / `class_tiers` / `tuition_rate_bands` — three "tier" concepts. Needs a design pass, not a rename. **Out of scope.**

---

## 5. Migration strategy — expand/contract per table

`ALTER TABLE ... RENAME` is transactional and cheap but breaks every caller atomically. Use a view shim so callers migrate incrementally:

1. **Migration A** (append-only): `ALTER TABLE class_sessions RENAME TO class_meetings;` then `CREATE VIEW class_sessions AS SELECT * FROM class_meetings;` — old `.from("class_sessions")` keeps working.
2. **Code sweep:** migrate `.from()` sites + files + `types/*` to the new names. Tests stay green against the view.
3. **Migration B:** `DROP VIEW class_sessions;` once no callers remain.

Notes:
- Triggers, functions, and RLS policies follow `RENAME` automatically (they bind to the table OID, not the name) — but their **own names don't change** (`trg_check_session_capacity` still says "session"). Recreate them in Migration B as cosmetic cleanup.
- Migrations are append-only — never edit an existing file under `supabase/migrations/`.

---

## 6. Recommended sequencing

1. **Now:** collapse `batch_id` / `registration_batch_id` (§3, item 1). Correctness, not cosmetics.
2. **Post-launch, batch 1:** `registration_batches → registration_orders` (+ 2 satellites). Smallest fan-out; proves the view pattern.
3. **Post-launch, batch 2:** `registrations → meeting_enrollments` + `session_id → meeting_id`.
4. **Post-launch, batch 3:** `class_sessions → class_meetings` + 9 satellites (largest blast radius; do last).

**Total Tier 1 blast radius:** ~110 unique code files, ~150 `.from()` rewrites, ~63 type-name edits, 5 migrations, ~10 view shims. ~2–3 day focused refactor. Keep behind the July 1 launch.
