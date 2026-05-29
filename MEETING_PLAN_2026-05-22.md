# Stakeholder Meeting — Action Plan (2026‑05‑22)

**Source:** AYDT Parent Portal Showcase, May 22 (47 min) — https://fathom.video/share/5ZDSyvZVCC-wWsuDPgKd9tQzFX4s33NR
**Attendees:** Ethan (dev), Miguel, AYDT NYC (Monique / Natalia)
**Hard build deadline:** July 1, 2026 (then ~1 month UAT; Active contract runs through end of July, go‑live target Aug 1). Miguel reaffirmed July 1 as the *build‑done* date.

This doc clusters the meeting into **9 independent work items**. Spin up one Claude window per item. Items are ordered by suggested launch priority, not by meeting chronology.

**Decisions captured (Ethan, 2026‑05‑22):**
- Keep all 9 items as separate windows.
- Waitlist ships as a **full feature** for July 1 (not MVP).
- Admin UI redesign is **deferred — revisit next week** (lowest priority; do not start now).
- Last‑spot race condition resolves via **first‑to‑payment reserves the seat**.

---

## Priority tiers

**Tier 1 — launch‑blocking (pricing + payments correctness):**
- #1 Division removal for drop‑in & tiered ✅ SHIPPED 2026-05-28
- #2 Pricing engine consolidation ✅ SHIPPED 2026-05-28
- #7 Manual registration: installments + super‑admin overrides ← ONLY TIER 1 REMAINING

**Tier 2 — launch features (committed for July 1):**
- #3 Registration form builder (address block + waivers)
- #4 Confirmation email static registration summary
- #5 Waitlist (full feature)
- #6 Concurrency & spot reservation

**Tier 3 — supporting / deferred:**
- #9 Registration preview mode (QA aid; nice to have for launch)
- #8 Admin UI redesign (DEFERRED — revisit next week)

---

## 1. Division removal for drop‑in & tiered classes

**Tier 1 · Bug + UX**

**What happened (transcript ~6:40, ~16:36, ~20:00):** Creating a drop‑in adult jazz class auto‑populated a **Junior** division. Divisions are a fall/spring‑standard concept tied to the tuition rate bands and should not exist for drop‑in or tiered classes. The stale division also appeared on the **tuition‑rates page**, where she could not remove it or mark it N/A.

**Required behavior:**
- Drop‑in and tiered classes have **no division field at all** (Ethan: "We removed the division and put all together").
- No auto‑population of any division for these modes — anywhere it currently leaks (class details *and* tuition‑rates page).
- Standard fall/spring classes keep divisions (junior/senior) as today.

**Acceptance criteria:**
- Create a drop‑in class → no division is set or displayed at any step.
- Create a tiered class → same.
- Tuition‑rates page shows no division control for drop‑in/tiered semesters; it cannot strand a "Junior" value.

**Zones / likely files:** Semester — create/edit (`app/admin/semesters/**`), Semester — shared steps. Verify `divisions`, `classes.is_tiered`, `class_schedules.is_drop_in` against `supabase/migrations/`.

**Related memory:** `project_registration_modes_phase2` (divisions.is_drop_in legacy fallback), `project_registration_modes_status`. **Architecturally linked to #2** but kept separate per decision.

**Open question:** Is the auto‑populated "Junior" coming from a default in the form state, a DB default/trigger, or the legacy `divisions.is_drop_in` fallback path? Diagnose source before patching the symptom.

---

## 2. Pricing engine consolidation ("one super engine") — ✅ SHIPPED 2026-05-28

**Tier 1 · Refactor — single source of truth · DONE**

