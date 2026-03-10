# AYDT — Dance Class Catalog & Registration Requirements
### Version: 1.0 | Date: March 9, 2026
### Status: Reference Document — All Disciplines

---

## Overview

This document is the authoritative catalog of every AYDT dance class offered through the registration portal. For each class it records:

- The **exact class name** to use in seed data and admin setup (no asterisks)
- **Eligibility metadata**: division, discipline, grade range, age range
- **Registration requirements**: enforced conditions, warnings, and faculty approval rules
- **Registration notes**: informational text shown to families during enrollment

This document is maintained alongside the codebase and should be updated whenever class offerings change.

---

## Legend

### Division
| Value | Meaning |
|---|---|
| `early_childhood` | Ages ~18 months to Pre-K |
| `junior` | Grades Pre-K4 through ~3rd grade |
| `senior` | Grades 4+ (older students) |

### Grade Integer Encoding
| Grade | Integer |
|---|---|
| Nursery / ~18–36 months | -3 |
| Pre-K3 | -2 |
| Pre-K4 | -1 |
| Kindergarten | 0 |
| 1st grade | 1 |
| 2nd–12th | 2–12 |

### Requirement Enforcement
| Code | Meaning |
|---|---|
| **HB** | `hard_block` — prevents enrollment; admin waiver required to bypass |
| **SW** | `soft_warn` — shows warning but allows enrollment to proceed |
| **W** | `is_waivable: true` — admin can grant a waiver for a specific dancer |

### System Gaps (Pending Implementation)
Features referenced below that are **not yet implemented** in the system:

| Gap | Description |
|---|---|
| **Gap #1** | Age in months — `min_age_months`/`max_age_months` fields not yet on `classes` table |
| **Gap #2** | OR-logic concurrent enrollment — `concurrent_enrollment_groups` table not yet created |
| **Gap #3** | `parent_accompaniment` requirement type not yet in `class_requirements` CHECK constraint |
| **Gap #5** | `registration_note` field not yet on `classes` table |
| **Gap #8** | Gender-specific class restriction not yet modeled |

Items marked `[PENDING]` depend on one or more of these gaps being resolved.

---

## BALLET

**Program Description:** Classical ballet technique training. Levels range from early childhood through advanced intermediate. Higher levels include graded tracks (by placement) and open tracks (recreational).

### Early Childhood

