# EPG Integration Test Results

> Documentation of the Elavon Payment Gateway (EPG / Converge) certification
> integration tests run against the cert (UAT) sandbox: the test harness used,
> what was exercised and the results, the production issues the tests surfaced,
> the fix applied, and the questions outstanding with the Elavon analyst (Justin).
>
> **Test run date:** 2026-05-22
> **Cert (UAT) account:** `qr7c29bckjdjypkxk7gwmgbp6h29`
> **API base:** `https://uat.api.converge.eu.elavonaws.com`
> **HPP host:** `https://uat.hpp.converge.eu.elavonaws.com`
> **ACS (3DS) host:** `https://uat.acs.fraud.eu.elavonaws.com`

---

## 1. Background & goal

Elavon's integration analyst (Justin) requires a set of transactions to **exist in
the cert sandbox** so he can review them, plus answers to a few integration
questions, before AYDT can move to production. His checklist:

1. (Pre-req) Confirm AVS data is sent on Shopper creation (his April 13 flag:
   `primaryAddress` must be set so address+zip flow to tokenization and all
   stored-card charges).
2. Run a full **Flow 2** pass (stored card, stored ACH, recurring) in cert.
3. Run **void + refund** in cert (and expose them in the admin portal).
4. Run the **pre-cert smoke matrix** (approvals + declines per brand, AVS
   variations, CVV match/no-match, one timeout scenario).
5. Resolve **`customReference` vs `orderReference`**.

Much of the *code* for this already existed (hosted checkout, webhook, stored
cards/ACH, recurring cron, void/refund routes + admin UI, installment charging).
The work in this effort was to **exercise it end-to-end against the cert account**
via an automated harness, capture evidence, and surface anything broken.

### Key prior context (from project memory)

- **EPG integration phases 1–4** were previously "complete" in code.
- **Enrollment tables**: `registrations` (per-session/drop-in + public) vs
  `schedule_enrollments` (full-term admin). Not relevant to cert but noted.
- **Recurring is self-managed**, NOT EPG Plans/Subscriptions: the
  `process-overdue-payments` Supabase edge function does its own
  `POST /transactions` against stored cards/ACH on a schedule. Justin must be
  told this in the Solution Statement.
- **Webhook gotcha**: if the Converge notification subscription is disabled,
  batches hang at `pending` and no `[EPG WEBHOOK]` log appears. Endpoint/code are
  fine — re-enable in the Converge portal.

---

## 2. The test harness

Lives entirely in `tests/e2e/epg-cert/`. Playwright-driven; gated behind the
`EPG_CERT_RUN` env var so a normal `playwright test` / CI run skips it.

### Files

| File | Purpose |
| --- | --- |
| `scenarios.ts` | Brand-aware test-host value tables (decline cents, AVS postals, CVV values) sourced from the Elavon STP Test Host PDF. Scenario builders. |
| `harness.ts` | Core infra: env/clients, `preflight`, HPP automation (`fillHostedCardPage`), 3DS (`complete3dsChallenge`), polling (`waitForSessionTransaction`, `waitForHostedToken`, `pollBatchStatus`, `pollPaymentState`), DB snapshot, JSON capture, assertions, plus test-only EPG helpers (`createCertShopper`, `createCertSession`). |
| `setup.ts` | Drives the **real public registration UI** (sign in → cart → participants → payment → HPP) to create a batch for the pay-in-full end-to-end test. |
| `matrix.cert.spec.ts` | Pre-cert smoke matrix (item 5) — direct EPG orders with controlled amounts → HPP → assert. |
| `avs.cert.spec.ts` | AVS Y/Z/A/N via stored-card charges (HPP has no billing field). **Currently `test.skip` — blocked on the MIT/3DS question.** |
| `flow2.cert.spec.ts` | Pay-in-full (real UI), stored card + installments, void, refund. **Stored-card/void/refund are `test.skip` — blocked on MIT/3DS.** |
| `discover.cert.spec.ts` | Throwaway diagnostics: dumps HPP card fields and registration-UI controls. Used to map selectors. |
| `capture/` | Per-run JSON artifacts (gitignored). One file per scenario: expected vs observed, raw EPG transaction, DB snapshot. |
| `README.md` | Quick-start, prerequisites, env, run commands. |
| `DETAIL.md` | This file. |

