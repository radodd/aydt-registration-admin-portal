# Elavon Payment Gateway — API Reference

**Source:** https://developer.elavon.com/products/elavon-payment-gateway/v1/api-reference
*(OpenAPI spec available at the same URL)*

**When to reference:** Any time you are making a direct API call to EPG — creating orders, payment sessions, transactions, shoppers, stored cards, plans, subscriptions, etc. This is the canonical reference for all endpoints, fields, and error codes.

---

## General Characteristics

- HTTP REST API
- Accepts and returns **JSON** (UTF-8)
- Case insensitive where case is irrelevant; uses coercion
- Supports **HATEOAS** — resources link to related resources via `href` fields
- Requires **TLS 1.2 or higher**
- Sensitive fields suppressed in responses for security

## Authentication

Two types of API keys:

### Public API Key (`pk_*`)
- Safe for client-side code
- Limited to **hosted card operations only**
- Some response fields suppressed

### Secret API Key (`sk_*`)
- **Server-side only — never expose in client code**
- Accepted for all request types
- Used as the password in HTTP Basic auth

**Auth format:** HTTP Basic — `base64(merchantAlias:secretKey)`

## Error Handling

Standard JSON error response with a `failures` array.

| HTTP Code | Meaning |
|-----------|---------|
| 400 | `badRequest` — Invalid request |
| 401 | `unauthorized` — Valid API key required |
| 403 | `forbidden` — Public keys limited to hosted cards |
| 404 | `notFound` — Resource doesn't exist |
| 429 | `tooManyRequests` — Rate limit exceeded |

## Standard Operations

| Operation | Method | Status Code |
|-----------|--------|-------------|
| Create | POST | 201 Created |
| Retrieve | GET | 200 OK |
| List | GET | 200 OK |
| Update | POST `/{id}` | 200 OK |
| Delete | DELETE | 204 No Content |

> For HTTP clients that don't support DELETE, use `POST` with `X-HTTP-Method-Override: DELETE` header.

## Resource Groups

| Group | Resources |
|---|---|
| Hosted Payments | Orders, Payment Sessions, Hosted ACH Payments |
| Payment Links | Payment Links, Payment Link Events |
| Advanced Payments | Hosted Cards, Transactions |
| Shoppers | Shoppers, Stored Cards, Stored ACH Payments, Payment Method Links/Sessions |
| Wallets | Apple Pay, Google Pay, Paze Payments |
| Recurring | Plans, Subscriptions |
| Account Management | Merchants, Processor Accounts, Terminals, Accounts, Batches |

## Pagination & Filtering

**Pagination:**
- Default: 10 items per page; max 200
- Use `?limit=N` query param to override

**Filtering:**
- Format: `?filter=fieldName_operator_value`
- Operators: `eq`, `ne`, `gt`, `ge`, `lt`, `le`, `like`, `in`, `contains`, `is`, `isnot`

## Data Formats

- **Resource ID:** Unique opaque string (omits vowels), max 256 chars
- **Timestamps:** RFC3339, UTC (e.g., `2018-02-01T05:10:20.152Z`)
- **Currency amounts:** Strings in base units with period decimal (e.g., `"99.95"`)
- **Currency codes:** ISO 4217 three-letter codes (e.g., `"USD"`)

## Custom Fields

Any resource can carry arbitrary custom fields:
- Field names: max 64 chars
- Field values: max 1024 chars

## Versioning

- Current version: `1`
- Send `Accept-Version: 1` header
- Response includes `Version` header
- Backward-compatible changes may occur without version bump (new optional fields, new HTTP codes, etc.)

## Health Check

```
GET /health
```
Returns `200 OK` — no authentication required.

## Base URLs

| Environment | URL |
|---|---|
| Sandbox (UAT) | `https://uat.api.converge.eu.elavonaws.com` |
| Production (EU) | `https://api.eu.convergepay.com` |

> **Note:** Confirm the correct North America production URL with Elavon before going live.
