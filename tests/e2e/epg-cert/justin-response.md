# Draft response to Justin

> Draft — review before sending. Tone: progress update + specific technical
> questions. Edit greeting/sign-off and trim as needed.

---

**Subject:** AYDT EPG certification — sandbox progress + a few integration questions

Hi Justin,

Quick update on where we are with the EPG integration, and a handful of questions
where I'd appreciate your guidance before we go further.

## What's working in the cert sandbox

We built an automated harness that drives the full hosted-checkout flow against
our cert account (`qr7c29bckjdjypkxk7gwmgbp6h29`) and have successfully exercised
the pre-cert smoke matrix end-to-end — these transactions are now in the sandbox
for your review:

- **Approvals** on Visa, Mastercard, Amex, and Discover → captured.
- **Declines** across all four brands for the cents codes `.51, .54, .55, .59,
  .78, .91, .96` → each declined at the issuer as expected.
- **CVV match and no-match** on all four brands → CVV results returned correctly
  (`matched` / `unmatched`); no-match still authorizes, as anticipated.
- The full **3DS flow** (method + challenge via the ACS simulator) is being
  completed automatically, and we confirmed the account enforces 3DS on ecommerce
  sales (transactions with 3DS disabled are declined `3dsEnforcedOnEcommerceSales`,
  which is what we'd expect).

We also confirmed the AVS field issue you raised back in April — see question 3.

## Where we're blocked — and what we need from you

### 1. (Most important) 3DS exemption for merchant-initiated recurring charges

Our installment plans are billed via **server-to-server `POST /transactions`
against a stored card** on our own schedule (we're not using EPG
Plans/Subscriptions — we manage the cron ourselves; happy to discuss if you'd
prefer otherwise).

The problem: because the account enforces 3DS on ecommerce sales, these
back-end stored-card charges are also being declined with
`3dsEnforcedOnEcommerceSales`. We tried to flag them as merchant-initiated /
recurring on the transaction, but none of the values we'd expect are accepted:

- `shopperInteraction` rejects `recurring`, `merchant`, `moto`,
  `continuousAuthority`, `installment`, and `unscheduled` — only `ecommerce`
  is accepted, and that's what triggers the 3DS requirement.
- There is no `credentialOnFile` / `merchantInitiated` field on the transaction
  (both return "Unrecognized field name").

**How should we structure a merchant-initiated recurring/installment charge so
it's exempt from 3DS?** Is this a per-transaction field we're missing, a stored
3DS-authentication value we need to carry forward from the initial
(cardholder-present) transaction, or an account-level configuration on your side?
This blocks our entire recurring-billing path, so it's our top priority.

### 2. Stored-card setup: obtaining a reusable hosted-card token

For installments we create a payment session with `doCapture: false` to get a
`hostedCard` token, then attach it to a Shopper via `POST /stored-cards`. But when
the session also has `doCreateTransaction: true` (so we can charge the first
installment), the hosted-card token appears to be consumed by the authorization
and then 404s — `POST /stored-cards` fails with *"the hosted card referenced
either does not exist or has expired."* With `doCreateTransaction: false` the
token persists and storage succeeds.

**What's the recommended session configuration to both (a) authorize/charge the
first installment and (b) retain a reusable stored card?** Or is the expected
pattern a two-step "store the card, then charge it server-to-server" (which loops
back into question 1)?

### 3. Confirming the AVS field (`primaryAddress`)

You'd flagged in April that `primaryAddress` needs to be set on the Shopper so
address + ZIP flow to AVS. We confirmed this directly: the `/shoppers` API
**rejects `billTo`** ("Unrecognized field name") and **accepts `primaryAddress`**.
We've updated our Shopper creation to send `primaryAddress`.

**Can you confirm (a) `primaryAddress` is the correct field, and (b) that AVS
results will be returned on subsequent server-to-server stored-card charges based
on the Shopper's `primaryAddress`** (i.e., we don't need to pass address on each
charge)? We weren't able to verify the AVS response yet because those charges are
currently blocked by question 1.

### 4. Timeout test scenario applicability

Your checklist included a timeout scenario (e.g. `$22.22`). The STP Test Host
documentation notes that the dollar-amount timeout controls apply to requests
through the **certgate.viaconex.com** gateway, with additional development needed
for other gateways. **Do these timeout controls apply to transactions made
through the EPG hosted checkout / Converge API, or only certgate?** If they don't
apply to our path, what's the recommended way to validate our handling of a
processed-but-no-response (partial-write) scenario?

### 5. `customReference` vs `orderReference`

This was still open from earlier. We currently set both to our internal batch ID
on the order. We've also noticed that in UAT the `customReference` we send appears
on the resulting transaction's `orderReference` rather than its `customReference`.

**Which field do you/your reconciliation tooling expect us to use as the merchant
reference, and is the `customReference` → `orderReference` behavior expected?**

## Next steps on our side

Once we have direction on #1 and #2, we can complete the Flow 2 pass (stored card
+ stored ACH + installments), run void and refund against the cert account, and
finish the AVS variations — all of which are built and ready to run, just gated on
the 3DS/MIT question.

Thanks very much — happy to hop on a call if that's easier for the recurring/3DS
piece.

Best,
[Name]
