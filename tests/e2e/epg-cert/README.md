# EPG Certification Harness

Playwright-driven harness that runs the **full EPG flow** against the Elavon
**CERT (UAT)** account so the certification analyst sees real transactions in
the sandbox. Covers Justin's checklist items 3 (Flow 2), 4 (void/refund), and
5 (pre-cert smoke matrix).

> **Scope:** lives entirely under `tests/e2e/epg-cert/`. It *reads* the EPG
> client and webhook contracts but does not modify production payment code.

## What it does

For each scenario: create order/session → redirect to the Elavon Hosted
Payment Page → Playwright fills the card → webhook fires → poll
`/api/register/batch-status` → snapshot the DB → write a JSON artifact to
`./capture/` (gitignored).

## Files

| File | Purpose |
| --- | --- |
| `scenarios.ts` | The cents/AVS/CVV matrix, **brand-aware**, sourced from the Elavon STP Test Host doc (Rev 6/4/2025). |
| `harness.ts` | Preflight, HPP automation, batch-status / payment-state polling, DB snapshot, JSON capture, assertions. |
| `setup.ts` | Creates the prerequisite batch + session and returns the HPP URL. *(see batch-setup strategy)* |
| `*.cert.spec.ts` | Flow 2 (stored card/ACH + installments + void/refund) and the smoke matrix. |
| `capture/` | Per-run JSON artifacts (gitignored). |

## Prerequisites (all external)

1. **Dev server running** with a **publicly reachable HTTPS** `SITE_URL` so EPG
   can redirect back and POST the webhook (use a tunnel locally).
2. **Converge notification subscription ENABLED** in the merchant portal, with
   the webhook URL + Basic-auth creds configured. If it's off, batches hang at
   `pending` and the harness fails fast on the poll timeout.
3. A **cert test user with a complete address** (`address_line1`, `city`,
   `state`, `zipcode`) so AVS data flows onto the Shopper (checklist item 2).

## Env (`.env.local`)

```
EPG_BASE_URL=https://uat.api.converge.eu.elavonaws.com
EPG_MERCHANT_ALIAS=...
EPG_SECRET_KEY=...                 # SECRET key, not a public pk_ key
EPG_WEBHOOK_USERNAME=...           # must match the portal subscription
EPG_WEBHOOK_PASSWORD=...
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SITE_URL=https://<public-tunnel>   # callbacks + webhook target
CERT_USER_EMAIL=...                # seeded family/parent (complete address + a dancer)
CERT_USER_PASSWORD=...
CERT_SEMESTER_ID=...               # published semester with an open session
```

## Running

Cert specs are gated behind `EPG_CERT_RUN` so a plain `playwright test` / CI
run skips them. To run:

```bash
EPG_CERT_RUN=1 npx playwright test tests/e2e/epg-cert --headed
```

Run **headed** the first time — the Elavon hosted-page field selectors aren't
documented and may need confirming against the live page (see the SELECTORS
note in `harness.ts`). Artifacts land in `tests/e2e/epg-cert/capture/`.

## Scenario values (from the Elavon STP Test Host doc)

Three independent dials on one transaction:

- **Auth** ← amount **cents**. Brand-specific (see `DECLINE_CODES`). Justin's
  set: `.51 .54 .55 .59 .78 .91 .96`.
- **AVS** ← **first character of the billing postal code**. `Y/Z/A/N` via the
  per-brand `AVS_POSTAL` table. Use UPPERCASE.
- **CVV** ← the **CVV value**. Last digit `1` → match, `2` → no-match
  (Amex CID = 4 digits).

### ⚠️ Timeout scenario is gated

`$22.22` forces "host processes, response blocked" — the partial-write case.
But the STP doc scopes the dollar-amount timeout controls to the
**certgate.viaconex.com** gateway, **not** EPG/Converge. Confirm with Justin
whether EPG honors it; until then `TIMEOUT.gatewayConfirmed = false` keeps the
scenario from running.

## Hybrid execution model (why some legs bypass the UI)

- **Pay-in-full** runs through the **real registration UI** (`setup.ts`) for a
  true end-to-end pass that confirms a batch.
- **Decline-cents matrix** uses **direct EPG orders** with chosen amounts —
  the real UI can't control the charge amount (it comes from seeded pricing).
- **Stored card/ACH + void/refund** use **direct orders** because the public
  registration flow hardcodes `pay_in_full` ([createRegistrations.ts](../../../app/(user-facing)/register/actions/createRegistrations.ts)) and never
  produces an `installments` batch — so `doCapture:false` can't be reached via
  the UI. ⚠️ This looks like the installment/stored-card plan is **not wired
  into the public flow**; flag for the team (separate from cert).

## Live-confirm seams (verify on first headed run)

- **HPP card fields** (`harness.ts` `fillHostedCardPage`) — Elavon hosted-page
  selectors aren't documented.
- **Cart-add / dancer-assignment** (`setup.ts`) — public UI has no test ids;
  the assignment control is a best-effort locator.
- **ACH hosted-page fields** — not yet automated; the stored-ACH test is
  `test.skip` until selectors are pinned.
- **Refund timing** — refunds need the original *settled*; sandbox settlement
  is batched, so the refund leg may need a delayed re-run.

## Open items to confirm with Justin

1. Do the dollar-amount **timeout** controls apply to EPG hosted checkout, or
   only certgate? (gates the partial-write test)
2. `customReference` vs `orderReference` — which field the analyst expects for
   reconciliation.