### Why a hybrid execution model

Two tensions forced a split between "real UI" and "direct API":

1. **Amount control** — the decline-cents matrix needs the charge to end in a
   specific cents value (`X.51` → NSF, etc.). The real registration UI computes
   the amount from seeded pricing and the server re-validates it
   (`createEPGPaymentSession` rejects mismatches), so it can't hit arbitrary
   cents. → matrix uses **direct EPG orders** with chosen amounts.
2. **Installment batches** — the stored-card path needs `doCapture:false`, which
   only fires for `payment_plan_type === "installments"`. But the public flow
   **hardcodes `pay_in_full`** (`createRegistrations.ts`), so the UI can't make
   an installment batch. → stored-card/recurring legs use **direct orders**.

So: pay-in-full → real UI; matrix + stored-card/void/refund → direct orders.

### Environment (`.env.local`)

```
EPG_BASE_URL=https://uat.api.converge.eu.elavonaws.com
EPG_MERCHANT_ALIAS=...                 # API basic-auth user
EPG_SECRET_KEY=...                     # SECRET key (sk_...), NOT a public pk_ key
EPG_WEBHOOK_USERNAME=...               # must match the Converge subscription
EPG_WEBHOOK_PASSWORD=...
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...          # service role (test-only; bypasses RLS)
SITE_URL=https://<public-tunnel>       # ngrok etc. — callbacks + webhook target
CERT_USER_EMAIL=...                    # seeded family w/ complete address + a dancer (real-UI test only)
CERT_USER_PASSWORD=...
CERT_SEMESTER_ID=...                   # published semester w/ an open session (real-UI test only)
```

> `CERT_USER_*` and `CERT_SEMESTER_ID` are **app/Supabase** credentials (a family
> account in our DB the harness logs in as) — NOT Elavon credentials. They're only
> needed by the real-UI pay-in-full test and the registration-UI discovery dump.
> The matrix, stored-card, void, refund, and HPP discovery need only `EPG_*` +
> `SITE_URL`.

### Running

```bash
# Discovery (map HPP selectors)
EPG_CERT_RUN=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 \
  npx playwright test tests/e2e/epg-cert/discover.cert.spec.ts --headed -g "dump HPP card fields"

# Single scenario
EPG_CERT_RUN=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 \
  npx playwright test tests/e2e/epg-cert/matrix.cert.spec.ts -g "approve-visa" --reporter=list

# Full matrix (sequential, ~18 min, ~40 cert transactions)
EPG_CERT_RUN=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 \
  npx playwright test tests/e2e/epg-cert/matrix.cert.spec.ts --workers=1 --reporter=list
```

- `EPG_CERT_RUN=1` un-gates the cert specs (otherwise they `test.skip`).
- `PLAYWRIGHT_BASE_URL=...` stops Playwright from auto-spinning `npm run dev`
  (the matrix/stored-card tests navigate directly to Elavon's HPP, not localhost).
- `--workers=1` runs sequentially so cert transactions don't interleave.
- Chromium must be installed once: `npx playwright install chromium`.

---

## 3. How the EPG hosted flow actually works (discovered live)

The repo docs were thin and partly wrong; the following was confirmed against the
live cert HPP via the discovery spec.

### Order → session → HPP

1. `POST /orders` (amount, currency, description, customReference=orderReference).
2. `POST /payment-sessions` (order href, `hppType: fullPageRedirect`, returnUrl,
   cancelUrl, `doCreateTransaction`, `doCapture`, `doThreeDSecure`,
   customReference). Returns `url` (the HPP redirect) + `href`.
3. Redirect the browser to `session.url`.

### The hosted page (uat.hpp.converge.eu.elavonaws.com)

It's a **MUI single-page app** (hashed `sc-*` / `Mui*` classes are unstable — key
off stable `name`/`id`). It **opens on a payment-type chooser** for sales
(`doCapture:true`), and shows the card form **directly** for tokenization
(`doCapture:false`).

