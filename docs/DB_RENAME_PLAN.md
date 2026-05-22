# Database Table Rename Plan

> Investigation + phased plan for aligning table names with what they actually represent.
> Authored: 2026-05-22. Status: **proposal — do not execute before the July 1 launch.**
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

### ⚠️ Open decision — meeting-level enrollment name

- **`meeting_enrollments`** — visual symmetry with `section_enrollments`; distinguished by grain. *(recommended)*
- **`meeting_bookings`** — reads naturally for drop-ins ("book a class"); distinguished by verb (book vs enroll).
- **keep `registrations`** — lowest risk; do only the column fixes in §3. The sibling asymmetry remains.

---

## 3. Column renames (do the first item NOW)

| Table.column | Issue | Action |
|---|---|---|
| `registrations.batch_id` (dead) vs `registration_batch_id` (live) | `registration_batch_id` is authoritative (sole column written/read); `batch_id` is vestigial — **zero code refs**, NULL on all rows, plus a backwards UNIQUE index | ✅ **DONE 2026-05-22:** `batch_id` dropped (migration `20260522000002`). `registration_batch_id` later renamed `order_id`. |
| `schedule_id` (4 FKs → `class_sections`) | **~101 code references** — heaviest single rename | rename `section_id` |
| `registrations.session_id` | FK → `class_meetings` | rename `meeting_id` |
| incoming `class_session_id` (3) vs `session_id` (4) | two column names, one parent FK | standardize on `meeting_id` |
| `*.batch_id` / `source_batch_id` / `used_in_batch_id` (10 FKs) | reference orders | standardize on `*order_id` |
| `registrations.stripe_amount_cents`, `payment_intent_id` | Stripe vocab on an EPG backend | rename `amount_cents`; drop/rename intent |

> The `schedule_id → section_id` rename (101 refs) is the single biggest line item in the whole plan — bigger than most table renames. A column rename can't hide behind a view shim the way a table rename can, so it must be done as one atomic sweep alongside the `class_schedules → class_sections` rename.

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
- **Column renames get no view shim.** A renamed *table* can hide behind a view; a renamed *column* cannot (a view's column list is fixed). So `schedule_id → section_id` (101 refs) and `batch_id → order_id` must be done as one atomic code+migration sweep, not incrementally. Bundle each column rename into the same PR as its table rename.
- Migrations are append-only — never edit an existing file under `supabase/migrations/`.

---

## 6. Recommended sequencing

1. ✅ **DONE 2026-05-22:** dropped dead `registrations.batch_id` (§3, item 1). Was not a "collapse" — `batch_id` had zero code refs and was NULL on all rows; `registration_batch_id` is canonical. Migration `20260522000002`.
2. **Post-launch, batch 1:** `registration_batches → registration_orders` (+ 2 satellites). Smallest fan-out; proves the view pattern.
3. **Post-launch, batch 2 — section cluster:** `class_schedules → class_sections` + `schedule_enrollments → section_enrollments` + 3 satellites + the `schedule_id → section_id` column sweep (101 refs, atomic — no view shim).
4. **Post-launch, batch 3 — meeting cluster:** `class_sessions → class_meetings` + 9 satellites + `registrations → meeting_enrollments` + `session_id → meeting_id`. Largest blast radius; do last when the pattern is proven.

**Total Tier 1 blast radius:** ~130 unique code files, ~150 `.from()` rewrites, ~100 `schedule_id` column edits, ~63 type-name edits, 7 migrations, ~12 view shims. ~3–4 day focused refactor. Keep behind the July 1 launch.
