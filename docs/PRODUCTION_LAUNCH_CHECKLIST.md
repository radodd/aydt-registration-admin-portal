# Production Launch Checklist — Target **July 1, 2026**

> Single-developer plan. Hard deadline. The deciding risk is **Elavon cert turnaround** (external) — keep it moving in parallel with everything below.
> Last reviewed: 2026-05-22 (estimates revised after code verification).

**How to use:** check items off as they land. Each item notes a rough estimate and the key file(s). Critical-path items (🔴) block launch; pre-launch (🟡) must be done before cutover; external (🔵) depend on third parties; quality (🟢) can follow launch.

---

## 🔴 Critical path — launch blockers

### Payments — Installments in public flow  ·  est ~2–4d
The downstream is already built (pricing schedule, `batch_payment_installments`, `createEPGPaymentSession` stored-card token capture, recurring cron). Only the front-end choice + threading is missing.
- [x] **DECIDED:** real in-app selection (pay-in-full vs installments), not Elavon-hosted-page selection. Selection must set `payment_plan_type` **before** `createEPGPaymentSession` runs.
- [x] Add plan-choice UI (pay-in-full / installments) — picker on payment page, re-prices quote on toggle
- [x] Add `paymentPlanType` to `CreateRegistrationsInput` and thread it through
- [x] Replace hardcoded `"pay_in_full"` at `createRegistrations.ts:269` (→ `computePricingQuote`, maps to `"auto_pay_monthly"`)
- [x] Replace hardcoded `"pay_in_full"` at `createRegistrations.ts:373` (→ batch `payment_plan_type` = `"installments"`)
- [x] Verify `amount_due_now` reflects first installment for installment batches — manual E2E OK (2026-05-22)
- [x] E2E: `doCapture:false` path → hostedCard token stored → cron auto-charge — manual E2E OK (2026-05-22)
- [x] Visual QA of picker — passed (2026-05-22)
- [x] Gate installments by `semester_payment_plans.type === "installments"` — picker only shows when the semester allows it (2026-05-22)
- [x] Installment count divergence resolved via Option B sync (2026-06-01) — `syncSemesterPayments` + `persistSemesterDraft` + `cloneSemester` keep `semester_fee_config.auto_pay_installment_count` aligned with `semester_payment_plans.installment_count` on save. Pricing engine untouched. Option A engine rewire deferred post-launch.
- [x] Admin `payment_plan_type` normalized to `"installments"` (was `"monthly"`) + backfill migration `20260522000001` — reporting now has one canonical value

### Registration modes — Phase 3b-ii (family-facing)  ·  est ~2–4d
Cart persistence + dual-table writes already landed (verified 2026-05-22). Remaining is finishing + hardening.
- [ ] Cart line rendering correct for tiered/drop-in (`CartPageContent.tsx`, `CartDrawer.tsx`) — see known bugs
- [ ] Confirm `ClassCard.tsx` Register button fully replaced stub `alert()` with real `add()`
- [ ] `validateEnrollment.ts` — cross-table capacity + conflict checks
- [ ] Visual QA of all three card types against seed semester

### Data integrity — class-level capacity invariant  ·  est ~2–3d
Net-new, but mirror the existing `check_session_capacity()` trigger pattern (`per_day_enrollment.sql:119-148`).
- [ ] New append-only migration: class-wide seat enforcement spanning `registrations` + `schedule_enrollments`
- [ ] Test oversell race (row-level lock) under concurrent registration

### Emails  ·  est ~2–4d combined
- [ ] Confirmation email includes `schedule_enrollments` (tiered/standard), not just drop-in
- [ ] Admin email recipient resolution merges both tables

---

## 🟡 Pre-launch checklist (before cutover)  ·  est ~3d total
- [ ] Admin login redirect by role → `/admin` (deferred until close to deploy)
- [ ] Strip EPG/Cart debug logging (the `⚠️ TEMP` / `// TODO: DELETE` / `[Cart]` lines) — C3 cleanup
- [ ] GTM/GA4 review — validate purchase event + confirmation analytics post-EPG
- [ ] Resend prod domain: verify **aydt.nyc** (not .com), set `RESEND_FROM_EMAIL`, fix hardcoded `noreply@aydt.com` fallback
- [ ] Production env vars / secrets audit
- [ ] Smoke test on prod build before announce

---

## 🔵 External / dependencies (drive in parallel — long pole)
- [ ] **Elavon production cert** — checklist items 3/4/5 (cert harness covers these). *Waiting on Justin's response to blockers after test-suite run.*
- [ ] **Converge webhook subscription** enabled in prod (batches hang in "pending" without it)
- [ ] Prod webhook subscription live by **~end of June** so UAT runs against real payments

---

## 🟢 Post-launch / quality (can follow launch)
- [ ] CartProvider streamline review (~13 consumers)
- [ ] Reports + activity feed list-merge (still hides `schedule_enrollments`)
- [ ] Cart line rendering polish (info + dollar-amount bugs)
- [ ] H2 enrollment cascade follow-up
- [ ] Profile page reads only `registrations` (punted)

---

## ✅ UAT matrix (Week of ~Jun 22)
Run every combination before sign-off:

| Mode | Pay-in-full | Installments |
| --- | --- | --- |
| Standard | ☐ card ☐ ACH | ☐ card ☐ ACH |
| Tiered | ☐ card ☐ ACH | ☐ card ☐ ACH |
| Drop-in | ☐ card ☐ ACH | ☐ card ☐ ACH |

- [ ] Recurring cron auto-charges a scheduled installment end-to-end
- [ ] Confirmation email content correct for each mode
- [ ] Failed-payment / retry path
- [ ] Coupon + credit application

---

## 🚀 Cutover (Jun 29 – Jul 1)
- [ ] Final fixes from UAT
- [ ] DB migrations applied to prod
- [ ] Domain / DNS / env confirmed
- [ ] Prod smoke test (one real registration each mode)
- [ ] **Launch**
