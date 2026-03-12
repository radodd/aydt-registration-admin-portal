# AYDT — Pricing, Discounts & Coupons Architecture

### Last Updated: March 12, 2026

---

## Overview

All pricing is computed **server-side only**. The client receives a `PricingQuote` for display
purposes; the server re-computes and validates totals at batch creation time. Client-submitted
prices are never trusted.

---

## 1. Tuition Rate Bands

Admin configures division × weekly-class-count → base tuition in the **Payment → Tuition Rates**
sub-tab of the semester flow.

### Business Rules

| Division      | Weekly Class Range | Notes                                      |
|---------------|-------------------|--------------------------------------------|
| Early Childhood | 1 class           | Fixed tier                                 |
| Junior        | 1–N classes       | N = max tiers admin defines; no logic beyond |
| Senior        | 1–6 classes       | Historically never exceeded 6              |
| Competition   | Fixed program     | Handled via `special_program_tuition`      |

- If a dancer's weekly class count exceeds the defined max tier, the system does **not**
  extrapolate — the admin is expected to define all tiers they need.
- Junior + Senior mixed enrollment → resolved to Senior (higher tier).
- Early Childhood cannot be mixed with other divisions.

### DB Table: `tuition_rate_bands`

| Column                         | Type           | Notes                          |
|-------------------------------|----------------|--------------------------------|
| `semester_id`                 | uuid           |                                |
| `division`                    | text           | early_childhood, junior, senior, competition |
| `weekly_class_count`          | integer        | 1-based                        |
| `base_tuition`                | numeric(10,2)  |                                |
| `progressive_discount_percent`| numeric(5,2)   | Applied to additional classes  |
| `semester_total`              | numeric(10,2)  | Display only                   |
| `autopay_installment_amount`  | numeric(10,2)  | Display only                   |

### Special Programs

Technique, Pre-Pointe, Pointe, and Competition classes use **fixed tuition** (not rate bands).
Stored in `special_program_tuition` and configured in Payment → Special Programs.
These classes are also **exempt from the registration fee**.

---

## 2. Fee Configuration

Per-semester constants configured in **Payment → Fee Config**.

| Field                          | Default  | Notes                              |
|-------------------------------|----------|------------------------------------|
| `registration_fee_per_child`  | $40.00   | One per dancer; not discountable   |
| `family_discount_amount`      | $50.00   | Flat credit; once per family/semester |
| `auto_pay_admin_fee_monthly`  | $5.00    | Multiplied by installment count    |
| `auto_pay_installment_count`  | 5        |                                    |
| `senior_video_fee_per_registrant` | $15.00 | Senior division only             |
| `senior_costume_fee_per_class` | $65.00  | Senior division only               |
| `junior_costume_fee_per_class` | $55.00  | Junior division only               |

DB: `semester_fee_config` (one row per semester, upsert on conflict).

---

## 3. Pricing Computation Order

**File:** `app/actions/computePricingQuote.ts`

Per dancer:
1. Base tuition (rate band lookup or special program fixed price)
2. Recital fee (included in rate band; $0 for competition)
3. Senior extra fees: video ($15) + costume ($65 × weekly class count)
4. Session/class discount rules (% rules first, flat rules second)
5. Registration fee ($40; exempt for technique/pointe/competition)

Family level:
6. Sum dancer tuition → `tuitionSubtotal`
7. Family discount ($50 flat; once per family per semester; requires ≥ 2 dancers)
8. Auto-pay admin fee (if `auto_pay_monthly` plan)
9. Pre-coupon grand total
10. Coupon/promo code (see §5)
11. Final grand total
12. Payment schedule (via `buildPaymentSchedule`)

---

## 4. Threshold-Based Discounts

The **Discounts tab** in the semester flow allows admins to create and link threshold-based
discounts to a semester. These auto-apply at checkout based on rules — **no code entry by parent**.

### Categories

| Category       | Trigger                                              |
|---------------|------------------------------------------------------|
| `multi_person` | Family has ≥ N dancers enrolled in the same semester |
| `multi_session`| A dancer is enrolled in ≥ N classes per week         |
| `custom`       | Unconditional (threshold = 0)                        |

### Key Concepts

- `eligible_sessions_mode`: `"all"` → applies everywhere; `"selected"` → only when dancer is
  enrolled in one of the specified sessions.
- Rules can be `flat` (dollar amount) or `percent`.
- Percentage rules are evaluated before flat rules.
- Multiple discounts can be linked to a semester; all eligible ones apply.

### DB Tables

| Table                  | Purpose                                              |
|-----------------------|------------------------------------------------------|
| `discounts`           | Discount definition (name, category, scope)          |
| `discount_rules`      | Threshold rules (threshold, unit, value, type)       |
| `discount_rule_sessions` | Session eligibility list (when mode = selected)   |
| `semester_discounts`  | Junction: which discounts are active for a semester  |

### Admin Actions

- `app/admin/semesters/new/discounts/CreateDiscount.ts`
- `app/admin/semesters/new/discounts/UpdateDiscount.ts`
- `app/admin/semesters/new/discounts/DeleteDiscount.ts`
- `app/admin/semesters/actions/syncSemesterDiscounts.ts`

---

## 5. Coupon / Promo Code System

Added March 12, 2026. Coupons are **intentionally separate** from threshold discounts — they are
redeemed explicitly (code entry or auto-apply by date), are usage-limited, and have
admin-controlled stacking behavior.

