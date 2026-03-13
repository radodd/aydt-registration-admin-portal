# Rate Limiting

## What it does

Incoming HTTP requests to specific API route groups are checked against a per-IP sliding window counter before they reach any application logic. If a caller exceeds the allowed number of requests within a 60-second window, the server immediately returns `429 Too Many Requests` with a `Retry-After` header indicating how many seconds to wait. The request never reaches the route handler, Supabase, or any other downstream service.

Rate limits are applied at the Next.js middleware layer (`middleware.ts`) and only activate for the following path prefixes:

| Path prefix | Limit | Reason |
|---|---|---|
| `/api/webhooks` | 100 req / min | Payment providers (EPG) and messaging services (Resend, Twilio) can burst legitimately, but unlimited retries from a misconfigured or malicious source could flood the DB |
| `/api/upload-image` | 10 req / min | File uploads are expensive — storage writes, DB inserts, dimension detection. Low limit prevents abuse and accidental loops |
| `/api/media` | 60 req / min | Read-heavy asset browsing; permissive but still bounded |
| `/api/register` | 30 req / min | Batch-status polling endpoint used during the registration confirmation screen; caps aggressive polling |

All other routes (admin pages, user-facing pages, static assets) pass through middleware without any Redis interaction.

## Why Upstash Redis

### The core problem: Vercel is stateless

Every route handler and middleware function on Vercel runs in an isolated, ephemeral serverless function. There is no shared memory between invocations — not even between two requests that arrive milliseconds apart. An in-memory counter would reset on every request, making it useless as a rate limiter.

A rate limiter that actually works across Vercel's distributed infrastructure requires a **shared, persistent store** that all function instances can read from and write to atomically.

### Why not a different store?

**PostgreSQL (Supabase)** — Possible, but adds latency and load to the primary database on every API request. Rate limiting is a hot path; it needs to be faster than a Postgres round-trip and should not compete with registration and payment queries for connection slots.

**Redis on Railway / Render / self-hosted** — Works technically but requires provisioning and maintaining a long-running server. Adds ops burden, a new failure domain, and cost that scales with uptime rather than usage.

**Vercel KV** — Vercel's own key-value offering is also backed by Upstash Redis under the hood. It would work identically, but costs more for the same throughput and locks the implementation to Vercel's platform. Using Upstash directly keeps the option to deploy elsewhere.

**Cloudflare Rate Limiting / WAF rules** — Operates at the CDN edge before requests reach the origin, which is powerful for DDoS mitigation. However it requires a Cloudflare-proxied domain, adds a network hop, and is configured outside the codebase (no code-level visibility into limits). It's also not free at the granularity needed here.

### Why Upstash

Upstash is a **serverless Redis service** accessed over HTTP REST rather than a persistent TCP connection. This makes it a natural fit for serverless environments:

- **No connection pooling required.** Standard Redis clients hold open TCP connections. Serverless functions can't do this reliably — each invocation may spin up a new process. Upstash's REST API is stateless by design.
- **Pay per request, not per hour.** The free tier covers 10,000 requests/day. There is no charge for idle time.
- **`@upstash/ratelimit` is purpose-built.** The library implements sliding window, fixed window, and token bucket algorithms on top of Upstash Redis with a single function call. The sliding window algorithm used here avoids the "burst at boundary" problem of fixed windows — a caller cannot squeeze 200 requests in by straddling two 60-second buckets.
- **Atomic operations.** The counter increment and expiry are handled in a single Lua script executed server-side on Redis, so there are no race conditions between the read and write.

### Sliding window vs fixed window

The implementation uses `Ratelimit.slidingWindow(N, "60 s")`.

A fixed window resets at a hard boundary (e.g., exactly :00 and :60). A caller can send N requests just before :60 and another N requests just after, effectively doubling the limit at every boundary.

A sliding window tracks the last 60 seconds relative to each request's arrival time. The effective rate is always bounded by N requests in any 60-second span, regardless of when those requests arrive.

## Implementation files

| File | Role |
|---|---|
| `middleware.ts` | Entry point — checks path prefix, extracts IP, calls limiter, returns 429 or passes through |
| `utils/ratelimit.ts` | Lazy singleton factories for each limiter group; creates the Upstash Redis client on first use |
| `.env.local` | `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (server-side only, no `NEXT_PUBLIC_` prefix) |

## Required environment variables

```
UPSTASH_REDIS_REST_URL=https://<your-endpoint>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<your-token>
```

Both are available in the Upstash dashboard under the database's "REST API" section. They must also be added to Vercel's environment variables for the production deployment.
