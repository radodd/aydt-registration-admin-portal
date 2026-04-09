# AYDT — GTM & GA4 Integration Plan

## Meeting Prep: Nikki (SEM Performance)

---

## 1. Current State

AYDT's registration portal has **no analytics or tracking infrastructure today** — no GTM container, no GA4 property, no Google Ads conversion tags, no dataLayer. This is a clean-slate build, which is actually ideal: there's no legacy tracking to untangle or migrate.

Nikki is currently measuring SEM performance through **proxy conversions** (clicks on "Register Now" buttons). The goal is to move to **actual registration sign-ups with dynamic revenue values** so paid search ROAS can be calculated accurately.

---

## 2. My Experience: What I've Built Before

I recently completed a full GTM + GA4 integration for a Next.js 16 application (stonesuppliers.com). That project is architecturally similar to AYDT — same framework, same App Router, same SSR considerations. Here's what was delivered:

### Analytics Architecture

```
React Component --> gaEvent() --> window.dataLayer.push() --> GTM --> GA4 / Clarity / Future Tools
```

The application only talks to the `dataLayer`. GTM sits between the app and all analytics destinations. New tools (Google Ads conversion tags, Meta Pixel, A/B testing) can be added from the GTM console **without code changes or redeployment**.

### Deliverables on That Project

- **GTM container integration** — script injected via Next.js `<Script strategy="afterInteractive">` with `<noscript>` fallback, conditionally loaded via environment variable
- **Centralized analytics utility** — single `gaEvent()` function wrapping `dataLayer.push()`, SSR-safe with `typeof window` guards, race-condition-safe with `dataLayer || []` initialization
- **7 custom events tracked** — product views, cart actions, lead generation, file downloads, filter usage, form engagement
- **GA4 e-commerce schema compliance** — standard `items[]` arrays, proper `item_variant` usage, `generate_lead` as primary conversion with full cart data
- **Microsoft Clarity** — deployed via GTM community template (zero application code), free unlimited session recordings + heatmaps
- **Content Security Policy** — CSP headers configured for GTM, GA4, and Clarity domains
- **Environment-based configuration** — separate staging/production analytics without code changes
- **655-line analytics documentation** — architecture, decision rationale, GTM console setup, verification procedures, event reference

### Key Engineering Decisions

| Decision | Why |
|---|---|
| GTM over direct GA4 | Add/remove tools from GTM console without code deploys |
| `dataLayer.push()` over `gtag()` | Prevents double-counting; GTM stays the single delivery layer |
| Events fire on user intent | Filters tracked on "Apply" click, not per-checkbox; form start fires once per session |
| SSR-safe throughout | All analytics calls guard against server-side execution in Next.js |
| Idempotent tracking | `useRef` guards prevent duplicate events in React Strict Mode |

---

## 3. AYDT Integration Plan

### Phase 1 — Foundation (GTM + GA4 Base Install)

**What:** Add GTM container to the root layout, connect GA4 property through GTM, set up basic pageview tracking across all user-facing routes.

**Specifically:**
- GTM snippet in `app/layout.tsx` via `next/script` with `afterInteractive` strategy
- `<noscript>` iframe fallback
- Centralized `gaEvent()` utility (same proven pattern from stonesuppliers)
- Environment variable configuration (`NEXT_PUBLIC_GTM_ID`)
- CSP header updates in `next.config.ts`

**Estimate:** 1-2 days

### Phase 2 — Registration Funnel Events

**What:** Add `dataLayer.push()` calls at key steps in the registration flow so Nikki can see where users drop off.

**Events to track:**

| Event | Where It Fires | Business Meaning |
|---|---|---|
| `registration_started` | User reaches participant assignment page | Family began the sign-up process |
| `session_added` | User assigns a dancer to a class session | Active engagement with class selection |
| `checkout_initiated` | "Confirm & Pay" button clicked | User committed to paying |
| `registration_complete` | Confirmation page, batch status = "confirmed" | Actual completed registration (the conversion) |

**Estimate:** 1-2 days

### Phase 3 — Google Ads Conversion Tracking with Dynamic Values

**What:** Configure Google Ads conversion action, push conversion event with real dollar amounts on the confirmation page.

**Data available at conversion time:**

| Field | Source | Example |
|---|---|---|
| `value` | `registration_batches.grand_total` | $450.00 |
| `currency` | Hardcoded | USD |
| `transaction_id` | `registration_batches.id` (batch ID) | Deduplication key |
| `payment_plan` | `registration_batches.payment_plan_type` | "pay_in_full" or "installments" |

This replaces button-click proxy tracking with **confirmed registrations carrying actual revenue**. Combined with Google Ads cost data, this enables true ROAS.