| Field | Selector | Notes |
| --- | --- | --- |
| Payment type | `input[name='paymentTypeSelector']` | Two radios (card/ACH); select first = card. Absent on `doCapture:false`. |
| Name on card * | `input[name='holderName']` (`#qa_card_holder_name`) | required |
| Card number * | `input[name='cardNumber']` (`#qa_cc_section`) | `type=tel`, masked — **type, don't `.fill()`** |
| Expiry (MM/YY) * | `input[name='expiryDate']` (`#qa_expiryDate_section`) | masked; type digits `MMYY` |
| Security code * | `input[name='securityCode']` (`#qa_secCode_section`) | masked |
| **Email *** | `input[name='shopperEmailAddress']` (`#shopperEmailAddress`) | **required** — easy to miss |
| Submit | `button#qa_submit_payment` | text "PAY" |
| Cancel | `button#qa_cancel_payment` | |

> **There is NO billing address / ZIP field on the HPP.** Confirmed: a HPP sale
> returns `verificationResults.addressPostalCode = "unprovided"`. AVS therefore
> **cannot** be driven through the hosted page — it must come from a Shopper's
> `primaryAddress` on a stored-card charge.

### 3DS (the account enforces it)

This processor account **enforces 3DS on all ecommerce sales**. With
`doThreeDSecure:false`, every sale auto-declines with failures
`["declinedByGateway", "3dsEnforcedOnEcommerceSales"]`. So **`doThreeDSecure` must
be `true`.**

After clicking PAY:
1. A **3DS method/fingerprint iframe** loads silently:
   `uat.acs.fraud.eu.elavonaws.com/acs/method/VISA?...` (no UI).
2. Then a **challenge iframe**: `uat.acs.fraud.eu.elavonaws.com/acs/challenge/VISA`
   containing the simulator control:
   - `select#transStatus` — options `"Y" - Success` (value `Y`) / `"N" - Not Auth` (value `N`)
   - `input#challengeData`
   - `<a>Continue</a>` and `<a>Cancel Challenge</a>` links

   **To pass authentication: just click "Continue".** The simulator defaults to
   Success. **Do NOT fill `challengeData` or re-select the dropdown** — doing so
   pushed it into a failure path and the transaction never completed (this cost
   real debugging time). `complete3dsChallenge()` only touches the dropdown when
   explicitly simulating a 3DS *failure*.

### Reading the result

- The HPP sale's transaction lands in **`session.previousTransactions[]`**, NOT
  `session.transaction` (which stays `null`). `waitForSessionTransaction()` polls
  the session and returns `previousTransactions[last]`.
- The returnUrl redirect **does not reliably fire** under automation (ngrok-free's
  interstitial blocks it), so we never depend on it — we poll the session.
- **EPG returns HTTP 201 even on decline.** Always assert on `state` /
  `isAuthorized`, never the HTTP status. `assertAuthResult()` enforces this.

---

## 4. Test-host control values (Elavon STP Test Host PDF, Rev 6/4/2025)

Three **independent dials** on one transaction. Encoded in `scenarios.ts`,
**brand-specific**.

- **Auth result** ← the **cents** of the amount (e.g. `12.51` → NSF on Visa).
- **AVS result** ← the **first character of the billing postal code**
  (`2…`→Y, `3…`→Z, `6…`→A, `4…`→N on Visa; or a postal starting with the target
  letter forces it on all brands). UPPERCASE only.
- **CVV result** ← the **CVV value** (last digit `1`→match, `2`→no-match; Amex
  CID is 4 digits). Leading zeros/spaces force no-match.

