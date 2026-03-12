# Testing Guide

## What is Testing and Why Does It Exist?

When you build software, you're constantly changing code. Every time you change something, you risk breaking something that was already working — even something unrelated. Without tests, the only way to know if everything still works is to manually click through every screen and check every feature. That doesn't scale.

**Automated tests are code that checks your other code.** You write a test once, and it runs in milliseconds every time you want to verify that something still works. If something breaks, the test tells you exactly which expectation failed and where.

Think of it like this:
- **Manual testing**: You cook a dish, taste it, decide if it's good. You have to do this every single time.
- **Automated testing**: You write down a recipe and a scorecard. A machine follows the recipe and compares the result against the scorecard. You only have to define the scorecard once.

---

## The Three Types of Tests

### 1. Unit Tests

Test one function in isolation. Everything it depends on (databases, APIs, other functions) is replaced with a fake ("mock") that you control.

- **Fast**: Run in milliseconds. No network, no database.
- **Precise**: When a unit test fails, you know exactly which function broke.
- **What they don't test**: Whether the pieces actually work together.

**Example from this project:** `computePricingQuote()` is a server action that reads from several DB tables and does math. A unit test calls it with a fake database that returns known values, then asserts the math came out right.

### 2. Integration Tests

Test multiple pieces working together. They often hit a real database (a test/staging one) or real APIs.

- **Slower**: They involve real I/O.
- **More realistic**: Catch bugs that unit tests miss (e.g. the DB schema changed).
- **What they don't test**: The full user journey end-to-end.

### 3. End-to-End (E2E) Tests

Simulate a real user in a real browser. The test drives the browser — it clicks buttons, fills in forms, reads what's on screen.

- **Slowest**: Requires a full browser and running server.
- **Most realistic**: Exactly what the user sees and does.
- **What they don't test**: Nothing — if the E2E test passes, the feature works.
- **Tooling**: Playwright is the standard for Next.js projects.

---

## Core Concepts You Need to Know

### Assertions (`expect`)

An assertion is a statement that says "I expect this to be true." If it's not, the test fails and tells you what was wrong.

```ts
expect(quote.grandTotal).toBeCloseTo(870.93, 2);
// "I expect grandTotal to be approximately 870.93 (within 2 decimal places)"

expect(result.valid).toBe(true);
// "I expect valid to be exactly true"

expect(fn).rejects.toThrow(/No tuition rate configured/i);
// "I expect this async function to throw an error matching this pattern"
```

### Mocking

A mock replaces a real dependency with a fake one you control. This is what allows unit tests to be fast and isolated.

**Why mock?** Your `computePricingQuote()` function calls Supabase (a real database). In a unit test you don't want to hit a real DB — it's slow, it requires network access, and the data might not be what you expect. So you replace the Supabase client with a fake that returns exactly the data you specify.

```ts
// Tell Vitest: when the code imports createClient, give it this fake instead
vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(),
}));

// Then in your test, configure what the fake returns:
mockCreateClient.mockResolvedValue(fakeSupabaseClient);
```

The function under test (`computePricingQuote`) doesn't know it's talking to a fake. It calls `createClient()` and gets back an object that behaves like Supabase — it has `.from()`, `.select()`, `.eq()`, etc. — but the responses are whatever you hardcoded.

### Test Lifecycle (`beforeEach`, `afterEach`)

```ts
beforeEach(() => {
  vi.clearAllMocks(); // reset all mocks before each test
});
```

`beforeEach` runs a function before every test in the block. This ensures tests don't leak state into each other. If test A configures a mock, test B shouldn't inherit that configuration.

### Describe Blocks

`describe` groups related tests together. It's organizational — it doesn't change how tests run.

```ts
describe("computePricingQuote", () => {
  it("applies family discount for 2 dancers", async () => { ... });
  it("skips family discount when prior batch exists", async () => { ... });
});
```

---

## How Testing Works in This Project

### The Testing Framework: Vitest

This project uses **Vitest** — a testing framework built for Vite-based projects (which Next.js 15+ uses under the hood). It's nearly identical to Jest if you've seen that before, but faster and natively understands ESM modules.