**Estimate:** 1 day (assuming GTM + GA4 already in place from Phases 1-2)

### Phase 4 — Enhanced Tracking (Future / Optional)

- **Enhanced conversions** — hashed email for better cross-device attribution
- **Offline conversion import** — server-side via webhook for highest accuracy
- **GA4 e-commerce events** — full funnel reporting with standard schema
- **Microsoft Clarity** — session recordings and heatmaps (deployable via GTM, no code)

**Estimate:** TBD based on priorities

---

## 4. The Path from Proxy to Actual Conversions

| Level | What's Tracked | Value | ROAS Accuracy |
|---|---|---|---|
| **Current** | Button click | None | Low — clicks are not sign-ups |
| **Phase 2** | Confirmation page load | Static | Medium — no dollar amount |
| **Phase 3** | Confirmed registration + dollar amount | Dynamic (`grand_total`) | High — true revenue per conversion |
| **Phase 4** | Server-side offline conversion import | Dynamic + deduped | Highest — accounts for webhook delays |

**Phase 3 is the minimum needed for accurate ROAS.**

---

## 5. Friction Areas & Technical Considerations

### EPG Payment Redirect (Biggest Risk to Attribution)

AYDT's payment flow redirects users **off-site** to Elavon's hosted payment page, then back to our confirmation page. This breaks the standard client-side session:

```
Our Site (session starts) --> EPG Hosted Page (session lost) --> Our Site (new session?)
```

**Impact:** Google Ads may not attribute the conversion back to the original ad click because the session context is lost during the redirect.

**Mitigation options:**
1. **Fire conversion on the confirmation page using server-verified batch data** — the confirmation page already polls for batch status, so we fire the conversion event when the batch is confirmed. This works for most cases but attribution may be partial.
2. **Enhanced conversions** (Phase 4) — pass hashed email to Google Ads so it can stitch the conversion back to the click even across session breaks.
3. **Offline conversion import** (Phase 4) — upload conversions server-side via the EPG webhook handler, bypassing client-side attribution entirely. Most accurate but requires Google Ads API access.
4. **Cross-domain tracking in GTM** — configure the EPG domain in GTM's cross-domain settings. Depends on whether Elavon's hosted page allows GTM linker parameters in the URL (unlikely given it's a third-party payment page).

**Recommendation:** Start with option 1 (Phase 3), then layer on option 2 or 3 if attribution gaps are significant.

### Installment Plans vs. Full Pay

Some families pay in full, others pay via installments. The `grand_total` represents the total registration cost regardless of payment plan, but `amount_due_now` is what's actually charged at checkout.

**Question for Nikki:** Should the conversion value be the full registration cost (`grand_total`) or just the initial payment (`amount_due_now`)? For ROAS, `grand_total` is likely correct since it represents total revenue from that acquisition.

### Confirmation Page Timing

The confirmation page polls for batch status (the EPG webhook must fire to confirm the registration). There's a potential delay of several seconds between page load and confirmed status. The conversion event fires **only when status = "confirmed"**, not on page load — this is more accurate but means the event fires asynchronously.

### Cart Holds & Abandoned Registrations

Users have a 15-minute cart hold. If they abandon before payment, no conversion fires. This is correct behavior, but Nikki should be aware that the funnel events (Phase 2) will show the drop-off.

---

## 6. Timeline Summary

| Phase | Work | Estimate | Depends On |
|---|---|---|---|
| Phase 1 | GTM + GA4 foundation | 1-2 days | GTM container ID, GA4 measurement ID |
| Phase 2 | Registration funnel events | 1-2 days | Phase 1 complete |
| Phase 3 | Google Ads conversion + dynamic values | 1 day | Phases 1-2 complete, Google Ads conversion action configured |
| Phase 4 | Enhanced tracking | TBD | Phases 1-3 complete, priority alignment |

**Total for Phases 1-3: ~1 week of focused dev time.**

---

## 7. Account Access Alignment

### What I Need from Nikki
- **GTM container ID** (or admin access to create one)
- **GA4 measurement ID** (or editor access to create a property)
- **Google Ads conversion ID + label** (if she configures the conversion action) — OR Standard access to Google Ads to set it up myself

### What Nikki Needs from Me
- Nothing for codebase access — GTM handles the tag deployment layer
- No database or hosting access needed
- I'll provide documentation of all events and their parameters so she can configure GTM triggers and GA4 conversions

### Questions to Ask Nikki
- Does she manage Google Ads directly or through an agency?
- Is there an existing GTM container or GA4 property for AYDT?
- Who currently has admin access to these accounts?
- What's her priority timeline — when does she need ROAS reporting?
- For conversion value: `grand_total` (full registration cost) or `amount_due_now` (initial payment)?
