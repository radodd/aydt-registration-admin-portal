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
const {
  mockCreateClient,
  mockComputePricingQuote,
  mockValidateEnrollment,
  mockJoinWaitlist,
  mockGetApplicableCredits,
  mockMarkCreditsUsed,
  mockCreateAdminClient,
} = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockComputePricingQuote: vi.fn(),
  mockValidateEnrollment: vi.fn(),
  mockJoinWaitlist: vi.fn(),
  mockGetApplicableCredits: vi.fn(),
  mockMarkCreditsUsed: vi.fn(),
  mockCreateAdminClient: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({ createClient: mockCreateClient }));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: mockCreateAdminClient }));
vi.mock("@/app/actions/computePricingQuote", () => ({
  computePricingQuote: mockComputePricingQuote,
}));
vi.mock("@/app/actions/validateEnrollment", () => ({
  validateEnrollment: mockValidateEnrollment,
}));
vi.mock("@/queries/credits", () => ({
  getApplicableCredits: mockGetApplicableCredits,
  markCreditsUsed: mockMarkCreditsUsed,
}));
vi.mock(
  "@/app/(user-facing)/register/actions/joinWaitlist",
  () => ({ joinWaitlist: mockJoinWaitlist }),
);

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
      if (table === "meeting_enrollments") return makeChain({ listResult: { data: registrations } });
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

/* -------------------------------------------------------------------------- */
/* Meeting-plan #26 — last-seat race → waitlist routing                        */
/* -------------------------------------------------------------------------- */

const SECTION_ID = "sec-0000-0000-0000-000000000001";
const CLASS_ID = "cls-0000-0000-0000-000000000001";
const DANCER_ID = "dnc-0000-0000-0000-000000000001";

const SECTION_INPUT = {
  semesterId: SEM_ID,
  participants: [
    {
      dancerId: DANCER_ID,
      sessionId: "ses-1",
      mode: "standard" as const,
      scheduleId: SECTION_ID,
      classId: CLASS_ID,
    },
  ],
  batchId: BATCH_ID,
};

const CAPACITY_ERROR = { message: "Section is at capacity — 1 enrolled, capacity is 1." };

/**
 * Flow-capable mock that drives createRegistrations all the way to the
 * section_enrollments insert. Each table's awaited (.then) and .maybeSingle()
 * results are configured independently so we can make the enrollment insert
 * succeed or capacity-fail.
 */
function makeFlowMock(opts: { rpcResult: { data: unknown; error: unknown } }) {
  const calls = { sectionDeletes: 0, batchUpdates: 0, enrollInserts: 0 };

  const chainFor = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "in", "is", "order", "limit"]) {
      chain[m] = vi.fn().mockReturnThis();
    }
    chain.insert = vi.fn(() => {
      if (table === "section_enrollments") calls.enrollInserts++;
      return chain;
    });
    chain.update = vi.fn(() => {
      if (table === "registration_orders") calls.batchUpdates++;
      return chain;
    });
    chain.delete = vi.fn(() => {
      if (table === "section_enrollments") calls.sectionDeletes++;
      return chain;
    });

    chain.maybeSingle = vi.fn().mockImplementation(() => {
      if (table === "registration_orders") return Promise.resolve({ data: null, error: null }); // idempotency: no existing batch
      if (table === "users") return Promise.resolve({ data: { family_id: "fam-1" }, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    chain.single = vi.fn().mockResolvedValue({ data: null, error: null });

    // Awaited terminal (select-without-single / insert / update / delete).
    chain.then = (resolve: (v: unknown) => void) => {
      let result: { data: unknown; error: unknown };
      if (table === "class_meetings") {
        result = { data: [{ id: "ses-1", class_id: CLASS_ID }], error: null };
      } else if (table === "class_sections") {
        result = {
          data: [{ id: SECTION_ID, class_id: CLASS_ID, classes: { semester_id: SEM_ID } }],
          error: null,
        };
      } else {
        // Enrollment creation now goes through the convert_holds_to_enrollments
        // RPC (mocked below), not a direct section_enrollments insert.
        result = { data: [], error: null };
      }
      return Promise.resolve(result).then(resolve);
    };
    return chain;
  };

  return {
    _calls: calls,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }) },
    from: vi.fn((table: string) => chainFor(table)),
    // convert_holds_to_enrollments — the hold→enrollment conversion (#28).
    rpc: vi.fn().mockResolvedValue(opts.rpcResult),
  };
}

describe("createRegistrations — last-seat race → waitlist (meeting-plan #26)", () => {
  beforeEach(() => {
    mockValidateEnrollment.mockResolvedValue({ hasHardBlock: false, issues: [] });
    mockComputePricingQuote.mockResolvedValue({
      grandTotal: 100,
      amountDueNow: 100,
      tuitionSubtotal: 100,
      registrationFeeTotal: 0,
      recitalFeeTotal: 0,
      familyDiscountAmount: 0,
      autoPayAdminFeeTotal: 0,
      paymentSchedule: [],
    });
    mockGetApplicableCredits.mockResolvedValue({ ids: [], total: 0 });
    mockMarkCreditsUsed.mockResolvedValue(undefined);
    mockCreateAdminClient.mockReturnValue({});
    mockJoinWaitlist.mockResolvedValue({ success: true, entryId: "wl-1" });
  });

  it("routes the loser to the waitlist (no hard error) when the section is at capacity", async () => {
    mockCreateClient.mockResolvedValue(
      makeFlowMock({ rpcResult: { data: null, error: CAPACITY_ERROR } }),
    );

    const result = await createRegistrations(SECTION_INPUT);

    // Graceful outcome — not the raw Postgres error.
    expect(result.success).toBe(false);
    expect(result.allWaitlisted).toBe(true);
    expect(result.registrationIds).toEqual([]);
    expect(result.error).toMatch(/waitlist/i);
    expect(result.error).not.toMatch(/at capacity/i);

    // The contended dancer was queued onto the correct class waitlist.
    expect(mockJoinWaitlist).toHaveBeenCalledTimes(1);
    expect(mockJoinWaitlist).toHaveBeenCalledWith(
      expect.objectContaining({
        semesterId: SEM_ID,
        classId: CLASS_ID,
        sectionId: SECTION_ID,
        meetingId: null,
        dancerId: DANCER_ID,
      }),
    );
    expect(result.waitlisted).toEqual([{ dancerId: DANCER_ID, classId: CLASS_ID }]);
  });

  it("enrolls normally and never touches the waitlist when capacity is available", async () => {
    mockCreateClient.mockResolvedValue(
      makeFlowMock({
        rpcResult: { data: [{ kind: "section", enrollment_id: "enr-1" }], error: null },
      }),
    );

    const result = await createRegistrations(SECTION_INPUT);

    expect(result.success).toBe(true);
    expect(result.allWaitlisted).toBeUndefined();
    expect(result.registrationIds).toContain("enr-1");
    expect(mockJoinWaitlist).not.toHaveBeenCalled();
  });

  it("still hard-errors on a non-capacity insert failure", async () => {
    mockCreateClient.mockResolvedValue(
      makeFlowMock({
        rpcResult: { data: null, error: { message: "duplicate key value violates unique constraint" } },
      }),
    );

    const result = await createRegistrations(SECTION_INPUT);

    expect(result.success).toBe(false);
    expect(result.allWaitlisted).toBeUndefined();
    expect(result.error).toMatch(/duplicate key/i);
    expect(mockJoinWaitlist).not.toHaveBeenCalled();
  });
});