**Landed in 3 commits on `staging`:**
- `0d6f142` refactor(pricing): consolidate engine across modes (#2a–#2g + bug fixes) — `computePricingQuote.ts` (+530), `tuitionEngine.ts` convergence, new `tests/unit/integration/pricingConvergence.test.ts` (+545), legacy `class_meeting_price_rows` sunset.
- `50df59e` feat(pricing): thread tier maps + feeConfig through engine callsites — all 6 callsites pass `classTierIdsBySchedule/BySession`; SessionsStep forwards admin `feeConfig`.
- `611ac4d` feat(cart): show live engine-computed tuition before checkout — CartDrawer + CartPageContent call the engine; standard-mode rows show `—` instead of stale `section_price_tiers`.

**What's covered:** #2a special programs ✓, #2b tiered ✓, #2c drop-in canonical ✓, #2d weekly_class_count + mode-scoping ✓, #2e tuitionEngine convergence ✓, #2g legacy sunset ✓. Plus exemption-flag honoring for competition track, drop-in/special-program override gate, default exempt keys including `pre_pointe + early_childhood`, deterministic max() for multi-special override.

**#2f catalog display drift — still deferred** (per 2026-05-28 decision). Standard class cards now render `—` in cart pre-checkout, so the worst drift is gone, but the catalog/ClassCard surface decision is still open for whoever next touches the public catalog.

---

(Sub-window breakdown below kept for historical reference; all but #2f are shipped.)

**Decomposition decision (2026-05-28):** After audit, this is 6+ PR-sized changes touching the highest-blast-radius file in the codebase ([`app/actions/computePricingQuote.ts`](app/actions/computePricingQuote.ts), Payments zone). Each sub-window closes one gap, ships with regression tests, and is independently verifiable against AYDT's sheet. **Open one Claude window per sub-item below.**

**Audit summary:** Two parallel engines today — [`computePricingQuote.ts`](app/actions/computePricingQuote.ts) (authoritative, feeds EPG, reads `base_tuition`) and [`utils/tuitionEngine.ts`](utils/tuitionEngine.ts) (admin draft preview only, reads `semester_total`). They can disagree silently. The authoritative engine has full coverage for **standard only**; tiered, drop-in, and special-program modes either fall through to rate bands or read legacy tables. See memory [`project_pricing_source_of_truth`](.claude/.../memory/project_pricing_source_of_truth.md) (the canonical interpretation memory).

**Open question — RESOLVED:** rate-band lookup is per-dancer, keyed by `(division, weekly_class_count)`. Count rule per memory: total meetings across standard enrollments, NOT distinct weekdays (current code is wrong).

---

### #2a — Special programs in `computePricingQuote` (START HERE)

**Smallest blast radius, highest mischarge impact:** Technique / Pre-Pointe / Pointe / EC / Comp JR / Comp SR currently fall through to rate bands (Comp lands on Junior). Add `special_program_tuition` lookup keyed by program key. Honor `registration_fee_override` (NULL=global, 0=exempt). Skip auto-pay $5/mo admin fee for `technique/pointe/competition` (memory bug #6).

**Files likely changed:** `app/actions/computePricingQuote.ts`, possibly `tests/unit/actions/computePricingQuote.test.ts`.

**Acceptance:** New tests for each program key prove charged total matches AYDT sheet ($434.11 / $716.78 / $457.63 / $517.49 / $842.61 / $802.94). Admin auto-pay fee exemption for Technique/Pointe/Comp verified.

---

### #2b — Tiered mode in `computePricingQuote`

Read `class_tiers.price_cents` (or cart `priceSnapshot` + `classTierId`) when a class is tiered. Stop falling through to rate bands.

**Files likely changed:** `app/actions/computePricingQuote.ts`, possibly cart-snapshot validation in `createRegistrations.ts`.

**Acceptance:** Summer-camp tiered class charged at admin-set tier price exactly. No costume/video/progressive math applied.

---

### #2c — Drop-in canonical read in `computePricingQuote`

Switch authoritative engine from legacy `class_meeting_price_rows` to `class_meetings.drop_in_price` as the canonical drop-in price. Keep priority order documented (override > drop_in_price > band) but flag legacy column for sunset.

**Files likely changed:** `app/actions/computePricingQuote.ts`, possibly `createAdminRegistration.ts` (already reads `drop_in_price` directly for line items — verify consistency).

**Acceptance:** Drop-in registrations charged the admin-set per-meeting price.

---

### #2d — Standard mode count bug + scope

Two fixes in one window because they share the count function:
1. **Count rule:** total meetings (count `(class|schedule, day)` pairs) instead of distinct weekdays. A class meeting Mon+Wed = 2; two distinct classes both Monday = 2.
2. **Mode scoping:** count only standard-mode enrollments. Drop-in/tiered/special enrollments don't add to the band count.

**Files likely changed:** `app/actions/computePricingQuote.ts` count helper, tests.

**Acceptance:** Senior dancer in a Mon+Wed class hits Senior 2× band ($1738.04 total). Dancer in 1 standard + 1 drop-in class hits Senior 1× band.

---

### #2e — `tuitionEngine.ts` admin-preview convergence

Decide: either (a) replace admin preview with `computePricingQuote` calls so admin sees what user gets, or (b) align `tuitionEngine` to read the same columns as the authoritative engine. Eliminates the silent base_tuition vs semester_total drift.

**Files likely changed:** `utils/tuitionEngine.ts`, callers in `SessionsStep.tsx`, possibly `validateEnrollment.ts`.

**Acceptance:** Admin draft preview total === createRegistrations quote total for identical inputs.

---

### #2f — Catalog-vs-checkout display drift (standard mode)

**DEFERRED (decision 2026-05-28):** Out of scope for window #2 epic; dev/PM picks approach when the public catalog is next touched. Tracked here for completeness.

**The drift:** standard class cards show a fixed catalog price, but standard tuition is progressive across the dancer's *total* weekly classes. A single Senior 1× class shows ~$916 catalog but a dancer in two Senior classes pays $1738 (not $1832).

---

### #2g — Sunset `class_meeting_price_rows` legacy table (optional follow-up)

Once #2c lands and the canonical drop-in read is on `drop_in_price`, the legacy `class_meeting_price_rows` table is dead weight. Decide whether to drop it or keep as an admin escape hatch.

---

**Original notes (kept for context):**

**Confirmed pricing rules from the client:**
- **Tuition rate bands** apply *only* to the **standard school‑year (fall/spring)** product, which is what divisions (junior/senior) exist for. Junior is lower (shorter 45‑min classes) than senior.
- **Drop‑in and tiered (e.g. summer camp full‑day/half‑day) do NOT use the tuition rate bands.** Their prices are set in class **details + schedule**.
- If a semester is drop‑in/tiered, the bands section should simply not apply / show nothing (no stranded values — see #1).

**Zones / likely files:** Payments/EPG pricing utils, Register flow, queries. **Payments zone — use `epg-researcher` + `schema-and-query-explorer` before edits.**

**Related memory:** ⭐ [`project_pricing_source_of_truth`](.claude/.../memory/project_pricing_source_of_truth.md), [`project_pricing_engine_audit_2026_05_28`](.claude/.../memory/project_pricing_engine_audit_2026_05_28.md) (full audit + sub-window decomposition), [`reference_payment_plan_type_vocab`](.claude/.../memory/reference_payment_plan_type_vocab.md).

---

## 3. Registration form builder — address block + waivers

**Tier 2 · Feature (two related additions to the form builder)**

**What happened (transcript ~8:00–11:00):** Two gaps in the registration‑form builder.

**3a. Address block (~8:15–10:25):** Today each line must be added manually and address is a free‑text "long answer." Build a reusable **address block template** (street, city, state, zip) with:
- **State as a dropdown** (enforced selection — fixes the "NY" vs "New York" inconsistency they had on Active).
- **Auto‑formatting** so addresses are uniform across users.
- (Date of birth already uses a date input — no change needed.)

**3b. Waivers (~8:11, ~10:38):** Add a **Waivers** section to the registration form (placed near "Emergency contact"):
- **Drag‑and‑drop file upload** for the waiver document.
- **Replaceable** — they edit waivers over time (e.g. added a force‑majeure clause after COVID), so admin must be able to upload a new version.
- Standard default waiver, but editable per semester/form.
- **Action item for client:** Monique to send Ethan the current waiver files.

**Acceptance criteria:**
- Form builder offers an "address block" insert that renders street/city/state(dropdown)/zip with auto‑formatting on the user side.
- A "Waivers" section can be added; admin can drag‑drop upload and replace the file; the user must sign/acknowledge it during registration.

**Zones / likely files:** Register (admin) form builder + public registration form, possibly Shared UI primitives. Use `ui-pattern-explorer` for input/field patterns.

**Open question:** Should the waiver be (a) an uploaded PDF the user views + checkbox‑acknowledges, or (b) an e‑signature capture? Transcript says "sign," but the mechanism (checkbox vs typed/drawn signature) needs confirmation. Also: one waiver per form, or multiple?

---

## 4. Confirmation email — static registration summary

**Tier 2 · Feature**

**What happened (transcript ~11:00–12:11):** In the confirmation‑email designer, admin can write free text (good), but there should **always** be a **non‑editable registration summary** block — like a receipt. Screenshot of the desired layout is in the shared Google Drive.

**Required content (always present):**
- Dancer name(s)
- What they registered for
- Registered‑on date
- Amount paid
- (Receipt‑style; "truly what they've registered for")

**Acceptance criteria:**
- Every confirmation email renders the summary block regardless of the editable text.
- Summary is system‑generated and not editable in the designer.
- Summary reflects the *actual* registration across all enrollment paths.

**Zones / likely files:** Emails (`app/admin/emails/**`), confirmation/email send path, EPG confirmation email.

**Related memory:** ⚠️ `project_confirmation_email_schedule_enrollments_pending` (EPG confirmation email currently lists drop‑in names only; tiered/standard `schedule_enrollments` are silently skipped) and `project_emails_enrollment_recipients_pending`. **The summary must read both `registrations` and `schedule_enrollments`** — see `project_enrollment_table_divergence`.

**Open question:** Get the exact Google Drive screenshot/layout from the client before building the block.

---

## 5. Waitlist (full feature)

**Tier 2 · Feature — full scope committed for July 1**

**What happened (transcript ~12:11–16:26):** Per‑class waitlist with a manual, admin‑controlled invite model.

**Required behavior:**
- **Toggle** to enable waitlist per class.
- When a class is **full**, the user sees it's waitlisted and can **opt to join** the waitlist.
- **No automated emails.** The system never auto‑invites. Admin decides who gets in (they sometimes prioritize specific kids over first‑come).
- Waitlisted users complete the **full registration flow** (child info, waivers, everything) **except payment**. May be brand‑new users who've never registered.
- Capture is **timestamped**; admin can see order of sign‑up.
- **New admin portal view** to manage the waitlist: see who's on each class's list, timestamps, and **manually send an invitation email** + complete registration (collect only payment at that point).
- **Dashboard surfacing:** full class shows e.g. "3 waitlisted," clickable into the list.

**Acceptance criteria:**
- Toggle on → full class offers "join waitlist" to users.
- Joining stores a complete registration record minus payment.
- Admin view lists waitlisted entrants per class, timestamped, with a manual "invite/register" action that collects payment.
- No emails sent automatically at any point.

**Zones / likely files:** New admin sub‑zone/view (likely under `app/admin/`), public registration flow, new DB table(s) + migration, queries, server actions. Multi‑layer → consider `feature-touch-point-mapper` first (ask before launching).

**Interacts with #6** (Active auto‑waitlists simultaneous racers; here the model is manual). Reconcile the two designs so concurrency behavior and the waitlist UI agree.

**Open questions:**
- Does a waitlisted entry hold/consume any seat, or is it purely a queue with zero capacity impact until admin invites?
- When admin invites, is payment collected via a tokenized link to the parent, or does admin enter it (cf. manual reg in #7)?

---

## 6. Concurrency & spot reservation (soft‑confirmation gap)

**Tier 2 · Reliability / payments**

**What happened (transcript ~35:00–41:45):** Two related concerns.

**6a. Soft‑confirmation gap:** When Elavon takes the payment but the portal doesn't hear back (webhook/redirect didn't return), the user sees a "soft confirmation" ("we got your payment, watch for your confirmation email"). Client asked: *is the spot reserved during that pending state?* — currently uncertain.

**6b. Last‑spot race ("the one nightmare day"):** On registration‑open day, many users race for the last seat(s). Active's behavior auto‑waitlists all simultaneous attempters, which she finds confusing ("1 spot but 3 waitlisted").

**Decision (Ethan, 2026‑05‑22):** Implement **first‑to‑payment reserves the seat.** The seat is held for whoever reaches checkout/payment first; others are bumped to full → offered the waitlist (#5). This supersedes mirroring Active's "waitlist everyone" behavior.

**Required behavior:**
- Reserve/hold the seat through the pending Elavon window so a soft‑confirmation user does not lose their spot.
- Concurrent attempts resolve deterministically by who commits to payment first; losers see "full" and can join the waitlist.
- Release the hold if payment ultimately fails/abandons (define timeout).
- Admin **notification** when a soft‑confirmation/mismatch occurs (ties into the notification system already in progress).

**Acceptance criteria:**
- Two simultaneous checkouts for the last seat → exactly one succeeds; the other is cleanly routed to waitlist, no double‑book.
- A soft‑confirmation registrant retains their seat until payment is confirmed or the hold times out.
- Admin gets an email/notification on soft‑confirmation events.

**Zones / likely files:** Payments/EPG (webhook + confirmation path), capacity logic (DB trigger spanning both enrollment tables), Register flow. **Payments zone — `epg-researcher` + `schema-and-query-explorer` before edits.**

**Related memory:** `project_epg_session_resume_2026_05_19` (soft‑confirmation / 401 loop / batch‑revive context), `project_class_level_capacity_pending` (class‑wide seat invariant needs a new trigger across both tables), `project_epg_webhook_subscription_dev_gotcha` (the dev "no webhook" gotcha that produces soft confirmations locally).

**Open question:** Seat‑hold timeout duration, and whether the hold is a DB row with TTL vs an advisory lock. Decide alongside #5's capacity question.

---

## 7. Manual registration — installments + super‑admin overrides

**Tier 1 · Payments / admin power tools**

**What happened (transcript ~24:00–31:36):** Installments are **only** a fall/spring auto‑pay product (checking‑account auto‑pay, offered at the end of the public flow). Summer/camp is normally pay‑in‑full. But staff need a **manual registration catch‑all** for special cases and late registrants.

**Required behavior:**
- **Manual registration as a catch‑all** (like drop‑in price entry): a super‑admin can set the price.
- **Super‑admin installment setup:** set the number of installments, divide the total, and **push the plan to Elavon** to auto‑charge (avoid the old fully‑manual charging they're trying to escape). Elavon just receives the small schedule and charges it.
- **Override the pay‑in‑full block:** when staff take a partial payment manually, the system must not block registration ("God‑tier abilities"). Super‑admin has ultimate authority to register.
- **Late‑registration recalculation:** registration is allowed through week 4 of a semester. If a 5‑installment plan loses a month because the dancer joined late, recompute (e.g. 4 installments at a higher amount). Miguel: auto‑doing 4 installments with a higher payment is acceptable. Edge: tuition itself differs by join week — that prorating may stay manual via the super‑admin price field.

**Acceptance criteria:**
- Super‑admin can manually register any family, set price + installment count, and the schedule is sent to Elavon for auto‑charge.
- Partial/initial payment does not block registration completion.
- Late‑join installment plans recompute the remaining count/amount (or are fully settable by the admin).

**Zones / likely files:** Register (admin) `app/admin/register/**`, Payments/EPG (`utils/payment/epg.ts`, recurring/installment scheduling), server actions, queries. **Payments zone — `epg-researcher` first.**

**Related memory:** ⚠️ `project_epg_installment_not_wired_public` (`createRegistrations` hardcodes `pay_in_full`; public UI can't create an installment batch → stored‑card path unreachable via UI — confirm intent pre‑launch), `reference_payment_plan_type_vocab` (canonical strings), `project_epg_session_resume_2026_05_19` (recurring auto‑charge status).

**Open questions:**
- For late‑join standard registrations, is tuition prorated by week (auto) or left to the admin's manual price entry?
- Does the public fall/spring flow's installment selection (auto‑pay) need to be fully wired for launch, or is launch relying on manual‑reg installments only? (See the `pay_in_full` hardcode memory.)

---

## 8. Admin UI redesign / color palette — DEFERRED

**Tier 3 · Design — DO NOT START NOW**

**What happened (transcript ~0:14–1:16):** Ethan and Miguel agreed the admin UI is "too red" and the layout needs rethinking. Since admin is not user‑facing, a more pastel/fun palette is on the table.

**Decision (Ethan, 2026‑05‑22):** **Deferred — revisit next week.** Do not begin redesign work now; functional Tier 1/2 items take precedence. Captured here only so it isn't lost.

**When picked up:** treat as cross‑cutting (Styling globals + Admin shared layout zones — whole‑app visual blast radius). Will need its own scoped plan.

---

## 9. Registration preview mode

**Tier 3 · QA aid (useful for launch)**

**What happened (transcript ~45:12–46:04):** Admin wants to **preview** a semester by walking the **full parent registration flow** without charging — to QA before publishing and to be able to explain the flow to families. She wants checkout to not process payment in preview, but otherwise go end‑to‑end, **including receiving the confirmation email**.

**Required behavior:**
- A "preview" entry that runs the real registration UX as a parent would see it.
- Checkout is a no‑op (no Elavon charge, no real enrollment).
- Confirmation email is still produced/sent (or previewable) so the admin can verify it.

**Acceptance criteria:**
- Admin can preview a published‑candidate semester end‑to‑end without side effects on capacity, enrollments, or payments.
- The confirmation email content is verifiable from the preview.

**Zones / likely files:** Register flow + public registration, Emails. Read‑only/no‑write guardrails are the key risk.

**Open question:** Should preview send a real email to the admin, or just render a preview of it? And should it be gated to a specific role?

---

## Non‑dev note (no window)

Client (Monique/Natalia) will themselves create the **summer camp schedule (tiered)** and the **fall schedule** in the portal, targeting **August registration open**. Both will run concurrently with the eventual Active migration. Dev responsibility: ensure the system *supports* these (tiered + standard) flows — not to build the schedules. She also wants to personally try a **manual registration** and the **preview** (#9) before launch.

---

## Suggested build order

1. **#1 + #2** (division removal → pricing engine) — unblock correct pricing.
2. **#7** (manual reg + installments + overrides) — launch‑critical payments.
3. **#5 + #6** (waitlist + concurrency) — design together; full‑feature waitlist + first‑to‑payment seat reservation.
4. **#3 + #4** (form builder + confirmation summary).
5. **#9** (preview mode).
6. **#8** (UI redesign) — next week, after the above.
