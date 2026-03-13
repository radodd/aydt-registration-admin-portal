# Elavon — Test Cards & Expected Responses

**Source:** https://developer.elavon.com/test-cards

**When to reference:** During sandbox development and end-to-end testing. Use these card numbers to simulate approvals, declines, 3DS challenges, and specific error scenarios.

---

> These test cards work **only in Elavon's test/sandbox environments**. They will be declined in production.

---

## Approval Test Cards

| Network | Card Number |
|---|---|
| Visa | `4000000000000002` |
| Mastercard | `5121212121212124` |
| American Express | `370000000000002` |
| Discover | `6011000000000004` |
| Diners Club | `36111111111111` |
| JCB | `3566664444444445` |

Use any future expiry date, any CVV. Standard amounts (e.g., `$100.00`) trigger approval.

---

## Decline by Amount (Last 2 Digits)

Append these cent values to any amount to trigger specific decline responses:

| Amount Suffix | Response |
|---|---|
| `.88` | Generic decline |
| `.45` | Blocked decline |
| `.72` | CVV2 mismatch decline |
| `.51` | NSF (Insufficient Funds) |
| `.54` | Expired card |
| `.78` | Invalid card — do not retry within 30 days |
| `.91` | Issuer temporarily unavailable — retry if conditions change |
| `.21` | Exceeds amount limit |
| `.13` | Amount error |

**Example:** Charge `$50.88` with a Visa test card to get a generic decline.

---

## 3D Secure 2.0 Test Cards

### Challenge Required (user must authenticate)

| Network | Card Number | Amount |
|---|---|---|
| Visa | `4580000000000000007` | `$4.00` |
| Mastercard | `5121212121212124` | `$4.00` |
| Amex | `378282246310005` | `$4.00` |

### Frictionless (pre-authenticated, no challenge)

Use standard approval cards at `$1.00`.

---

## Special Card Types

### Health Care Cards

| Network | Card Number |
|---|---|
| Visa HC | `4960040000000006` |
| Mastercard HC | `5114955555555553` |

### PINless Debit

| Network | Card Number |
|---|---|
| Visa | `4326513584466610` |
| Mastercard | `5199066005338745` |

### Dynamic Currency Conversion (DCC)

Unique card numbers provided for USD ↔ CAD, EUR, GBP, AUD, JPY conversions — request from Elavon directly.

---

## Amount-Based Response Triggers (Summary)

| Last 2 Digits | Response Type |
|---|---|
| `.00` | Standard approval |
| `.16` | Returns token data |
| `.40` | Returns PAR values |
| `.88` | Generic decline |
| `.45` | Blocked |
| `.72` | CVV decline |
| `.51` | NSF |
| `.54` | Expired |
| `.78` | Invalid (do not retry) |
| `.91` | Issuer unavailable (retry ok) |
| `.21` | Amount exceeded |
| `.13` | Amount error |

---

## Notes

- Using unlisted card numbers may produce unexpected declines in sandbox
- For physical EMV test cards, order from B2 Payment Testing Products (UL UAT USA EMV™ Test Card Set — 21 Cards)
- Always check the transaction `state` field in the response — HTTP 201 ≠ approved

---

## AYDT Test Scenarios

| Scenario | Card | Amount |
|---|---|---|
| Successful full-pay | `4000000000000002` | Any `.00` |
| Successful installment checkout | `4000000000000002` | Any `.00` |
| Declined payment | `4000000000000002` | Any `.88` |
| Insufficient funds | `5121212121212124` | Any `.51` |
| 3DS challenge | `4580000000000000007` | `$4.00` |
