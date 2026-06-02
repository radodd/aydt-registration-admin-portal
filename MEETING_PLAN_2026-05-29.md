# Stakeholder Meeting — Action Plan (2026‑05‑29)

**Source:** AYDT Parent Portal Showcase, May 29 (46 min) — https://fathom.video/share/aLnq3s8-schsUx1cmC5BUWCtnbUUWqRg
**Attendees:** Ethan (dev), Miguel, AYDT NYC (Monique / Natalia; Emily + Nikki briefly at start)
**Hard build deadline:** July 1, 2026 (unchanged — then ~1 month UAT; Active contract through end of July; go‑live target Aug 1).

> **Numbering:** items continue the global sequence from the 2026‑05‑22 plan (which used **#1–#9**). This meeting's items are **#10–#27**, so no number means two different things across the two docs. References to a prior‑meeting item are always written as "**2026‑05‑22 #N**."

This meeting was a **live demo of work shipped since 2026‑05‑22**, not a fresh requirements session. So this doc is mostly a **punch list of bugs / refinements** found during the walkthrough, plus a few net‑new asks and two **test commitments** Ethan made for next meeting. It clusters into **18 work items (#10–#27)** — one Claude window per item where there's code to write.

**Commitments Ethan made on the call (for the *next* meeting):**
- Build out the **Classes tab** so admin can see capacity + waitlist in one place and make seat decisions (#25). ("Next time we meet, I'm going to have this classes tab built out.")
- **Stress‑test the concurrency / one‑spot‑many‑racers scenario**, including a live human test with Miguel (#26).
- Make **payments visible everywhere in the portal** — esp. dancer profiles where partial payment/balance is wrong (#19).
- **Finalize the pricing/order‑summary engine** (add‑ons, costume, registration fee flow) — "ironed out by next week for sure" (#21).

**Decisions / confirmations captured (2026‑05‑29):**
- **Concurrency model reconfirmed:** first to *complete payment* gets the spot (not cart‑first); no pending/held seat. Everyone else is waitlisted. Still must be tested (#26).
- **No online sessions** anywhere (COVID‑era Active artifact) — remove from confirmation email.
- **Keep `check` as a manual payment method** (in‑person payers use it) and **add ACH** (#18).
- **Color palette:** going **purple** (their original brand), away from maroon/red. Ethan + Miguel review stylings next week (#27 — still deferred).
- **Payment‑link offer window** is admin‑configurable; **not 7 days** — short (hours) is correct (#24).

---

## Priority tiers

> **Progress (as of 2026‑06‑01):** 4 items shipped (#10, #12, #13, #14) and #21's add‑ons portion shipped + harness‑verified. 13 items remain.

**Tier 1 — committed for next meeting / launch‑blocking payments:**
- #19 Partial‑payment balance must propagate to dancer profile + payment dashboard
- #21 Pricing / order‑summary engine completion — 🟡 **add‑ons SHIPPED + harness‑verified 2026‑06‑01** (`ec32006`); costume + registration‑fee line items still to confirm
- #25 Classes tab — capacity + waitlist overview (the headline next‑meeting build)
- #26 Concurrency stress test (first‑to‑payment) + live human test

**Tier 2 — functional bugs/asks surfaced in the demo:**
- #10 Class builder field persistence (default drop‑in price, add‑ons) — ✅ SHIPPED 2026‑06‑01 (`bc2d9e5`)
- #12 Form‑builder edit‑question modal responsiveness — ✅ SHIPPED 2026‑06‑01 (`f320c99`)
- #16 Auto‑populate existing dancer info (manual reg + waitlist + preview)
- #17 Credits + tuition adjustment in both pay modes
- #18 Add ACH to manual‑reg payment methods (keep check)
- #22 Registration‑fee toggle per offering (setup)
- #23 Waitlist flow — add waiver (complete all‑but‑payment)

**Tier 3 — polish / smaller refinements:**
- #11 Remove stale "Junior" division artifact from drop‑in display
- #13 Custom discipline option for camps — ✅ SHIPPED 2026‑06‑01 (`1aa79ea`); harness‑verify checkpoint open
- #14 Duplicate‑a‑week (copy camp week within a semester) — ✅ SHIPPED 2026‑06‑01 (`1aa79ea`, `033d0cc`)
- #15 Confirmation‑email field cleanup (drop online sessions + classroom name)
- #20 Preview‑mode data sync (old/blank address, summary in final preview)
- #24 Confirm payment‑link offer window configurability

**Deferred:**
- #27 Color palette / UI redesign — Ethan + Miguel, next week

---

## 10. Class builder — field persistence (default price + add‑ons) — ✅ SHIPPED 2026‑06‑01

**Tier 2 · Bug (data not saving in Classes & Offerings editor) · DONE**

**Landed:** `bc2d9e5` fix(semesters/class-builder): persist default drop-in price and add-ons on reopen. Both the default drop‑in price and add‑ons now survive save → reopen.

**What happened (transcript ~2:05–2:51, ~28:05–29:14):** Two separate fields in the class/offering editor don't persist:
- **Default drop‑in price:** editing Adult Jazz, setting the default price to **$40**, it "always disappears" on re‑edit — unclear if it's saving. Ethan: "you're absolutely correct, I've noticed that as well, I am working on that."
- **Add‑ons:** Monique created an **Early Drop‑Off — 8:30 a.m. — $20** add‑on and saved; on reopening it was gone. Ethan confirmed live: "Yeah, it's not persisting… that's a new thing."

**Required behavior:**
- Default price set on a drop‑in/offering saves and re‑displays on edit.
- Add‑ons (label + time/detail + price) persist on the class and survive reload.

**Acceptance criteria:**
- Set default price → save → reopen → value is still there.
- Add an add‑on → save → reopen editor and the public order summary → add‑on present in both.

**Zones / likely files:** Semester — create/edit + shared steps (`app/admin/semesters/**`, `steps/**`), server actions (`app/admin/semesters/actions/**`), queries. Verify add‑on columns/table against `supabase/migrations/`.

**Open question:** Is the loss at write (action not saving) or read (editor not hydrating the saved value)? Diagnose which before patching. Likely the same root for both fields.

---

## 11. Remove stale "Junior" division artifact from drop‑in display

**Tier 3 · UX cleanup (follow‑up to 2026‑05‑22 #1)**

**What happened (transcript ~4:25–5:12):** Division removal shipped, but the drop‑in class **still visually shows "Junior."** Confirmed it is **not applied** to pricing — it's a leftover display artifact. Ethan: "this is just an artifact… I need to remove this."

**Required behavior:** No division label rendered anywhere for drop‑in/tiered classes (display layer), even when a legacy value lingers in data.

**Acceptance criteria:** Open a drop‑in class detail/edit → no "Junior"/division text anywhere.

**Zones / likely files:** Semester — edit / Classes display (`app/admin/semesters/[id]/**`, `app/admin/classes/**`). Display‑only fix.

**Related memory:** `project_division_cleanup_followups` (DB default drop, dancer display, type tightening were deferred from the original division‑removal fix — this is the same thread).

---

## 12. Form‑builder edit‑question modal — responsiveness — ✅ SHIPPED 2026‑06‑01

**Tier 2 · Bug (UX blocker) · DONE**

**Landed:** `f320c99` fix(form-builder): make edit-question modal fit short viewports. Modal now scrolls/fits so the Update button is reachable and the user can exit.

**What happened (transcript ~6:04–8:17):** Toggling a registration‑form question (e.g. **Grade**) to required, then clicking edit, opens a modal you must scroll inside — and the **"Update question" button is unreachable**. Monique got stuck and had to back out ("I couldn't get out of it"). Also zoom/scaling awkwardness. Ethan: "I need to edit the modal so it fits more responsive to the screen."

**Required behavior:** Edit‑question modal is responsive/scrollable so all controls (incl. Update/Save) are reachable at any viewport; user can always exit.

**Acceptance criteria:** Edit a question on a small/standard viewport → can reach and click Update without the button being clipped; can close the modal cleanly.

**Zones / likely files:** Register (admin) form builder (`app/admin/register/**`) and/or the form‑builder modal component. Use `ui-pattern-explorer` for the existing modal pattern.

**Note:** Monique separately confirmed she *did* add a "not in school yet" → entered as **N/A** — that worked; the only issue was modal scroll. Mandatory‑question toggle works.

---

## 13. Custom discipline option for camps — ✅ SHIPPED 2026‑06‑01

**Tier 3 · Feature (small) · DONE (harness‑verify checkpoint open)**

**Landed:** `1aa79ea` feat(semesters/class-builder): add custom discipline option and duplicate-week action. Camp/non‑standard offerings can now set a custom discipline. Visual verification is queued as a create‑semester harness checkpoint (memory `project_create_semester_harness_checkpoints`).

**What happened (transcript ~9:24–10:12):** Creating a week of **dance camp**, the **discipline** dropdown had no option for "camp," so she left it on **Ballet** even though it's a camp. Wants the ability to add/select a custom discipline.

**Required behavior:** Discipline field allows a custom/"camp" value (or an "add discipline" affordance) for non‑standard offerings.

**Acceptance criteria:** Creating a camp class → can set discipline to "camp" (or a custom value) and it persists/displays.

**Zones / likely files:** Semester — create/edit + shared steps (`app/admin/semesters/**`). Possibly a disciplines lookup — verify against `supabase/migrations/`.

---

## 14. Duplicate‑a‑week (copy a camp week within a semester) — ✅ SHIPPED 2026‑06‑01

**Tier 3 · Feature · DONE**

**Landed:** `1aa79ea` (duplicate-week action) + `033d0cc` feat(semesters/class-builder): add per-row duplicate button to class list. A configured week/class can be cloned, then dates edited.

**What happened (transcript ~10:12–10:50):** Monique's "big one": after setting up one week of camp she wants to **duplicate that week and just change the dates**, keeping all other info, instead of re‑entering everything. "There's no option for me to copy this week."

**Required behavior:** A "duplicate week" action on a camp/offering that clones all settings into a new week; admin then edits dates.

**Acceptance criteria:** Duplicate a configured week → new week appears with identical settings → editing dates doesn't disturb the original.

**Zones / likely files:** Semester — edit / Classes & Offerings (`app/admin/semesters/[id]/**`, shared steps), server actions, queries.

**Open question:** Does "week" map to a class, a schedule group, or a set of sessions? Define the clone unit and what gets new IDs vs copied.

---

## 15. Confirmation‑email field cleanup (drop online sessions + classroom name)

**Tier 3 · Cleanup**

**What happened (transcript ~12:37–13:27):** Ethan asked about three email fields he was unsure of:
- **Online sessions** → remove. "We don't do online anymore" (Active/COVID artifact).
- **Classroom name** → remove. "I don't have any inputs."
- **Location address** → **keep.** Monique toggled it (e.g. **428 E 70 / Upper East Side**).

**Required behavior:** Confirmation email summary drops the online‑sessions and classroom‑name fields; keeps location address.

**Acceptance criteria:** Rendered confirmation summary shows location address, no online‑sessions line, no classroom‑name line.

**Zones / likely files:** Emails (`app/admin/emails/**`) + the summary builder.

**Related memory:** ⚠️ `project_confirmation_email_schedule_enrollments_pending` — its open item was "no authoring UI for location_address/classroom yet." This resolves the direction: **classroom is dropped, location stays.** Update that summary helper accordingly.

---

## 16. Auto‑populate existing dancer info (manual reg + waitlist + preview)

**Tier 2 · Bug (recurring across flows)**

**What happened (transcript ~15:04–15:25, ~33:50, ~30:57):** For an **existing** account / logged‑in parent, the child‑info step is shown blank and demands re‑entry. Seen three times:
- Manual reg: "if it's an existing account, this shouldn't be necessary… this should have auto‑populated. I will look into that."
- Waitlist: "this should be all auto‑populated if I'm already logged in."
- Preview: Mia's address blank though she's already in the DB (partly a preview‑sync issue — see #20).

**Required behavior:** When the dancer/parent already exists, prefill child + contact + address fields; don't force re‑entry.

**Acceptance criteria:** Manual‑register an existing dancer → info auto‑fills. Waitlist as a logged‑in parent → info auto‑fills.

**Zones / likely files:** Register (admin) `app/admin/register/**`, public registration / waitlist flow, queries for family/dancer prefill. (Preview's version overlaps #20.)

---

## 17. Credits + tuition adjustment in both pay modes

**Tier 2 · Feature / clarify**

**What happened (transcript ~16:26–18:23):** Ethan was unsure how the **Credits** section should behave (apply existing account credits? grant new credits? remove it?). Monique's answer:
- Need **both** a **tuition adjustment** *and* a **credit** option.
- **Credit** use case: a dancer is injured / missing a class but already registered → put a credit on their account.
- Both should exist in **both** the **pay‑in‑full** and **auto‑pay/installment** views (she'd naturally adjust in pay‑in‑full then switch to auto‑pay).
- **Tuition adjustment already works** — entering $10 took $10 off live. Credits likely still a placeholder.

**Required behavior:** Tuition adjustment + credit both available in pay‑in‑full and installment checkout; credit actually posts to the account (define: grant vs apply existing).

**Acceptance criteria:** In both pay modes, an adjustment reduces the total; a credit is recorded against the family/account and is reflected on their balance.

**Zones / likely files:** Register (admin) checkout (`app/admin/register/**`), Credits (`app/admin/credits/**`), payments/queries. Confirm placement parity across both pay‑mode cards.

**Related memory:** `project_admin_checkout_input_consolidation` (CheckoutStep money inputs were just consolidated; the "Set custom total"/adjustments layout is fresh — keep credit/adjustment consistent with that). Palette of open checkout threads.

**Open question:** Is "credit" granting a new account credit or applying a pre‑existing one? Monique implied **granting** (injury case). Confirm before building.

---

## 18. Add ACH to manual‑reg payment methods (keep check)

**Tier 2 · Payments**

**What happened (transcript ~18:23–19:13):** Ethan moved to remove `check`, but Monique kept it — in‑person manual payers do pay by check. Then: "We do want the option for people to pay through **ACH** as well… if we're providing that as an option, we need it in manual form." Ethan: "we need an ACH option here in this payment card."

**Required behavior:** Manual‑reg payment card offers **check** and **ACH** (alongside existing options).

**Acceptance criteria:** Manual checkout shows check + ACH; selecting ACH records/initiates an ACH payment correctly.

**Zones / likely files:** Register (admin) `app/admin/register/**`, Payments/EPG (`utils/payment/epg.ts` ACH path). **Payments zone — `epg-researcher` first.**

**Related memory:** `project_epg_integration` (stored cards/ACH already built for recurring) — confirm the manual card reuses the existing ACH path rather than a new one.

---

## 19. Partial‑payment balance must propagate to dancer profile + payment dashboard

**Tier 1 · Payments — committed**

**What happened (transcript ~19:20–20:49, ~44:50):** Monique put **$400 cash** on an **$800** balance and registered. On the **dancer profile / payment dashboard** the balance was wrong / not shown, and the **due date was incorrect**. Ethan live: "Ooh, didn't like that at all. I need to fix that flow… I need to continue that flow into this portion." At wrap‑up he reconfirmed: payments must be "seen everywhere in the portal, including the dancer profiles, where Heather did not finish payment" — it looked like she paid everything or paid nothing.

Real use case (Monique): a parent pays "$1,000 in cash and then the rest" — partial payment must be a first‑class option.

**Required behavior:**
- A partial manual payment records amount collected + remaining balance accurately.
- Balance + correct due date surface on the **dancer profile** and the **payment dashboard**, not just the confirmation email (which *did* show $400 off + balance correctly, ~22:30).

**Acceptance criteria:** Register with a partial payment → dancer profile and payment dashboard both show the correct outstanding balance and due date → no "paid everything / paid nothing" ambiguity.

**Zones / likely files:** Payments (`app/admin/payments/**`), Dancers (`app/admin/dancers/**`), Register (admin), payments/queries. **Payments zone — `epg-researcher` + `schema-and-query-explorer` before edits.**

**Related memory:** `project_enrollment_table_divergence` (payment dashboard / profile reads must span both enrollment paths), `project_epg_session_resume_2026_05_19`, `project_meeting_plan_07_manual_installments` (the partial‑payment override that produced this balance).

---

## 20. Preview‑mode data sync (old/blank address, summary in final preview)

**Tier 3 · Polish (preview is read‑only / different surface)**

**What happened (transcript ~29:14–33:10):** Walking the preview end‑to‑end exposed sync gaps because preview is "a totally different part of the project" Ethan "brushed over":
- Registration‑info step showed the **old address**; Mia's address was **blank** though she's in the DB (overlaps #16 prefill).
- The **final preview's confirmation email did not show the registration summary** — though the real test email *does*. Ethan: "I'll definitely add it to this final preview."

**Required behavior:** Preview pulls the same data the real flow does (or clearly states preview‑only fields); the final preview email renders the registration summary.

**Acceptance criteria:** Preview shows current dancer address (or labeled placeholder); final preview email includes the summary block matching the real email.

**Zones / likely files:** Register flow + public registration, Emails. **Read‑only/no‑write guardrails remain the key risk** (preview must not affect capacity/enrollments/payments).

**Related memory:** `project_preview_mode_item9` (preview = render‑only confirmation, super_admin gate — extend its summary render to the final page).

---

## 21. Pricing / order‑summary engine completion (add‑ons, costume, registration fee) — 🟡 PARTIAL

**Tier 1 · Pricing — committed ("ironed out by next week") · ADD‑ONS DONE**

**Landed:** `ec32006` feat(pricing): charge required add-ons per enrolled section in pricing quote — IMPLEMENTED + harness‑verified 2026‑06‑01 (memory `project_meeting_plan_21_addons`). `computePricingQuote` now reads `class_meeting_options`; ALL add‑ons auto‑apply once per section (note: `is_required` is currently ignored, and there is **NO rounding** — confirm both are intended). **Still open:** costume line item + registration‑fee surfacing in the order summary (and the rounding behavior Monique liked at ~29:14).

**What happened (transcript ~25:30–29:14):** In the preview order summary, the registration fee showed but **no costume** and **no early‑drop‑off add‑on** appeared, even though they were configured. Ethan: "it looks like we still need to finalize the payment engine here… I was doing a lot of work getting this pricing engine to work well; I think I just didn't address these." Also a **rounding** nicety: a $…7.43.52 value rounded up cleanly ("you rounded it up, I love that"). Add‑on persistence root cause overlaps #10.

**Required behavior:** Order summary reflects all configured line items — base price, registration fee, costume, and add‑ons — with correct rounding.

**Acceptance criteria:** A class with a costume + a $20 early‑drop‑off add‑on → both appear as line items in the order summary with the correct total.

**Zones / likely files:** Payments/pricing (`app/actions/computePricingQuote.ts`), cart/order‑summary render, Register flow. **Payments zone — `epg-researcher` + `schema-and-query-explorer` before edits.**

**Related memory:** ⭐ `project_pricing_source_of_truth`, `project_pricing_engine_audit_2026_05_28` (the 2026‑05‑22 #2 epic — add‑ons/costume threading into the engine is the remaining surface). Depends on #10 add‑on persistence landing first.

---

## 22. Registration‑fee toggle per offering (setup)

**Tier 2 · Feature**

**What happened (transcript ~26:21–27:36):** Registration fee "applies to most," but some offerings have **none** — a "runoff," a movie night, or **Art in Motion** (an internal registration). Monique wants a **toggle in the setup area**: "yes, we're doing a registration fee, and I can set it across the board," with the ability to turn it off per offering.

**Required behavior:** Setup‑level toggle for whether a registration fee applies; settable across the board with per‑offering exemption.

**Acceptance criteria:** Toggle off for an offering → no registration fee in its order summary; default on for standard offerings.

**Zones / likely files:** Semester setup / fee configuration (`app/admin/semesters/**` setup step), pricing engine read (ties to #21).

---

## 23. Waitlist flow — add waiver (complete everything except payment)

**Tier 2 · Waitlist refinement**

**What happened (transcript ~34:45–35:27):** The waitlist join flow ends at "we're all set, no payment needed" but **skips the waiver**. Monique: "I'd like all of everything completed, except for the payment," so when she invites them off the waitlist she only needs payment, not to send them back for a waiver. Ethan: "Totally forgot about the waiver."

**Required behavior:** Waitlist registration collects the **full form incl. waiver** (everything except payment), matching the regular flow minus checkout.

**Acceptance criteria:** Join a waitlist → waiver is presented and recorded → admin invite step only collects payment.

**Zones / likely files:** Waitlist + public registration flow, waiver field component (shared with #12 / form builder).

**Related memory:** `project_meeting_plan_05_waitlist` (capacity‑neutral queue; Path B admin in‑portal completion — the invite step should now assume waiver already captured), `project_meeting_plan_03_form_builder` (waiver field reuses upload‑PDF + email‑assets bucket).

---

## 24. Confirm payment‑link offer window is configurable (not 7 days)

**Tier 3 · Verify (likely already built)**

**What happened (transcript ~37:21–37:43):** Sample invite email said 7 days. Monique: "I don't think we want seven days… I saw in the setup that you can set how many days." Ethan: "I think it's eight hours or something."

**Required behavior:** Offer window is admin‑configurable; default to a short window (hours), not 7 days.

**Acceptance criteria:** Setup lets admin set the offer window; the invite email + expiry honor it.

**Zones / likely files:** Waitlist setup + invite email/expiry (`project_meeting_plan_07_manual_installments` / waitlist invite path). Mostly confirm + fix the copy/default.

---

## 25. Classes tab — capacity + waitlist overview (next‑meeting headline)

**Tier 1 · Feature — committed for next meeting**

**What happened (transcript ~37:43–41:48):** Monique's central ask. On a big registration day with hundreds registering, she needs **one place** to see, per class, **enrolled / capacity AND waitlist count** so she can decide whether to "squeeze somebody" in. Today the **Classes tab** shows enrolled / confirmed / open spots but **no waitlist count**, and the waitlist view is a separate screen — she doesn't want to bounce between screens. Miguel added: a **max‑students counter** would help. Ethan: "we're going to want this classes tab to empower you to make all those decisions… next time we meet I'm going to have this classes tab built out."

**Required behavior:**
- Classes tab shows per class: enrolled / confirmed, capacity (max), open spots, **and waitlist count** in one row/view.
- Clickable into the waitlist for that class to act on it (invite / register).

**Acceptance criteria:** A full class with 3 waitlisted shows "X/Y enrolled" + "3 waitlisted" on the Classes tab → admin can act from that single view without switching screens.

**Zones / likely files:** Classes (`app/admin/classes/**`), waitlist queries, capacity reads spanning both enrollment tables.

**Related memory:** `project_meeting_plan_05_waitlist` (per‑class queue + admin management view), `project_class_level_capacity_pending` (class‑wide seat invariant across both tables — the count source), `project_enrollment_table_divergence`.

---

## 26. Concurrency stress test (first‑to‑payment) + live human test

**Tier 1 · Test — committed (not a build)**

**What happened (transcript ~38:35, ~41:48–44:11):** The "one nightmare day" race. Ethan reconfirmed his implementation: **no pending/held spot** — whoever **registers first** gets the remaining spot, everyone else is waitlisted (this is cart‑first vs payment‑complete: completion wins). But he's **never tested true simultaneous attempts**. Active "blocks it completely" and ends up with "3 waitlisted for 1 spot," which Monique finds confusing. Plan: Ethan runs **stress tests** + a **live human test with Miguel** (both click at the same instant) **before the next meeting**.

**Required behavior / outcome to prove:**
- Two+ simultaneous checkouts for the last seat → **exactly one** succeeds; others cleanly routed to waitlist; **no double‑book**.
- Behavior is deterministic by who *completes payment* first, not who carted first.

**Acceptance criteria:** A scripted concurrent test + a manual two‑human test both yield exactly one enrollment and the rest waitlisted, with no over‑capacity row.

**Zones / likely files:** Payments/EPG webhook + confirmation path, capacity logic (DB trigger across both enrollment tables), Tests (`tests/**`). **Payments zone.**

**Related memory:** `project_class_level_capacity_pending` (needs the cross‑table trigger to enforce this), `project_meeting_plan_05_waitlist` (the race decision from 2026‑05‑22), `project_epg_session_resume_2026_05_19`.

**Open question:** Without a held seat, how is the winner decided at the DB layer (unique constraint + transaction? advisory lock?) — the stress test should validate the chosen mechanism, not just observe.

---

## 27. Color palette / UI redesign — DEFERRED (next week)

**Tier 3 · Design — DO NOT START NOW**

**What happened (transcript ~23:26–24:18):** Client sent the colors. Brand is **purple** (their original) — "not this purple, but you have them." Miguel: tone down the "huge red… maroon‑forward" screen. Ethan + Miguel agreed to **review stylings next week**.

**Decision:** Still deferred (this is the 2026‑05‑22 #8 item, carried forward). When picked up, treat as cross‑cutting (Styling globals + Admin shared layout — whole‑app visual blast radius); needs its own scoped plan.

---

## Confirmed working in the demo (no action)

- **Division removal** functioning (only the display artifact remains — #11).
- **Address block** in the form builder is live; **waiver** upload/paste + checkbox is built (client still owes the actual waiver files — see action item).
- **Confirmation email registration summary** renders correctly in the real email (incl. $400‑paid / balance) — only missing from the *final preview page* (#20).
- **Manual registration** end‑to‑end: new/existing dancer search, editable line‑item pricing, pay‑in‑full vs installments auto‑calc, custom total, tuition adjustment (live‑verified −$10).
- **Waitlist** end‑to‑end: full‑class tag → join → timestamped entry → admin waitlist view → "send payment link" → secure‑link email.
- **Searchable semester picker** done.

## Client action items (non‑dev)

- **Monique to send the actual waiver file(s)** — still outstanding (#23 / form builder).
- Colors already sent; Ethan + Miguel to apply next week (#27).

---

## Suggested build order

1. ~~**#10**~~ ✅ + **#21** (persistence → order‑summary engine) — add‑ons saved (#10) and now charged (#21 add‑ons); **remaining: #21 costume + registration‑fee line items.** *(Committed for next week.)*
2. **#19** (partial‑payment balance everywhere) — launch‑critical payments visibility. *(Committed.)*
3. **#25** (Classes tab capacity + waitlist overview) — the headline next‑meeting deliverable.
4. **#26** (concurrency stress + human test) — run alongside #25's capacity work.
5. **#16 + #17 + #18** (prefill, credits/adjustment parity, ACH) — manual‑reg correctness.
6. ~~**#12**~~ ✅ + **#23** (modal responsiveness done; waitlist waiver remaining) — flow completeness.
7. **#11 + ~~#13~~ ✅ + ~~#14~~ ✅ + #15 + #22 + #24** (display artifact, ~~custom discipline~~, ~~duplicate week~~, email field cleanup, reg‑fee toggle, offer‑window confirm) — refinements.
8. **#20** (preview sync polish).
9. **#27** (palette) — next week with Miguel.

**Remaining open (13):** #11, #15, #16, #17, #18, #19, #20, #21 (costume + reg‑fee only), #22, #23, #24, #25, #26. Deferred: #27.