### Approval cards (per brand)

| Brand | PAN |
| --- | --- |
| Visa | `4000000000000002` |
| Mastercard | `5121212121212124` |
| Amex | `370000000000002` |
| Discover | `6011000000000004` |

### Decline cents (Justin's set), brand-specific meaning

| Cents | Visa | Mastercard | Amex | Discover |
| --- | --- | --- | --- | --- |
| `.51` | NSF | NSF | DECLINED | DECLINED |
| `.54` | Expired | Expired | Expired | Expired |
| `.55` | Incorrect PIN | Incorrect PIN | Incorrect PIN | Incorrect PIN |
| `.59` | Suspected Fraud | DECLINED | DECLINED | Suspected Fraud |
| `.78` | Invalid Card | Invalid Card | Invalid Card | Invalid Card |
| `.91` | Please Retry 5305 | Issuer Unavail | Issuer Unavail | Call Auth Center |
| `.96` | System Error 96 | System Error 96 | Network Error 70 | System Error 96 |

### Timeout

`$22.22` = "host processes, response blocked" (the partial-write / async-failure
case). **Gated off** (`TIMEOUT.gatewayConfirmed=false`): the STP doc scopes the
dollar-amount timeout controls to the **certgate.viaconex.com** gateway, not
EPG/Converge. **Open question for Justin.**

---

## 5. Results — what passed in the cert sandbox

### Smoke matrix: 40/40 PASSED (≈18 min, single worker)

- **4 brand approvals** → `state: captured`, `isAuthorized: true`, authorization
  code present.
- **28 declines** (Visa/MC/Amex/Discover × `.51/.54/.55/.59/.78/.91/.96`) →
  `state: declined`, failures `["declinedByIssuer"]` (note: **`declinedByIssuer`,
  not `3dsEnforced`** — confirming 3DS passed and the *gateway* declined on the
  cents, exactly as intended).
- **8 CVV** (4 brands × match/no-match):
  - match → `verificationResults.securityCode = "matched"`
  - no-match → `securityCode = "unmatched"`, still `captured`/authorized (a CVV
    mismatch flags but does not hard-decline on this account).

Artifacts: `tests/e2e/epg-cert/capture/*.json` (one per scenario; includes the
raw EPG transaction object).

### Full HPP + 3DS automation proven

Order → payment-type radio → card form (incl. required email) → PAY → 3DS method
→ 3DS challenge (click Continue) → transaction in `previousTransactions[]` →
GET + assert. Works for all four brands.

---

## 6. Findings — production bugs surfaced by cert testing

These are **real production-code issues**, not harness bugs. They live in the
Payments zone (`utils/payment/epg.ts` + callers). Several have never manifested
because the stored-card/installment path isn't wired into the public flow.

### #1 — `billTo` → `primaryAddress`  ✅ FIXED (uncommitted)

- The live `/shoppers` API **rejects `billTo`**: `"Unrecognized field name:
  'billTo'"`. Also rejects `billingAddress` and `address`.
- **`primaryAddress` → 201 OK** (address echoed back). This is **exactly Justin's
  April 13 flag** ("primaryAddress needed on the Shopper").
- Production `createEpgShopper` was sending `billTo`. The repo doc
  `docs/elavon/api_shoppers.md` also (wrongly) shows `billTo`.
- **Fix applied:** `utils/payment/epg.ts` `createEpgShopper` param + request body
  now use `primaryAddress`; the one caller `app/api/webhooks/epg/route.ts`
  (~L427) updated to pass `primaryAddress`. Type-clean, **not committed**.

### #2 — Stored-card setup consumes the hosted-card token (`doCreateTransaction`)

- `createEpgPaymentSession` hardcodes `doCreateTransaction: true`. With that, the
  `hostedCard` token returned by a `doCapture:false` session is **consumed by the
  auth and 404s** — `POST /stored-cards` then fails: *"the hosted card referenced
  either does not exist or has expired."*
