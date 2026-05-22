/**
 * Tests for createRegistrations server action — focused on the batch
 * idempotency / staleness branch (step 2).
 *
 * When the supplied batchId points at an existing batch:
 *   - status pending/confirmed → reuse, return existing IDs
 *   - status failed/cancelled  → return { success: false, code: "BATCH_STALE" }
 *     so the client mints a fresh batchId and retries instead of dead-ending
 *     on "not in a payable state".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoist mocks ───────────────────────────────────────────────────────────────
const { mockCreateClient, mockComputePricingQuote, mockValidateEnrollment } =
  vi.hoisted(() => ({
    mockCreateClient: vi.fn(),
    mockComputePricingQuote: vi.fn(),
    mockValidateEnrollment: vi.fn(),
  }));

vi.mock("@/utils/supabase/server", () => ({ createClient: mockCreateClient }));
vi.mock("@/app/actions/computePricingQuote", () => ({
  computePricingQuote: mockComputePricingQuote,
}));
vi.mock("@/app/actions/validateEnrollment", () => ({
  validateEnrollment: mockValidateEnrollment,
}));

// ── Import AFTER mocks ──────────────────────────────────────────────────────
import { createRegistrations } from "@/app/(user-facing)/register/actions/createRegistrations";

// ── Constants ─────────────────────────────────────────────────────────────────
const BATCH_ID = "batch-0000-0000-0000-000000000001";
const SEM_ID = "sem-0000-0000-0000-000000000001";
const USER_ID = "user-0000-0000-0000-000000000001";

const VALID_INPUT = {
  semesterId: SEM_ID,
  participants: [
    { dancerId: "dnc-1", sessionId: "ses-1", mode: "drop-in" as const, classId: "cls-1" },
  ],
  batchId: BATCH_ID,
};

// ── Chain builder ─────────────────────────────────────────────────────────────
function makeChain(opts: {
  maybeSingleResult?: { data: unknown; error?: unknown };
  listResult?: { data: unknown[]; error?: unknown };
} = {}) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "update", "insert", "upsert", "eq", "neq", "in", "order", "limit"]) {
    chain[m] = vi.fn().mockReturnThis();
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(opts.maybeSingleResult ?? { data: null, error: null });
  // Awaited select() without a terminal method resolves via then.
  chain.then = (resolve: (v: unknown) => void) =>
    Promise.resolve(opts.listResult ?? { data: [], error: null }).then(resolve);
  return chain;
}

function makeSupabaseMock(opts: {
  user?: { id: string } | null;
  batch?: { id: string; status: string } | null;
  registrations?: Array<{ id: string }>;
  enrollments?: Array<{ id: string }>;
}) {
  const { user = { id: USER_ID }, batch = null, registrations = [], enrollments = [] } = opts;
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn((table: string) => {
      if (table === "registration_orders") return makeChain({ maybeSingleResult: { data: batch } });
      if (table === "registrations") return makeChain({ listResult: { data: registrations } });
      if (table === "section_enrollments") return makeChain({ listResult: { data: enrollments } });
      return makeChain();
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createRegistrations — batch staleness branch", () => {
  it("returns BATCH_STALE when the existing batch is failed", async () => {
    mockCreateClient.mockResolvedValue(
      makeSupabaseMock({ batch: { id: BATCH_ID, status: "failed" } }),
    );

    const result = await createRegistrations(VALID_INPUT);

    expect(result.success).toBe(false);
    expect(result.code).toBe("BATCH_STALE");
    // pricing/validation must NOT run — we bail before any of that
    expect(mockComputePricingQuote).not.toHaveBeenCalled();
    expect(mockValidateEnrollment).not.toHaveBeenCalled();
  });

  it("returns BATCH_STALE when the existing batch is cancelled", async () => {
    mockCreateClient.mockResolvedValue(
      makeSupabaseMock({ batch: { id: BATCH_ID, status: "cancelled" } }),
    );

    const result = await createRegistrations(VALID_INPUT);

    expect(result.success).toBe(false);
    expect(result.code).toBe("BATCH_STALE");
  });

  it("reuses an existing pending batch and returns merged registration + enrollment IDs", async () => {
    mockCreateClient.mockResolvedValue(
      makeSupabaseMock({
        batch: { id: BATCH_ID, status: "pending" },
        registrations: [{ id: "reg-1" }],
        enrollments: [{ id: "enr-1" }],
      }),
    );

    const result = await createRegistrations(VALID_INPUT);

    expect(result.success).toBe(true);
    expect(result.code).toBeUndefined();
    expect(result.batchId).toBe(BATCH_ID);
    expect(result.registrationIds).toEqual(expect.arrayContaining(["reg-1", "enr-1"]));
    // idempotent reuse — no re-validation / re-pricing
    expect(mockValidateEnrollment).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated callers before touching the batch", async () => {
    mockCreateClient.mockResolvedValue(makeSupabaseMock({ user: null }));

    const result = await createRegistrations(VALID_INPUT);

    expect(result.success).toBe(false);
    expect(result.code).toBeUndefined();
    expect(result.error).toMatch(/signed in/i);
  });
});