| Class Name | Division | Discipline | Grade | Age | Requirements | Registration Note |
|---|---|---|---|---|---|---|
| **First Steps** | early_childhood | ballet | — | 18–26 mo [PENDING Gap #1] | `parent_accompaniment` HB [PENDING Gap #3] | "Class is divided into two 9-week sessions. Twins must be accompanied by two separate adults." [PENDING Gap #5] |
| **Dance with Me** | early_childhood | ballet | — | 27–36 mo [PENDING Gap #1] | `parent_accompaniment` HB [PENDING Gap #3] | "Class is divided into two 9-week sessions. Twins must be accompanied by two separate adults." [PENDING Gap #5] |

### Pre-Ballet

| Class Name | Division | Discipline | Grade | Age | Requirements | Registration Note |
|---|---|---|---|---|---|---|
| **Pre-Ballet 1** | junior | ballet | Pre-K3 (-2) | min 3 | none | "Dancer must be at least 3 years old by September 1st." [PENDING Gap #5] |
| **Pre-Ballet 2** | junior | ballet | Pre-K4 (-1) | 4 | none | — |
| **Pre-Ballet 3** | junior | ballet | K (0) | — | none | — |

### Junior Ballet

| Class Name | Division | Discipline | Grade | Requirements | Registration Note |
|---|---|---|---|---|---|
| **Ballet 1A** | junior | ballet | 1–2 | none | "See calendar for dates of mandatory Saturday holiday recital rehearsals." [PENDING Gap #5] |
| **Ballet 1B** | junior | ballet | 2–3 | none | Same rehearsal note [PENDING Gap #5] |
| **Ballet 2** | junior | ballet | 3–4 | none | Same rehearsal note [PENDING Gap #5] |

### Open Level Ballet

| Class Name | Division | Discipline | Grade | Requirements | Registration Note |
|---|---|---|---|---|---|
| **Open Ballet 3** | senior | ballet | 4+ | `skill_qualification` SW/W — no prior experience required | "See calendar for mandatory Saturday rehearsals. This is a 2–3 year program." [PENDING Gap #5] |
| **Open Ballet 4** | senior | ballet | 6+ | `prerequisite_completed` SW/W (ballet / Open 3) | Same rehearsal note. 2–3 year program. Older beginners welcome. [PENDING Gap #5] |
| **Open Ballet 5** | senior | ballet | 8–12 | `prerequisite_completed` SW/W (ballet / Open 4) + `teacher_recommendation` HB/W | Same rehearsal note. Placement by rec or audition. [PENDING Gap #5] |
| **Open Intermediate Ballet** | senior | ballet | 8–12 | `prerequisite_completed` SW/W (ballet / Open 5) + `teacher_recommendation` HB/W + OR-concurrent HB/W: Open Ballet 5 OR Technique 1 [PENDING Gap #2] | Same rehearsal note. [PENDING Gap #5] |

### Graded Ballet

| Class Name | Division | Discipline | Grade | Requirements | Registration Note |
|---|---|---|---|---|---|
| **Graded Ballet 3** | senior | ballet | 4–7 | `teacher_recommendation` HB/W | "See calendar for mandatory Saturday rehearsals. Graded Ballet meets twice per week." [PENDING Gap #5] |
| **Graded Ballet 4** | senior | ballet | 5–8 | `teacher_recommendation` HB/W | Same + twice per week. [PENDING Gap #5] |
| **Graded Ballet 5** | senior | ballet | 6+ | `teacher_recommendation` HB/W + OR-concurrent HB/W: Graded 4 OR Open 4–5 OR Technique 1 [PENDING Gap #2] | Same + three times per week. Third class must be Ballet 4, Open Ballet 4–5, or Technique 1. [PENDING Gap #5] |
| **Intermediate Ballet A** | senior | ballet | 7–12 | `teacher_recommendation` HB/W + OR-concurrent HB/W: Technique 1 OR 2 OR 3 [PENDING Gap #2] | Same + three times per week. Third class must be Technique 1, 2, or 3. [PENDING Gap #5] |
| **Intermediate Ballet B** | senior | ballet | 7–12 | `teacher_recommendation` HB/W + OR-concurrent HB/W: Technique 1 OR 2 OR 3 [PENDING Gap #2] | Same. [PENDING Gap #5] |
| **Advanced Intermediate Ballet** | senior | ballet | 10–12 | `teacher_recommendation` HB/W + OR-concurrent HB: Broadway OR Contemporary (1 class) [PENDING Gap #2] + minimum 3 total ballet classes [PENDING Gap #2] | Same rehearsal note. Requires 3 ballet classes and 1 Broadway or Contemporary class. [PENDING Gap #5] |

### Technique

| Class Name | Division | Discipline | Grade | Requirements | Registration Note |
|---|---|---|---|---|---|
| **Technique 1** | senior | technique | — | `teacher_recommendation` HB/W | "Technique classes do not include a recital dance. Placement by teacher recommendation or audition." [PENDING Gap #5] |
| **Technique 2** | senior | technique | — | `teacher_recommendation` HB/W | Same. [PENDING Gap #5] |
| **Technique 3** | senior | technique | — | `teacher_recommendation` HB/W | Same. [PENDING Gap #5] |

### Pointe

| Class Name | Division | Discipline | Grade | Requirements | Registration Note |
|---|---|---|---|---|---|
| **Pre-Pointe — Beginner** | senior | pointe | — | `teacher_recommendation` HB/W | — |
| **Pre-Pointe — Beginner Intermediate** | senior | pointe | — | `teacher_recommendation` HB/W | — |
| **Pre-Pointe — Intermediate Advanced** | senior | pointe | — | `teacher_recommendation` HB/W | — |
| **Intermediate Advanced Pointe** | senior | pointe | — | `teacher_recommendation` HB/W + OR-concurrent SW: Open Ballet 5 OR Open Intermediate OR Intermediate A OR Intermediate B OR Advanced Intermediate [PENDING Gap #2] | "This class meets immediately following your associated ballet class session." [PENDING Gap #5] |

---

## CONTEMPORARY

**Program Description:** Modern Dance–based program inspired by the techniques of Martha Graham, Lester Horton, and José Limón. Contemporary Dance themes and movement are incorporated through recital choreography. Intended only as an **additional weekly class** to complement existing ballet training — not a standalone program.

| Class Name | Division | Discipline | Grade | Requirements | Registration Note |
|---|---|---|---|---|---|
| **Contemporary 1** | senior | contemporary | — | `prerequisite_completed` SW/W (discipline=ballet, level=Open 5) + `teacher_recommendation` HB/W + `concurrent_enrollment` SW (discipline=ballet) | "Placement by teacher recommendation or audition. This class is designed to complement your ballet training." |
| **Contemporary 2** | senior | contemporary | — | Same as Contemporary 1, at a higher skill level | Same note. |

**Notes:**
- Both levels are available only to dancers in Ballet 5 / Open Ballet 5 or above
- Neither level is a primary program — dancers must maintain a concurrent ballet class
- The `concurrent_enrollment` soft-warn is advisory; admin can waive it individually

---

## TAP

**Program Description:** Classical tap steps, rhythm, and technique. Includes warm-up, stretching, and building a vocabulary of steps and combinations. Tap students are *strongly encouraged* (soft recommendation, not a hard rule) to also take a weekly ballet or Broadway class to complement their training.

### Grade-Based Tap Levels

| Class Name | Division | Discipline | Grade | Age | Requirements | Registration Note |
|---|---|---|---|---|---|---|
| **Tap Intro** | junior | tap | Pre-K4–K (-1 to 0) | min 4 | none beyond age/grade | "Dancer must be at least 4 years old by September 1st." [PENDING Gap #5] |
| **Tap 1A** | junior | tap | 1–3 | — | none | — |
| **Tap 1B** | junior | tap | 3–6 | — | none | — |
| **Open Level Tap** | senior | tap | 5+ | — | none | — |
| **Tap 2** | senior | tap | 4–7 | — | `teacher_recommendation` HB/W | "Placement by teacher recommendation or audition." [PENDING Gap #5] |
| **Tap 3** | senior | tap | 4–8 | — | `teacher_recommendation` HB/W | Same. [PENDING Gap #5] |
| **Intermediate Tap** | senior | tap | 6+ | — | `teacher_recommendation` HB/W | Same. [PENDING Gap #5] |
| **Advanced Intermediate Tap** | senior | tap | 7–12 | — | `teacher_recommendation` HB/W + OR-concurrent HB/W: Ballet OR Broadway OR Hip Hop [PENDING Gap #2] | "Placement by teacher recommendation or audition. See calendar for mandatory Saturday holiday recital rehearsals." [PENDING Gap #5] |
| **Advanced Tap** | senior | tap | 9–12 | — | `teacher_recommendation` HB/W + OR-concurrent HB/W: Ballet OR Broadway OR Hip Hop [PENDING Gap #2] | Same rehearsal and placement note. [PENDING Gap #5] |

**Global soft recommendation (all Tap levels):** `skill_qualification` SW — "Tap students are strongly encouraged to also take a weekly ballet or Broadway class to complement their training."

---

## BROADWAY

**Program Description:** Broadway-style theater jazz. Class work includes a jazz warm-up, stretching, and step combinations. Broadway dancers are *strongly encouraged* (soft recommendation) to take ballet and tap to complement their training.

| Class Name | Division | Discipline | Grade | Requirements | Registration Note |
|---|---|---|---|---|---|
| **Broadway 1** | junior | broadway | 3–5 | none | "This is a 2–3 year program." [PENDING Gap #5] |
| **Open Broadway 1** | senior | broadway | 5+ | none | "This is a 2–3 year program. Open to beginners." [PENDING Gap #5] |
| **Open Broadway 2** | senior | broadway | 6+ | none | "Designed for students who prefer not to add a required ballet or tap class." [PENDING Gap #5] |
| **Open Broadway 3** | senior | broadway | 8–12 | `prerequisite_completed` SW/W (discipline=broadway, level=Open 2) | "Older beginners welcome; private lessons may be recommended by your teacher." [PENDING Gap #5] |
| **Broadway 2** | senior | broadway | 4–7 | `teacher_recommendation` HB/W | "This is a 2–3 year program. Placement by teacher recommendation or audition." [PENDING Gap #5] |
| **Broadway 3** | senior | broadway | 5–12 | `teacher_recommendation` HB/W + OR-concurrent HB/W: Ballet OR Tap [PENDING Gap #2] | "Placement by teacher recommendation or audition. Two classes per week required; second class must be ballet or tap." [PENDING Gap #5] |
| **Broadway 4** | senior | broadway | 7–12 | `teacher_recommendation` HB/W + `concurrent_enrollment` HB/W (discipline=ballet) | "Placement by teacher recommendation or audition. Additional class must be ballet." [PENDING Gap #5] |
| **Broadway 5** | senior | broadway | 8–12 | `teacher_recommendation` HB/W + complex OR-group HB: (2 ballet classes) OR (1 ballet + 1 tap) [PENDING Gap #2] | "Placement by teacher recommendation or audition. Three classes per week required." [PENDING Gap #5] |

**Global soft recommendation (all Broadway levels):** `skill_qualification` SW — "Broadway dancers are strongly encouraged to also take ballet and tap to complement their training."

**Broadway 5 note:** The "2 ballet OR 1 ballet + 1 tap" rule is the most complex concurrent enrollment rule in the entire catalog. It requires a multi-count OR-group that is not yet supported by the system (Gap #2 extension needed).

---

## HIP HOP

**Program Description:** High-energy dance to popular music. Emphasizes strength, cardio conditioning, warm-up, stretching, and movement combinations. All music and choreography are age-appropriate.

| Class Name | Division | Discipline | Grade | Age | Requirements | Registration Note |
|---|---|---|---|---|---|---|
| **Hip Hop Intro** | junior | hip_hop | Pre-K4–K (-1 to 0) | min 4 | none beyond age/grade | "Dancer must be at least 4 years old by September 1st." [PENDING Gap #5] |
| **Hip Hop 1** | junior | hip_hop | 1–2 | — | none | — |
| **Hip Hop 2** | junior | hip_hop | 3–4 | — | none | — |
| **Hip Hop 3** | junior | hip_hop | 5–7 | — | none | — |
| **Hip Hop 4** | senior | hip_hop | 7–9 | — | `teacher_recommendation` HB/W | "Placement by teacher recommendation or audition." [PENDING Gap #5] |
| **Open Hip Hop 5** | senior | hip_hop | 10–12 | — | `skill_qualification` SW/W — open, no prior training required | — |
| **Hip Hop 5** | senior | hip_hop | 10–12 | — | `teacher_recommendation` HB/W | "Placement by teacher recommendation or audition." [PENDING Gap #5] |
| **Intermediate Hip Hop** | senior | hip_hop | — | — | `teacher_recommendation` HB/W + `concurrent_enrollment` HB/W (any discipline) | "Placement by teacher recommendation or audition. Two classes per week required; second class may be in any discipline." [PENDING Gap #5] |
| **Boys Hip Hop Breakdance 1/2** | junior | hip_hop | — | 6–10 | none currently enforceable [PENDING Gap #8] | "This class is designed for boys ages 6–10 and is taught by a male instructor. Two levels are offered in this combined class." [PENDING Gap #5] |
| **Boys Hip Hop Breakdance 3/4** | senior | hip_hop | — | 11–teen | none currently enforceable [PENDING Gap #8] | "This class is designed for boys ages 11 through teens and is taught by a male instructor. Two levels are offered in this combined class." [PENDING Gap #5] |

---

## System Gaps — Summary

The following system capabilities are not yet implemented. All classes affected by these gaps have their relevant conditions marked `[PENDING]` in the tables above.

| Gap # | Severity | Description | Proposed Fix |
|---|---|---|---|
| **#1** | High | Age in months for early childhood classes (`min_age_months` / `max_age_months`) | Add two `integer` columns to `classes` table; update validation logic |
| **#2** | High | OR-logic concurrent enrollment (e.g., "Ballet OR Tap") | New `concurrent_enrollment_groups` + `concurrent_enrollment_options` tables; new validator path |
| **#3** | Medium | `parent_accompaniment` requirement type not in DB CHECK constraint | Add to `class_requirements.requirement_type` CHECK; add `requires_parent_accompaniment boolean` to `classes`; add checkout acknowledgment checkbox in UI |
| **#4** | Low | Pre-K grade labels (-1, -2, -3) have no display mapping | Add `gradeLabel()` utility; negative integers already work in DB |
| **#5** | Medium | No `registration_note` field on `classes` table | Add `registration_note text` column; surface in admin UI and user-facing enrollment page |
| **#6** | Low | Multi-year program duration notes | Handled by Gap #5 |
| **#7** | Low | Twin adult-ratio rule is not per-dancer-enforceable | Store in `registration_note`; operationally enforced at the studio |
| **#8** | Low–Medium | Gender-specific class restriction has no system model | Start with `registration_note` only; escalate to `gender_restriction text` column if required |

---

## Base Tuition Reference (2025–2026 Semester)

> **Note:** These are the published reference prices. The live pricing engine reads from `tuition_rate_bands` and `semester_fee_config` in the DB; always seed/configure those tables to match.

### AYDT Main Classes

| Class Type | Base Tuition | Registration Fee | Recital Video Fee | Recital Costume Fee | Semester Total | Auto-Pay / 5 mo |
|---|---|---|---|---|---|---|
| Junior 1/wk | $775.93 | $40.00 | — | $55.00 | $870.93 | $179.19 |
| Junior 2/wk | $1,513.06 | $40.00 | — | $110.00 | $1,663.06 | $337.61 |
| Junior 3/wk | $2,211.39 | $40.00 | — | $165.00 | $2,416.39 | $488.28 |
| Senior 1/wk | $796.43 | $40.00 | $15.00 | $65.00 | $916.43 | $188.29 |
| Senior 2/wk | $1,553.04 | $40.00 | $15.00 | $130.00 | $1,738.04 | $352.61 |
| Senior 3/wk | $2,269.83 | $40.00 | $15.00 | $195.00 | $2,519.83 | $508.97 |
| Senior 4/wk | $2,946.80 | $40.00 | $15.00 | $260.00 | $3,261.80 | $657.36 |
| Senior 5/wk | $3,583.94 | $40.00 | $15.00 | $325.00 | $3,963.94 | $797.79 |
| Senior 6/wk | $4,181.26 | $40.00 | $15.00 | $390.00 | $4,626.26 | $930.25 |
| First Steps / Dance with Me (9 classes) | $394.11 | $40.00 | — | — | $434.11 | N/A |

### Specialty Classes (No Registration Fee)

| Class Type | Base Tuition | Registration Fee | Semester Total | Auto-Pay / 5 mo |
|---|---|---|---|---|
| Technique 1, 2, or 3 | $716.78 | N/A | $716.78 | $143.36 |
| Pre-Pointe 2x/wk | $457.63 | N/A | $457.63 | $91.53 |
| Pointe 2x/wk | $517.49 | N/A | $517.49 | $103.50 |

> **Auto-Pay note:** Technique and Pointe classes do NOT add the extra $5/mo auto-pay admin fee.

> **Technique pricing note:** Technique 1/2/3 is priced as the cost of a 3rd weekly class without a registration fee.

### Competition Team

| Class Type | Base Tuition | Semester Total | Auto-Pay / 5 mo |
|---|---|---|---|
| Comp Team Junior | $842.61 | $842.61 | $168.52 |
| Comp Team Senior | $802.94 | $802.94 | $160.59 |

### Multi-Class Discount Structure

Discounts apply to the base tuition per additional class taken. The multi-class base tuitions in the table above already reflect these discounts.

**Senior (base 1/wk = $796.43):**

| Class # | Discount | Amount Off |
|---|---|---|
| 2nd class | 5% off | −$39.82 |
| 3rd class | 10% off | −$79.64 |
| 4th class | 15% off | −$119.46 |
| 5th class | 20% off | −$159.29 |
| 6th class | 25% off | −$199.11 |

**Junior (base 1/wk = $775.93):**

| Class # | Discount | Amount Off |
|---|---|---|
| 2nd class | 5% off | −$38.80 |
| 3rd class | 10% off | −$77.60 |

### Schema Gaps Affecting Pricing

| Gap | Status | Description |
|---|---|---|
| **Reg fee exemption** | ✅ Resolved | `special_program_tuition.registration_fee_override` (0 = exempt, NULL = use global). Engine derives exemption from `discipline` (technique/pointe) and `division` (competition). Migration: `20260310000001`. |
| **Recital video fee** | ✅ Resolved | `semester_fee_config.senior_video_fee_per_registrant` (default $15). Applied only to standard senior classes; exempt for technique, pointe, competition. Migration: `20260305000000`. |
| **Junior recital costume fee** | ✅ Resolved | `semester_fee_config.junior_costume_fee_per_class` (default $55). Applied only to standard junior classes. Migration: `20260310000001`. |
| **Senior recital costume fee** | ✅ Resolved | `semester_fee_config.senior_costume_fee_per_class` (default $65). Applied only to standard senior classes. Migration: `20260305000000`. |
| **Auto-pay fee exemption** | ⏳ Future | `auto_pay_admin_fee_monthly` is semester-wide. Technique/Pointe "no extra $5" rule requires additional clarification before implementation — needs definition of which program_keys are exempt and whether the exemption is a flat waiver or a reduced rate. |

---

## Enrollment Enforcement Summary

| Rule Type | How Enforced | Blocks Enrollment? | Faculty Involved? |
|---|---|---|---|
| Age range (years) | Automatic — `validateEnrollment` + client-side check | Yes (hard) | No |
| Age range (months) | Automatic — after Gap #1 fix | Yes (hard) | No |
| Grade range | Automatic — client-side eligibility check | Yes (hard) | No |
| Teacher recommendation / audition | Hard-block until admin grants a waiver | Yes (hard) | Yes — admin creates waiver after faculty confirms |
| Prerequisite experience | Soft warning — waivable | No (warns only) | Optional waiver |
| Concurrent enrollment — single discipline | Hard-block | Yes (hard) | Waivable if marked |
| Concurrent enrollment — OR group | Hard-block — after Gap #2 fix | Yes (hard) | Waivable if marked |
| Parent accompaniment | Soft-warn + checkout acknowledgment | No (warns only) | No |
| Mandatory rehearsal dates | Informational only | No | No |
| Multi-year program note | Informational only | No | No |
| Gender-specific class | Informational only (for now) | No | Studio-enforced in-person |