**Key commands:**
```bash
npx vitest run                          # Run all tests once
npx vitest run tests/unit/actions/      # Run only action tests
npx vitest                              # Watch mode — re-runs on file changes
npx vitest --reporter=verbose           # Show each test name in output
```

### Configuration: `vitest.config.ts`

```ts
export default defineConfig({
  test: {
    environment: "node",      // Default: tests run in Node.js (no browser)
    globals: true,            // Makes expect(), describe(), it() available without import
    setupFiles: ["./vitest.setup.ts"],  // Runs before every test file
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],  // Where Vitest looks for tests
    environmentMatchGlobs: [
      ["tests/components/**", "jsdom"],  // Component tests get a fake browser DOM
    ],
  },
  resolve: {
    alias: { "@": "./" },    // Makes @/ imports work (same as the app)
  },
});
```

**Why `environment: "node"` as the default?**
Server actions, utilities, and data logic run on the server — they have no need for a browser DOM. Running them under `node` is faster and avoids a dependency conflict with `jsdom` that caused unhandled errors in this project (`html-encoding-sniffer` → `@exodus/bytes` ESM incompatibility).

Only component tests that actually render HTML need `jsdom`, so they get it via `environmentMatchGlobs`.

### Where Tests Live

```
tests/
├── components/
│   └── admin/
│       └── CreateProgram.test.tsx       # React component render test (jsdom)
└── unit/
    ├── utils/
    │   └── supabase/
    │       └── client.test.ts           # Supabase client initialization test
    └── actions/
        ├── fixtures/
        │   └── pricingFixtures.ts       # Shared mock factories and test data
        ├── computePricingQuote.test.ts  # 8 tests for the pricing engine
        └── validateCoupon.test.ts       # 9 tests for coupon validation
```

---

## The Test Infrastructure We Built

### 1. Shared Fixtures: `tests/unit/actions/fixtures/pricingFixtures.ts`

Fixtures are reusable test data and helper functions. Rather than copy-pasting mock setup in every test file, we centralize it here.

**`makeChain(result)`** — Builds a fake Supabase query chain. Supabase uses method chaining:
```ts
supabase.from("table").select("*").eq("col", val).maybeSingle()
```
Each method in the chain returns `this` so the next can be called. `makeChain()` creates an object where every method returns itself (via `vi.fn().mockReturnThis()`), and the terminal call (`.maybeSingle()`, `.single()`) resolves to the value you pass in.

**`makeSupabaseMock(routes)`** — Routes `.from("tableName")` calls to different chains. This lets one test configure different return values for different tables:
```ts
const mock = makeSupabaseMock({
  semester_fee_config: makeChain({ data: MOCK_FEE_CONFIG_ROW }),
  tuition_rate_bands: makeChain({ data: MOCK_JUNIOR_RATE_BAND_ROW }),
  class_sessions: makeChain({ data: [MOCK_JUNIOR_SESSION_ROW] }),
});
```

**Row fixtures** (`MOCK_FEE_CONFIG_ROW`, etc.) — Pre-built DB row objects matching the real DB schema. Reused across multiple tests.

**`makePricingInput(overrides)`** — Builds a minimal valid `PricingInput` object with sensible defaults, accepting only the fields you want to customize for a given test.

---

### 2. Pricing Engine Tests: `tests/unit/actions/computePricingQuote.test.ts`

Tests the most complex server action in the project. Each test case isolates one behavior of the pricing algorithm.

| Test | What it verifies |
|---|---|
| Pay-in-full, junior, 1 class | Base tuition + costume fee + reg fee = correct grand total |
| Family discount, 2 dancers | `familyDiscountAmount === 50` when no prior batch |
| Family discount blocked | `familyDiscountAmount === 0` when prior confirmed batch exists |
| Flat coupon applied | `couponDiscount === 25`, grand total reduced |
| Coupon cap reached | Coupon skipped when `uses_count >= max_total_uses` |
| Senior fees | Video fee ($15) and costume fee ($65) appear as line items |
| Missing rate band | Throws with a message about missing configuration |
| Fee-exempt discipline | Technique classes → `registrationFee === 0` |