- Pure tokenization needs `doCreateTransaction: false` (proven: with it false,
  the token persists and `POST /stored-cards` succeeds).
- **But** production deliberately uses `true` to charge installment-1 **and**
  store the card in one go. So this isn't a simple flip — the correct
  "auth + store" flow is entangled with #3. **Not fixed; needs Justin's guidance.**
- Also discovered: the API returns `session.hostedCard` as a **bare string href**,
  not the `{ href }` object the `EpgPaymentSession` type (and the webhook's
  `session.hostedCard?.href`) assume. Latent bug in production's reader.

### #3 — S2S recurring charges are declined by 3DS (no MIT flag)  🚧 GATING

- Server-to-server stored-card charges (installments / the recurring cron) are
  declined `3dsEnforcedOnEcommerceSales` — the account enforces 3DS, and the
  charge isn't flagged as a **merchant-initiated (MIT) recurring** transaction.
- `createEpgTransaction` sets neither `shopperInteraction` nor any MIT field.
- **Probe results** (one stored card, many charge bodies) — proving there is **no
  per-transaction flag** available in this API:

  | Body | Result |
  | --- | --- |
  | `shopperInteraction: "ecommerce"` | 201 **declined** — `3dsEnforcedOnEcommerceSales` |
  | `shopperInteraction: "moto"` | 400 — enum rejects `moto` |
  | `shopperInteraction: "continuousAuthority"` | 400 — enum rejects |
  | `shopperInteraction: "installment"` | 400 — enum rejects |
  | `shopperInteraction: "unscheduled"` | 400 — enum rejects |
  | `shopperInteraction: "recurring"` | 400 — enum rejects |
  | `shopperInteraction: "merchant"` | 400 — enum rejects |
  | `credentialOnFile: {...}` | 400 — "Unrecognized field name: 'credentialOnFile'" |
  | `merchantInitiated: true` | 400 — unrecognized |

  Only `ecommerce` is a valid transaction `shopperInteraction`, and it forces 3DS.
  So MIT exemption must be **account configuration** or require **carrying stored
  3DS authentication data** from a 3DS-authenticated setup. **Needs Justin.**

  > Note: `shopperInteraction` (`recurring`/`installment`) and
  > `credentialOnFileType` ARE valid on **stored-card creation**
  > (`POST /stored-cards`) — they're just not accepted on the **transaction**.

- **Blast radius:** blocks AVS-via-stored-card, Flow 2 stored card/installments,
  void, refund — **and the production `process-overdue-payments` recurring cron**
  would fail the same way on a 3DS-enforcing account.

### #4 — Installments not wired into the public registration flow (prior finding)

- `createRegistrations.ts` hardcodes `payment_plan_type: "pay_in_full"`; nothing
  sets `"installments"`. So the family-facing installment plan the payment page
  advertises ("choose an installment plan on the next page") **isn't implemented**
  end-to-end. Out-of-zone discovery — flagged, not fixed. Confirm intent pre-launch.

---

## 7. Harness helpers added to work around the findings

In `harness.ts` (test-only; do not confuse with production):

