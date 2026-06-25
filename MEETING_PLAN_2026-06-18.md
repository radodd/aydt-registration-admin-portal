# Stakeholder Meeting — Action Plan (2026‑06‑18)

**Source:** Showcase (44 min) — https://fathom.video/share/UqGeHZirrjsvpdTyyhhn_24k8nfWJRs1
**Attendees:** Ethan (dev), AYDT NYC (Monique + Natalia)
**Hard build deadline:** July 1, 2026 (unchanged) — then UAT; Active contract through end of July; go‑live target ~Aug 1.
**Next meeting:** Recurring slot **moved to Thursdays 11 a.m.** (office now closed Fridays for the summer).

> **Numbering:** items continue the global sequence. **2026‑05‑22 = #1–#9**, **2026‑05‑29 = #10–#28**, **2026‑06‑08 = #29–#41**. This meeting's items are **#42–#51**. References to a prior‑meeting item are written as "**2026‑06‑08 #N**." No bare "#N" is reused across docs.

This was a **live walk‑through of the #29–#41 punch list** — most of it confirmed working (Classes view, reserve‑at‑cart race, waitlist‑collects‑waiver, scroll fix, prefill, toasts/loading states, reg‑fee persistence + itemization, add‑on defaults). The meeting surfaced a focused **refinement list (#42–#48)** plus kicked off the **production cutover** in earnest: the client is about to build the real **Fall 2026** schedule, so the threads are (a) small UI/UX refinements from the demo, (b) the **payments dashboard becoming actionable** (Pay Now / Reprocess, action‑only error log), and (c) **launch logistics** — clean‑slate DB, the ACTIVE→AYDT migration plan, and moving all infra accounts onto AYDT's own `admin@aydt.nyc`. It clusters into **10 work items (#42–#51)**.