**How to read a test:**

```ts
it("pay-in-full, single junior dancer, 1 class/week → correct grandTotal", async () => {
  // ARRANGE: Set up the fake database to return specific data
  setupMock(buildMinimalRoutes({ division: "junior" }));

  // ACT: Call the real function
  const quote = await computePricingQuote(makePricingInput());

  // ASSERT: Check the output matches expectations
  expect(quote.grandTotal).toBeCloseTo(870.93, 2);
  expect(quote.perDancer[0].registrationFee).toBe(40);
});
```

This pattern — **Arrange, Act, Assert** (AAA) — is the standard structure for unit tests.

---

### 3. Coupon Validation Tests: `tests/unit/actions/validateCoupon.test.ts`

Tests every branch of `validateCoupon()`. The function reads from two DB tables and returns a discriminated union (`{ valid: true, coupon }` or `{ valid: false, reason }`). Each test exercises one path through the logic.

| Test | Reason returned |
|---|---|
| Valid coupon | `{ valid: true }` |
| No match in DB | `not_found` |
| `is_active: false` | `inactive` |
| `valid_until` in past | `expired` |
| `valid_from` in future | `not_yet_valid` |
| `uses_count >= max_total_uses` | `cap_reached` |
| Family already used it | `already_used` |
| Session-restricted, no match | `not_applicable` |
| Auto-apply (no code) | `{ valid: true }` |

---

## Developer Testing Tools (Not Unit Tests)

Beyond automated tests, we also added tools to reduce manual friction during development:

### Fill Test Data Button

A purple `DEV` banner appears in the admin semester form (only in `NODE_ENV === "development"`). Clicking "Fill Test Data" dispatches a complete `SemesterDraft` fixture to the React reducer — populating all 9 steps in one click.

**The fixture lives at:** `app/admin/semesters/dev/semesterTestFixture.ts`

It is dynamically imported (`await import(...)`) so it is never included in a production build.

### DB Seed Script

`scripts/seed-test-semester.ts` inserts a complete published test semester directly into Supabase. Run it to skip the admin UI entirely when testing the `/register` flow.

```bash
npx tsx scripts/seed-test-semester.ts
```

It creates:
- A published semester ("Dev Test Semester (Spring 2027)")
- 2 classes (Ballet 1A — Junior, Contemporary 1 — Senior)
- 4 tuition rate bands
- Fee config (all defaults)
- Promo coupon `DEVTEST10` (10% off)

Re-running is safe — all inserts use deterministic UUIDs and upsert logic.

---

## Running the Tests

```bash
# Action tests only (fast — ~400ms)
npx vitest run tests/unit/actions/

# All unit tests
npx vitest run tests/unit/

# Full suite
npx vitest run

# Watch mode (re-runs when you save a file)
npx vitest

# Verbose output (shows each test name)
npx vitest run --reporter=verbose tests/unit/actions/
```

### What Passing Looks Like

```
✓ tests/unit/actions/validateCoupon.test.ts   (9 tests)  15ms
✓ tests/unit/actions/computePricingQuote.test.ts (8 tests)  25ms

Test Files  2 passed (2)
     Tests  17 passed (17)
  Duration  377ms
```

### What a Failure Looks Like

```
× tests/unit/actions/computePricingQuote.test.ts > computePricingQuote
  > applies flat $25 coupon discount

AssertionError: expected 870.93 to be 845.93

  - Expected: 845.93
  + Received: 870.93
```

The failure tells you: the test name, what assertion failed, what value was expected, and what value was actually returned. You don't have to guess what broke.

---

## What's Not Tested Yet

| Area | Why | Recommended Tool |
|---|---|---|
| Full registration flow (user-facing) | Requires browser + running server | Playwright E2E |
| Admin semester creation flow | Multi-step form, browser interaction | Playwright E2E |
| Email sending | Involves Resend API | Mock Resend + unit test |
| Supabase DB triggers | Require real DB | Supabase local dev + SQL tests |
| `createRegistrations` server action | Complex, high-value target | Unit test (similar to pricing) |

The pricing engine and coupon validator were prioritized first because they handle money — errors there have direct financial impact.