- `createCertShopper({ ..., primaryAddress })` — POSTs `/shoppers` with the
  correct `primaryAddress` field (bypasses the production bug; now also fixed in
  prod via #1).
- `createCertSession({ ..., doCreateTransaction, doThreeDSecure, doCapture })` —
  session creation with full control over `doCreateTransaction` (production
  hardcodes `true`); used to obtain a non-consumed hosted-card token.
- `waitForHostedToken(sessionHref, "card"|"ach")` — polls for the hosted token,
  which only appears after 3DS completes; normalizes the string-or-object shape.
- `waitForSessionTransaction(sessionHref)` — polls `previousTransactions[]`.
- `complete3dsChallenge(page, { success })` — clicks Continue on the ACS challenge
  (only touches the dropdown for the failure case).
- `fillHostedCardPage(page, scenario)` — full HPP card entry incl. payment-type
  radio, masked fields, required email, submit, and 3DS.

---

## 8. Cert checklist status

| Item | Status | Notes |
| --- | --- | --- |
| 2 — AVS `primaryAddress` on Shopper | ✅ Code fixed (uncommitted) | Field proven via live API; AVS result verifiable once #3 unblocks stored-card charges |
| 5 — Smoke matrix: approvals | ✅ 4/4 in cert | |
| 5 — Smoke matrix: declines | ✅ 28/28 in cert | brand × `.51/.54/.55/.59/.78/.91/.96` |
| 5 — Smoke matrix: CVV match/no-match | ✅ 8/8 in cert | match→matched, no-match→unmatched |
| 5 — AVS Y/Z/A/N | 🚧 Blocked (#3) | setup works; S2S charge declined by 3DS |
| 5 — `$22.22` timeout | ⬜ Gated | certgate-only per STP doc — confirm w/ Justin |
| 3 — Flow 2 stored card / installments | 🚧 Blocked (#2 + #3) | |
| 3 — Stored ACH | ⬜ Not automated | ACH hosted-page selectors not yet mapped (`test.skip`) |
| 3 — Recurring | ⬜ Self-managed cron | tell Justin (no Plans/Subscriptions); cron itself blocked by #3 |
| 4 — Void / refund | 🚧 Blocked (#3) | code exists; needs a chargeable txn to act on |
| Pay-in-full (real UI) | ⬜ Untested | needs seeded `CERT_USER_*` + `CERT_SEMESTER_ID` |
| 6 — `customReference` vs `orderReference` | ⬜ Open | confirm w/ Justin |

---

## 9. Open questions for Justin (critical path)

See `justin-response.md` for the full message. Summary:

1. **MIT / 3DS exemption (the blocker):** how should server-to-server
   recurring/installment charges be flagged or the account configured so they're
   exempt from 3DS? No per-transaction field works (see §6 #3).
2. **Stored-card setup config:** recommended session config to obtain a reusable
   hosted-card token while charging installment-1 (or the correct two-step "store
   then charge")? `doCreateTransaction:true` consumes the token.
3. **`primaryAddress` confirmation + AVS:** confirm `primaryAddress` is the field
   (docs say `billTo`), and that AVS responses flow from the Shopper's
   `primaryAddress` on stored-card charges.
4. **`$22.22` timeout:** do the dollar-amount timeout controls apply to EPG hosted
   checkout / the Converge API, or only the certgate.viaconex.com gateway?
5. **`customReference` vs `orderReference`:** which does the analyst expect for
   reconciliation? (In UAT, EPG drops `customReference` onto the transaction's
   `orderReference`; our webhook already falls back across both.)

---

## 10. Not yet tested / outstanding

Test scope that was built but could not be completed in this run:

1. **AVS Y/Z/A/N, Flow 2 stored card/installments, void, refund** — all gated on
   the MIT/3DS question (§6 #3). The setup paths (session → token → shopper →
   stored card) are validated; only the server-to-server charge is blocked.
2. **Stored ACH** — not automated; the ACH hosted-page selectors weren't mapped
   (the `doCapture:false` ACH form needs a discovery pass). Test is `test.skip`.
3. **Pay-in-full via the real registration UI** — not run; needs a seeded cert
   family (`CERT_USER_*`) and `CERT_SEMESTER_ID`.
4. **`$22.22` timeout** — gated pending confirmation it applies to EPG (§4).
5. Production fixes #2 (stored-card setup config) and the `hostedCard` string
   shape are deferred until the MIT/3DS approach (#3) is settled.

> Reminder: re-verify the **Converge notification subscription** is enabled
> before any run that depends on the webhook (pay-in-full / batch confirmation).

**Commit status:** nothing in this effort has been committed. The only production
change made is the #1 `billTo`→`primaryAddress` fix in `utils/payment/epg.ts` +
`app/api/webhooks/epg/route.ts`.