### Two Modes

| Mode        | How it works                                                                 |
|------------|------------------------------------------------------------------------------|
| Code-based  | Parent types a code (e.g. `FALL2026`) at checkout and clicks Apply           |
| Auto-apply  | `code` column is NULL; system applies automatically when registration date falls within `valid_from` / `valid_until` window |

### Coupon Fields

| Field                  | Type           | Description                                               |
|-----------------------|----------------|-----------------------------------------------------------|
| `name`                | text           | Admin label (e.g. "Fall Early Registration")              |
| `code`                | text (unique)  | Promo code string; NULL = auto-apply                      |
| `value`               | numeric(10,2)  | Discount amount                                           |
| `value_type`          | flat \| percent |                                                          |
| `valid_from`          | timestamptz    | NULL = no start restriction                               |
| `valid_until`         | timestamptz    | NULL = no expiry                                          |
| `max_total_uses`      | integer        | NULL = unlimited                                          |
| `uses_count`          | integer        | Incremented atomically via `increment_coupon_uses()` RPC  |
| `max_per_family`      | integer        | Default 1                                                 |
| `stackable`           | boolean        | If false, skipped when threshold discounts already applied |
| `eligible_sessions_mode` | all \| selected | Restrict to specific class sessions                  |
| `is_active`           | boolean        |                                                           |

### Validation Order (server-side, inside `computePricingQuote`)

1. Coupon linked to this semester via `semester_coupons`
2. `is_active = true`
3. Current timestamp within `valid_from` / `valid_until` window
4. `uses_count < max_total_uses` (if capped)
5. This family has < `max_per_family` existing redemptions in `coupon_redemptions`
6. Session eligibility (if `eligible_sessions_mode = 'selected'`)
7. If `stackable = false`: skip if any threshold-based session discounts already applied
8. First valid coupon wins

### Application

- Coupon discount reduces the pre-coupon grand total (after all other discounts).
- Flat: deduct `value` (never below $0).
- Percent: deduct `grandTotal × value / 100`.
- Result stored in `PricingQuote.couponDiscount` + `appliedCouponName`.

### Redemption Recording

After successful `registration_batches` insert in `createRegistrations.ts`:
- Insert row into `coupon_redemptions` (coupon_id, family_id, batch_id)
- Call `increment_coupon_uses(coupon_id)` RPC to atomically increment `uses_count`
- Both steps are non-fatal (warn on failure, do not block registration)

### DB Tables

| Table                       | Purpose                                                   |
|----------------------------|-----------------------------------------------------------|
| `discount_coupons`         | Coupon definitions                                        |
| `coupon_session_restrictions` | Session eligibility list (when mode = selected)        |
| `semester_coupons`         | Junction: which coupons are available for a semester      |
| `coupon_redemptions`       | Audit trail of every family redemption                    |

### Admin UI

**Discounts step → "Promo Codes" tab** in the semester flow.

Form fields: name, code (optional), value + type, valid from/until, max total uses,
max per family, stackable toggle, session eligibility, active toggle.

Usage stats ("X / Y uses") displayed per coupon in the list.

### Checkout UI

**`app/(user-facing)/register/payment/page.tsx`**

Collapsible "Have a promo code?" section. Parent enters code → clicks Apply → quote is
re-fetched with `couponCode` passed to `computePricingQuote` → server validates and returns
updated totals. Coupon discount shown as a green line item in the breakdown.

### Key Files

| File | Role |
|------|------|
| `supabase/migrations/20260312000002_discount_coupons.sql` | DB schema + trigger + RPC |
| `app/actions/validateCoupon.ts` | Standalone validation server action (can be used independently) |
| `app/actions/computePricingQuote.ts` | Inline coupon evaluation after grand total |
| `app/(user-facing)/register/actions/createRegistrations.ts` | Records redemption after batch insert |
| `app/admin/semesters/new/discounts/createCoupon.ts` | Admin create |
| `app/admin/semesters/new/discounts/updateCoupon.ts` | Admin update (replace pattern) |
| `app/admin/semesters/new/discounts/deleteCoupon.ts` | Admin delete |
| `app/admin/semesters/actions/syncSemesterCoupons.ts` | Syncs semester ↔ coupon links on draft persist |
| `app/admin/semesters/steps/DiscountsStep.tsx` | Admin UI (Discounts + Promo Codes tabs) |

---

## 6. Type Reference (`types/index.ts`)

| Type / Interface          | Description                                              |
|--------------------------|----------------------------------------------------------|
| `DraftTuitionRateBand`   | Rate band as held in `SemesterDraft`                     |
| `DraftFeeConfig`         | Fee constants as held in `SemesterDraft`                 |
| `DraftSpecialProgramTuition` | Fixed-price program as held in `SemesterDraft`       |
| `DraftCoupon`            | Coupon as held in `SemesterDraft`                        |
| `CouponValidationResult` | Typed union (valid + coupon data, or failure reason)     |
| `PricingInput`           | Input to `computePricingQuote` (includes `couponCode?`)  |
| `PricingQuote`           | Output (includes `couponDiscount`, `appliedCouponName`)  |
| `LineItem`               | Single charge/credit line; type `"coupon_discount"` added |
| `Discount` / `HydratedDiscount` | Threshold-based discount (DB and hydrated forms)  |
| `DiscountCategory`       | `"multi_person" | "multi_session" | "custom"`            |