**Decisions / confirmations captured (2026‑06‑18):**
- **Classes view "Status" column is redundant** (a row is only ever registered or waitlisted) → replace it with **Age/Grade** (#42).
- **Email branding direction:** the heavy cherry top must go. Header should be **white**, **more condensed** (current logo too big — pushes body below the fold on mobile), with the **location** in the footer; **cherry stays as a bottom accent only.** Monique likes the tricolor‑on‑blush / white logo lockup and will send recent real emails as reference. Miguel (designer) to be looped in via a vision board. (#44)
- **Early drop‑off opt‑in must appear on BOTH admin and the public/user registration flow** — and only when the add‑on was enabled in Create Semester. (#45)
- **Payments filter says "Terms" — rename to "Semesters."** (#46) Ethan flagged this live.
- **Payments must be actionable from the row:** add **Pay Now / Reprocess** (charge a saved encrypted card, or prompt for a different card — e.g. expired card / different month on a different card) **and Mark Paid** (cash/check). Current "Mark as paid" wording is "scary" and unclear — rework the buttons. (#47)
- **Error Log must be action‑based only.** A payment that failed but the family **self‑resolved** (declined card → paid with another card → no balance) must **not** clutter the error log — it can live on the parent's profile history, but the log is strictly for things an admin/dev must fix. Parents commonly have 5–7 cards and retry. (#48)
- **Clean‑slate launch:** client will **archive/delete** stale + duplicate semesters (Fall 26, Spring 26, Drop‑in May 26, Fall 25, the duplicate Summer 26 — keep the correct one); Ethan then **hard‑deletes** them from the DB so production starts truly clean. (#49)
- **ACTIVE → AYDT migration:** Ethan to draft the migration plan for existing users/data and **brief AYDT** before running it. (#50)
- **Infra under AYDT's own account:** Vercel, Supabase, Resend accounts to be created/owned under **`admin@aydt.nyc`** (not Natalia's personal email — admin is shared; Natalia is primary contact). Accounts were created/approved live on the call. (#51)
- **Tuition/fees changed (client‑editable):** master tuition chart increased; baseline **costume fee $65 → $70.** Monique will update these herself in the portal — *no dev change*, noted under client actions.
- **EPG/Elavon:** new test suite from Justin sent + passing; **analyst reviewing as of 2026‑06‑17** — awaiting her email. External/ongoing.

---

## Priority tiers

**Tier 0 — launch logistics / cutover:**
- #49 Clean‑slate DB — hard‑delete client‑archived stale/duplicate semesters — 🔲 PENDING (gated on client archiving first)
- #50 ACTIVE → AYDT data‑migration plan (draft + brief client) — 🔲 PENDING
- #51 Infra accounts onto `admin@aydt.nyc` (Vercel / Supabase / Resend) — 🟡 accounts created on call; finish setup + migrate

**Tier 1 — payments dashboard actionability:**
- #47 Failed‑payment row actions — Pay Now / Reprocess + Mark Paid (rework buttons) — 🔲 PENDING
- #48 Error Log — action‑required only (suppress self‑resolved failures) — 🔲 PENDING (design solution)

**Tier 2 — functional refinements from the demo:**
- #45 Early drop‑off opt‑in on the public/user registration flow (verify + fix parity) — 🔲 PENDING (Ethan believes both already wired — confirm)
- #46 Payments filter rename "Terms" → "Semesters" — ✅ DONE (small)

**Tier 3 — UI polish:**
- #42 Classes view — replace Status column with Age/Grade — 🔲 PENDING
- #43 Instructor Portal in‑app navigation (+ notification icon fix) — 🔲 PENDING
- #44 Email branding redesign — white condensed header + location footer + Miguel vision board — 🟡 IN FLIGHT (cream header just landed `f936447`; pivot to white per this meeting)

---

## 42. Classes view — replace Status column with Age/Grade — 🆕

**Tier 3 · UI · Classes**

**What happened (transcript ~0:30–3:52, action ~2:57):** Demoing the built‑out Classes view (enrollment fill bar, registered‑dancer list, add‑dancer/add‑instructor inline). Monique: the **Status** column ("Confirmed") is redundant — a dancer is only ever **registered or waitlisted**, which is already obvious from context. She asked to swap that column for **school grade (or age)**: "can we change that column to like age or grade." Ethan agreed — "obviously redundant information… we'll add age and grade."

**Required behavior:** The registered‑dancer table in the Classes view shows the dancer's **age and/or grade** in place of the Status column.

**Acceptance criteria:** Open a class in the Classes view → the per‑dancer row shows age/grade (sourced from the dancer profile) instead of "Confirmed/Waitlisted" status.

**Zones / likely files:** Classes (`app/admin/classes/page.tsx`, `app/admin/classes/[id]/page.tsx`). Need the dancer's grade/age — verify the column on the dancer/profile record against `supabase/migrations/` (`schema-and-query-explorer` if the field isn't already selected). Reuse the existing table cell pattern (`ui-pattern-explorer`).

**Open question:** Age **and** grade, or just one? Monique said "age or grade." Default to **grade** (matches the eligibility vocabulary) and consider showing both compactly if room.

---

## 43. Instructor Portal — in‑app navigation + notification icon fix — 🆕

**Tier 3 · UI · Admin shared layout + Instructor app**

**What happened (transcript ~3:40–5:14, action ~3:40):** Ethan added top‑nav links (Home → dashboard, **Instructor dashboard**, **User portal**) plus the logged‑in user's name. Monique tested clicking **Instructor dashboard** and found she could only get back by hitting **backspace** — there's **no in‑app navigation back** from the instructor surface. Ethan: "I need to add navigations here as well to the instructor portal." Separately he flagged the **notification icon** in the top bar needs fixing. He also noted "User Portal" is renameable if the client wants.

**Required behavior:** From the Instructor Portal a user can navigate back to the admin dashboard / between surfaces without the browser back button; the top‑bar notification icon renders/behaves correctly.

**Acceptance criteria:** In the Instructor Portal there's a visible nav affordance returning to Home/Admin; clicking it works. Notification bell displays correctly in the top bar.

**Zones / likely files:** ⚠️ **Cross‑cutting** — Admin shared layout (`app/admin/_components/TopBar.tsx`, `NotificationBell.tsx`, `MobileNav.tsx`) and Instructor app (`app/instructor/layout.tsx`, `app/instructor/_components/**`). Editing shared layout affects every admin page — call out in the scope contract and confirm before changing.

**Related memory:** ⭐ `project_admin_ui_redesign_2026_06_17` (the TopBar with Home/Instructor/User Portal + account chip — this extends it to the instructor surface). 

**Open question:** Does "User Portal" need renaming? Client neutral — leave as‑is unless they ask.

---

## 44. Email branding redesign — white condensed header + location footer — 🆕

**Tier 3 · Email branding · Shared email layout (`wrapEmailLayout`)**

**What happened (transcript ~9:36–16:22, action ~14:09):** Across the create‑semester confirmation/waitlist email previews (now merged into one Emails step) the design reads as **"cherry heavy."** Monique: cherry is an **accent**, not the dominant color. The **top bar should be white** like their real ActiveCampaign emails — "it's white… crisp, clean, versus the cherry." The header is also **too big/wide** — pushes the body text below the fold, bad on mobile — needs to be **more condensed**. The **bottom bar is fine as cherry** because it carries the **locations** (footer). Monique will **email recent real emails as reference**; Ethan to build a **vision board for Miguel** (designer, color expert, may not attend meetings) to convey the vision accurately. Colors overall are "still settling" — explicitly **not the top priority**, polish later.

**Required behavior:** Shared email template uses a **white, condensed header** carrying the correct logo lockup (tricolor‑on‑blush / white per client), cherry reduced to a **bottom accent**, and the **location(s)** in the footer.

**Acceptance criteria:** A rendered confirmation email shows a white compact header (logo not oversized; body visible without heavy scroll on mobile) + cherry location footer. Vision board assembled for Miguel.

**Zones / likely files:** ⚠️ **Cross‑cutting — Payments/email + edge functions.** `utils/prepareEmailHtml.ts` (`wrapEmailLayout`, `EMAIL_COLORS`, `emailButton()`), plus the **three inlined edge‑function copies** (`supabase/functions/process-scheduled-emails`, `process-waitlist`, `send-email-broadcast`) that must stay in sync. **Note:** commit `f936447` *just* restyled this to a **cream** header + wine footer — this item **pivots that to white + condensed** per the meeting; reuse the same structure, change the palette/sizing. Logo assets already on hand.

**Related memory:** `project_resend_aydt_domain_pending` (use the **aydt.nyc** logo/from‑address), ⭐ `project_register_subdomain_launch`.

**Open question:** Confirm exact logo asset + max header height against the reference emails Monique sends before finalizing. Defer fine color tuning to the Miguel session.

---

## 45. Early drop‑off opt‑in on the public registration flow — 🆕

**Tier 2 · Payments / add‑ons · Register (public + admin)**

**What happened (transcript ~16:55–17:52, action ~17:15):** Confirming the #33 add‑on default work, Ethan asked whether the early‑drop‑off **opt‑in picker** is on the public/user flow or admin‑only. Monique: **"It's definitely both — user and admin,"** and it should only appear **if the add‑on was selected in the Create Semester flow.** Ethan believes both are already wired (per #33) — this item is to **verify parity and close any gap** on the public surface.

**Required behavior:** The optional early‑drop‑off (and other optional add‑ons) opt‑in picker appears on **both** the admin checkout and the public/user registration flow, defaulting **OFF**, and **only** when the add‑on was authored for that semester/section.

**Acceptance criteria:** Author an early‑drop‑off add‑on in Create Semester → it shows as an opt‑in (unchecked) picker on the **public** register/payment step and on admin checkout; absent when not authored; selecting it threads to the server recompute and itemizes.

**Zones / likely files:** Public registration (`app/(user-facing)/register/payment/page.tsx`, `app/(user-facing)/register/actions/createRegistrations.ts`), admin CheckoutStep, `selectedAddOnIds` threading, `computePricingQuote`. **Payments zone — `epg-researcher` + `schema-and-query-explorer` before edits.**

**Related memory:** ⭐ `project_meeting_plan_33_addon_defaults` (opt‑in picker on BOTH admin CheckoutStep and user‑facing register/payment; `selectedAddOnIds` threaded; 3 harnesses exist — **this is largely a verification pass**), `project_meeting_plan_21_addons`.

**Open question:** Likely already done in #33 — confirm via the public add‑on harness before building anything; if a gap exists it's narrow.

---

## 46. Payments filter rename "Terms" → "Semesters" — ✅ DONE

**Tier 2 · Copy · Payments dashboard**

**What happened (transcript ~25:18–26:10, action ~26:02):** On the payments dashboard's semester filter dropdown the label reads **"Terms."** Ethan, live: "I know it says terms, I'll change that to **semesters**." The dropdown lists "All semesters" + each published semester (only published are payable).

**Required behavior:** The payments filter label/placeholder reads "Semesters" (matching the rest of the portal's vocabulary), not "Terms."

**Acceptance criteria:** Payments dashboard filter shows "Semesters" / "All semesters"; no remaining "Terms" copy on that surface.

**Zones / likely files:** Payments (`app/admin/payments/page.tsx` — the filter is here per grep). **Copy‑only.**

---

## 47. Failed‑payment row actions — Pay Now / Reprocess + Mark Paid — 🆕

**Tier 1 · Payments — actionability · Payments dashboard + EPG**

**What happened (transcript ~26:14–29:13, action ~28:14):** On the Transactions tab, opening a semester with a **failed/overdue payment** (Spring 2026, red) shows the overdue line with current actions **mark as paid / waive / contact** — which Ethan dislikes ("I need to fix these buttons… 'mark paid' is kind of scary — what is that actually doing?"). Monique asked: **can we charge from here?** Agreed actions:
- **Pay Now / Reprocess** — charge the balance **from this page**: use the family's **saved encrypted card** if present, or **prompt for a different card** (common cases: expired card, or family wants a different card / split a month onto another card).
- **Mark Paid** — keep, for **cash/check** received offline (but reword so it's clearly a manual reconciliation, not a charge).

**Required behavior:** From a failed/overdue payment row an admin can (a) **Pay Now/Reprocess** an actual charge via EPG (stored card or new‑card prompt) and (b) **Mark Paid** as an explicit offline reconciliation, with unambiguous button labels.

**Acceptance criteria:** Open an overdue payment → **Pay Now** charges via stored card (or prompts for a card) and updates the schedule/order on success → row clears. **Mark Paid** records an offline payment without charging, clearly labeled. Waive/contact preserved.

**Zones / likely files:** ⚠️ **Payments / EPG zone.** `app/admin/payments/page.tsx`, `app/admin/payments/actions/**` (`retryInstallmentChargeFromError.ts` already exists — likely the reprocess backbone), `utils/payment/epg.ts`, stored‑card / MIT charge path. **`epg-researcher` + `schema-and-query-explorer` REQUIRED before edits; read `docs/elavon/`.**

**Related memory:** ⭐ `project_epg_mit_3ds_unblock` (⚠️ **all stored‑card S2S charges must be `merchantInitiated`** or they decline on this 3DS account — central to Pay Now), `project_meeting_plan_19_partial` (partial/mark‑paid surfaces + Partial tab), `project_meeting_plan_07_manual_installments` (admin installment auto‑charge via HPP), ⚠️ `reference_payment_plan_type_vocab`.

**Open question:** "Pay Now" with a *new* card mid‑admin‑session — HPP redirect vs. an admin‑entered card? Given the 3DS account, an HPP redirect for new cards is safest; stored card uses the MIT S2S path. Confirm the UX (redirect away vs. inline) before building.

---

## 48. Error Log — action‑required only (suppress self‑resolved failures) — 🆕

**Tier 1 · Payments — error log design · Payments dashboard**

**What happened (transcript ~29:13–34:26, action ~26:14):** Ethan is building the **Error Log** tab (listens for transaction/recurring‑payment errors, ticket‑style, with intended auto‑tagging of who resolves). Monique's key constraint: it must be **strictly action‑based.** The common case — a parent's card declines (insufficient funds / wrong card) and they **immediately retry with another card and succeed**, leaving **no balance** — must **NOT** appear in the error log. There's nothing to fix; it can live on the **parent's profile history** but not the actionable log. (Context: parents often have 5–7 cards and retry; Active never surfaced errors at all, you had to dig into accounts.) Things that **should** log: expired card needing a notify‑email, insufficient‑funds on a **recurring/installment** charge with an outstanding balance, etc. Ethan: currently it logs **every** error — agreed to add a solution that filters to **only unresolved / balance‑bearing** errors.

**Required behavior:** The Error Log surfaces **only** errors that require admin/dev action (an outstanding balance or a stuck transaction). A failure that the family self‑resolved in the same flow (subsequent success, zero balance) is excluded from the log (still visible in profile history).

**Acceptance criteria:** Simulate decline‑then‑success in one checkout → **no** error‑log entry, balance $0, history shows both. Simulate a recurring charge that fails with a remaining balance → entry appears, taggable/actionable.

**Zones / likely files:** ⚠️ **Payments / EPG zone.** `app/admin/payments/PaymentErrorLog.tsx`, `app/admin/payments/actions/updateErrorStatus.ts` / `notifyDeveloperOfError.ts` / `retryInstallmentChargeFromError.ts`, the EPG webhook (`app/api/webhooks/epg/route.ts`) where errors are recorded. **`epg-researcher` + `schema-and-query-explorer` before edits.**

**Related memory:** `project_epg_audit_findings`, `project_payment_error_logging_preprod_loose_ends` (⚠️ set `DEVELOPER_NOTIFICATION_EMAIL` + remove TEMP webhook debug logs before prod — adjacent), `project_epg_session_resume_2026_05_19` (C3 debug‑log cleanup).

**Open question:** Resolution model — suppress at write time (don't log if a later success clears the balance) vs. log everything but **filter the view** to unresolved? Filtering the view is safer (keeps the audit trail) and matches "it can live there but isn't action‑based." Decide before building.

---

## 49. Clean‑slate DB — hard‑delete stale/duplicate semesters — 🆕

**Tier 0 · Launch logistics · DB / Seed‑scripts**

**What happened (transcript ~6:33–8:38 & 36:12, action ~6:33):** The client is starting the real **Fall 2026** build and wants no confusion from leftover test/duplicate semesters. Monique will **archive/delete** from the portal: Fall 26, Spring 26, Drop‑in May 26, Fall 25, the **duplicate Summer 26** (keep the one she created — published Jan 5 2026 is actually Spring). She'd prefer **deletion over archiving** for a "true clean space." Ethan: delete should work from the dashboard view; whatever she can only archive, he will **permanently delete from the database** so production starts clean.

**Required behavior:** After the client archives/deletes the listed semesters, Ethan hard‑deletes the residual archived ones from the DB. Optionally confirm the dashboard **delete** action fully removes a semester (vs. archive‑only).

**Acceptance criteria:** Listed stale/duplicate semesters gone from both the dashboard and the DB; the correct Summer 2026 and any live semesters untouched; no orphaned rows (classes/enrollments/pricing) left behind.

**Zones / likely files:** ⚠️ **Seed/scripts + DB.** A one‑off cleanup script (`scripts/**`) or direct DB deletes; verify cascade across `semesters` → classes/sections/pricing/enrollments. Confirm the dashboard delete path (`app/admin/semesters/page.tsx` / actions) actually deletes vs. archives.

**Related memory:** ⭐ `project_admin_ui_redesign_2026_06_17` (dashboard now lists published/draft/scheduled together; "past" = archived), ⚠️ `reference_supabase_migration_timestamp_collision` (DB hygiene).

**Gated on:** client doing the in‑portal archive/delete first. **Destructive — confirm the exact keep/delete list before running any DB delete.**

---

## 50. ACTIVE → AYDT data‑migration plan — 🆕

**Tier 0 · Launch logistics · Migration planning + Seed‑scripts**

**What happened (transcript ~35:52–36:27, action ~36:12):** With pre‑reg running on Active and AYDT ready to commit, Ethan will **start the migration of existing users/data** into the new portal. He'll **draft a plan and brief AYDT** before executing. Pairs with the agreed **~3‑year retention cutoff** (2026‑06‑08 #41) and the clean‑slate (#49).

**Required behavior:** A written, reviewed migration plan covering which data moves (families, dancers, contacts, historical enrollments within the retention window), field mapping ACTIVE → AYDT schema, the population script approach, and a dry‑run/verification step — briefed to and approved by AYDT before the real run.

**Acceptance criteria:** Plan document delivered + briefed; mapping resolves the known model gaps; a dry run loads into a scratch space and is spot‑checked against Active before the production import.

**Zones / likely files:** Seed/scripts (`scripts/**`) — the population/migration script + the existing scraper output. **Planning artifact first, code second.**

**Related memory:** ⭐ `project_active_migration_spring2026` (the scrape + model mapping + per‑enrollment fee‑scoping decision + real‑vs‑glitch gaps — **the core reference**), `project_pricing_transfer_harness` (UES Spring 2026 data‑quality gotchas), 2026‑06‑08 **#41** retention cutoff, **#38** senior‑fee anomaly (resolve as part of data cleanup).

**Open question:** Confirm the exact retention cutoff date and drop‑vs‑archive for excluded accounts (carries over from #41) before the run.

---

## 51. Infra accounts onto `admin@aydt.nyc` — 🆕

**Tier 0 · Infra / accounts · Vercel / Supabase / Resend**

**What happened (transcript ~37:35–42:45, action ~36:40):** The three production services — **Vercel** (hosting), **Supabase** (database/server), **Resend** (email) — had been created under **Natalia's personal email**. Decision: recreate/own them under the shared **`admin@aydt.nyc`** ("those are administrative things… Natalia has access to admin too"); Natalia stays the **primary contact** but the address is the admin one. Accounts were **created/confirmed live on the call** (Monique approved; codes entered for Vercel/Supabase/Resend). Ethan will finish setup and **migrate everything over**. (This is the account‑ownership step of the 2026‑06‑08 **#40** paid‑tier upgrades + **#39** domain cutover.)

**Required behavior:** Vercel, Supabase, and Resend production accounts owned under `admin@aydt.nyc`, fully set up, with the project migrated onto them; old personal‑email accounts retired. Aligns with the paid‑tier (#40) and subdomain (#39) work.

**Acceptance criteria:** All three services accessible under `admin@aydt.nyc`; project deployed/connected on the new accounts; Supabase backups on (per #40); Resend domain = **aydt.nyc** with `RESEND_FROM_EMAIL` set; Natalia's personal‑email accounts no longer in the critical path.

**Zones / likely files:** Infra/accounts + env (deploy config, Supabase project ref/keys, `RESEND_FROM_EMAIL` and allowed origins). Coordinates with **#39 (subdomain)** and **#40 (paid tiers)** from 2026‑06‑08.

**Related memory:** ⭐ `project_register_subdomain_launch`, `project_resend_aydt_domain_pending` (⚠️ verify **aydt.nyc** not `.com`; fix hardcoded `noreply@aydt.com` fallbacks — see `project_resend_from_email_fallback_sweep`), ⭐ `project_production_timeline_july1`, 2026‑06‑08 **#39 / #40**.

**Open question:** New Supabase project = fresh DB → the migration (#50) targets it; sequence #51 (accounts) → #49 (clean slate on the right DB) → #50 (import) deliberately.

---

## Confirmed working in the demo (no action)

From the #29–#41 punch list, demoed and confirmed:
- **Classes view** — search (semester / date range / discipline), enrollment fill bar, registered‑dancer list, inline add‑dancer / add‑instructor, waitlist visible when full. (Status column → #42 is the only change.)
- **#34** publish loading state + **#31** uniform save/error toasts — shown working.
- **#29** scroll fix on add‑classes screens — "fixed immediately after our meeting."
- **#35** manual‑reg auto‑populate — tagging issues fixed; prefill works.
- **#32** registration‑fee persistence + itemized line (admin + user flows).
- **#33** add‑on / fee defaults (early drop‑off OFF, reg fee ON) — only appears if authored.
- Create‑semester: confirmation + waitlist steps **merged into one Emails step** (design cleaned up).
- **#28 / #37** reserve‑at‑cart seat reservation: seat is the user's the moment they cart it; **auto‑releases** on timeout/non‑payment (~20 min); overbook race fixed; **simultaneous carts on the last spot → both waitlist** (admin sees timestamps, reaches out) — Monique: "that's exactly what we want… more foolproof."
- **#23** waitlist now collects the **full waiver** (everything except payment).
- Class tabs show **capacity + waitlist count** in one view; spot count updates live (incl. while carted).
- **EPG/Elavon** — new test suite passed; analyst reviewing (external).

## Client action items (non‑dev)

- **Archive/delete** stale + duplicate semesters in the portal (Fall 26, Spring 26, Drop‑in May 26, Fall 25, duplicate Summer 26) — unblocks **#49**.
- **Update the master tuition chart + baseline fees** (costume **$65 → $70**; tuition increase) — client‑editable, no dev change.
- **Send recent real emails** as branding reference for the email redesign — feeds **#44**.
- Approve/confirm the new‑account creations under `admin@aydt.nyc` — **done on the call** (#51).
- Waiver file(s) still outstanding (carryover from #23 / form builder).
- Confirm the **registration start date** (drives launch timing).

## Scheduling

- **Recurring meeting moved to Thursdays 11 a.m.** for the rest of the summer (office closed Fridays). Updated for "this and following events."

## External / ongoing (not code items this cycle)

- **EPG/Elavon cert** — latest test suite sent + passing; **analyst reviewing as of 2026‑06‑17**, awaiting her email. Next action is theirs.
- **Twilio A2P registration** — ongoing (resubmit cadence; carryover).

---

## Remaining work (as of 2026‑06‑24)

**To do (all 10 open):**
1. **#51** infra accounts on `admin@aydt.nyc` → then **#49** clean‑slate delete on the right DB → then **#50** migration import. Sequence matters (fresh Supabase project).
2. **#47 / #48** payments dashboard actionability — Pay Now/Reprocess + Mark Paid, and the action‑only error log. **Payments/EPG zone — agents + `docs/elavon/` first.**
3. **#42 / #46** quick UI wins (Age/Grade column; Terms→Semesters rename).
4. **#43** instructor in‑app nav + notification icon (cross‑cutting shared layout — confirm scope).
5. **#44** email branding — pivot the just‑shipped cream header to **white + condensed** + location footer; build Miguel vision board. Low priority per client.
6. **#45** verify early‑drop‑off opt‑in parity on the public flow (likely already done in #33).

**Gated on client:** #49 (client archives first), #44 (reference emails), #50 (briefing/approval + retention cutoff).
