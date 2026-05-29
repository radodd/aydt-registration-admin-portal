/**
 * Integration-style simulation of a MANUAL admin registration
 * (meeting-plan #7). Drives the real createAdminRegistration logic against a
 * mocked Supabase client + mocked installment-session/EPG action, asserting the
 * exact rows written for each path.
 *
 * Covered:
 *   Path A — super-admin installment plan: PENDING order, N scheduled
 *            installments, pending enrollments, hosted-session redirect.
 *   Gating — regular admin may NOT set up installments, and may NOT under-collect.
 *   Path B — pay-in-full: confirmed order, installment 1 'paid' (full) or
 *            'scheduled' (super-admin partial override).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildAdminInstallmentSchedule } from "@/utils/buildPaymentSchedule";

// ── Hoist mocks ────────────────────────────────────────────────────────────
const {
  mockCreateClient,
  mockComputePricingQuote,
  mockCreateAdminInstallmentSession,
  mockSendReceipt,
} = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockComputePricingQuote: vi.fn(),
  mockCreateAdminInstallmentSession: vi.fn(),
  mockSendReceipt: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({ createClient: mockCreateClient }));
vi.mock("@/app/actions/computePricingQuote", () => ({
  computePricingQuote: mockComputePricingQuote,
}));
vi.mock("@/app/admin/register/actions/createAdminInstallmentSession", () => ({
  createAdminInstallmentSession: mockCreateAdminInstallmentSession,
}));
vi.mock("@/app/admin/register/actions/sendRegistrationReceipt", () => ({
  sendRegistrationReceipt: mockSendReceipt,
}));

// ── Import AFTER mocks ──────────────────────────────────────────────────────
import { createAdminRegistration } from "@/app/admin/register/actions/createAdminRegistration";

// ── Constants ───────────────────────────────────────────────────────────────
const ADMIN_ID = "adm-0000-0000-0000-000000000001";
const DANCER_ID = "dnc-0000-0000-0000-000000000001";
const FAMILY_ID = "fam-0000-0000-0000-000000000001";
const PARENT_ID = "par-0000-0000-0000-000000000001";
const SEM_ID = "sem-0000-0000-0000-000000000001";
const SCHEDULE_ID = "sec-0000-0000-0000-000000000001";

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    semesterId: SEM_ID,
    semesterName: "Fall 2026",
    scheduleIds: [SCHEDULE_ID],
    sessionIds: [],
    dancerId: DANCER_ID,
    dancerName: "Jane Doe",
    familyId: FAMILY_ID,
    parentUserId: PARENT_ID,
    newDancer: null,
    formData: {},
    priceOverride: 1000, // bypass pricing engine → effectiveTotal = 1000
    paymentMethod: "cash",
    amountCollected: 0,
    ...overrides,
  } as Parameters<typeof createAdminRegistration>[0];
}

/**
 * Mocked Supabase client that records every insert payload by table and answers
 * the role lookup. `users.select(role).single()` returns the configured role;
 * everything else resolves empty/no-error.
 */
function makeSupabaseMock(role: "admin" | "super_admin" | null) {
  const inserts: Record<string, unknown[]> = {};

  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "update", "upsert", "eq", "neq", "in", "order", "limit", "is"]) {
      chain[m] = vi.fn().mockReturnThis();
    }
    chain.insert = vi.fn((payload: unknown) => {
      (inserts[table] ??= []).push(payload);
      return chain;
    });
    chain.single = vi.fn().mockResolvedValue(
      table === "users" ? { data: { role }, error: null } : { data: null, error: null },
    );
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    // Awaited insert()/select() (no terminal) resolves here.
    chain.then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: [], error: null }).then(resolve);
    return chain;
  });

  const client = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: role ? { id: ADMIN_ID } : null } }) },
    from,
    rpc: vi.fn().mockResolvedValue({ error: null }),
  };
  return { client, inserts };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateAdminInstallmentSession.mockResolvedValue({
    paymentSessionUrl: "https://uat.epg.example.com/hpp/session-xyz",
  });
  mockSendReceipt.mockResolvedValue(undefined); // action chains .catch on this
});

describe("createAdminRegistration — manual registration simulation (#7)", () => {
  /* ----------------------------------------------------------------------- */
  /* Path A — super-admin installment plan                                    */
  /* ----------------------------------------------------------------------- */
  it("Path A: super-admin sets up a 5-installment auto-charge plan", async () => {
    const { client, inserts } = makeSupabaseMock("super_admin");
    mockCreateClient.mockResolvedValue(client);

    const result = await createAdminRegistration(
      baseInput({ paymentPlanType: "monthly", installmentCount: 5 }),
    );

    // Returns a hosted-page URL for the redirect; batch created.
    expect(result.success).toBe(true);
    expect(result.paymentSessionUrl).toBe("https://uat.epg.example.com/hpp/session-xyz");
    expect(result.batchId).toBeTruthy();

    // Order is PENDING, installments, with the chosen count + installment-1 amount.
    const order = (inserts["registration_orders"]?.[0] ?? {}) as Record<string, unknown>;
    expect(order.status).toBe("pending");
    expect(order.payment_plan_type).toBe("installments");
    expect(order.installment_count).toBe(5);
    expect(order.grand_total).toBe(1000);
    expect(order.amount_due_now).toBe(200); // 1000 / 5
    expect(order.parent_id).toBe(PARENT_ID);
    expect(order.confirmed_at).toBeUndefined(); // not confirmed yet

    // Enrollments inserted PENDING (webhook flips to confirmed).
    const enrollRows = (inserts["section_enrollments"]?.[0] ?? []) as Array<Record<string, unknown>>;
    expect(enrollRows).toHaveLength(1);
    expect(enrollRows[0].status).toBe("pending");
    expect(enrollRows[0].section_id).toBe(SCHEDULE_ID);

    // N scheduled installment rows matching the schedule helper exactly.
    const today = new Date().toISOString().split("T")[0];
    const expected = buildAdminInstallmentSchedule(1000, 5, today);
    const instRows = (inserts["order_payment_installments"]?.[0] ?? []) as Array<Record<string, unknown>>;
    expect(instRows).toHaveLength(5);
    expect(instRows.map((r) => r.installment_number)).toEqual([1, 2, 3, 4, 5]);
    expect(instRows.every((r) => r.status === "scheduled")).toBe(true);
    expect(instRows.map((r) => r.amount_due)).toEqual(expected.map((e) => e.amountDue));
    expect(instRows.map((r) => r.due_date)).toEqual(expected.map((e) => e.dueDate));

    // Hosted session minted with installment-1 amount; admin receipt NOT sent
    // (the EPG webhook sends the confirmation email after the card is stored).
    expect(mockCreateAdminInstallmentSession).toHaveBeenCalledWith(
      expect.objectContaining({ batchId: result.batchId, amountDueNow: 200, semesterId: SEM_ID }),
    );
    expect(mockSendReceipt).not.toHaveBeenCalled();
  });

  it("Path A: adjustments reduce the total the schedule is built from", async () => {
    const { client, inserts } = makeSupabaseMock("super_admin");
    mockCreateClient.mockResolvedValue(client);

    // $1000 base − $250 scholarship = $750 effective, split into 3 → $250 each.
    const adjustments = [{ type: "tuition_adjustment" as const, label: "Scholarship", amount: 250 }];
    const result = await createAdminRegistration(
      baseInput({ paymentPlanType: "monthly", installmentCount: 3, adjustments }),
    );

    expect(result.success).toBe(true);

    const order = (inserts["registration_orders"]?.[0] ?? {}) as Record<string, unknown>;
    expect(order.grand_total).toBe(750); // effective total, not the $1000 base
    expect(order.amount_due_now).toBe(250); // 750 / 3
    expect(order.admin_adjustments).toEqual(adjustments); // persisted for audit

    const expected = buildAdminInstallmentSchedule(750, 3, new Date().toISOString().split("T")[0]);
    const instRows = (inserts["order_payment_installments"]?.[0] ?? []) as Array<Record<string, unknown>>;
    expect(instRows.map((r) => r.amount_due)).toEqual(expected.map((e) => e.amountDue));
    expect(instRows.map((r) => r.amount_due)).toEqual([250, 250, 250]);

    expect(mockCreateAdminInstallmentSession).toHaveBeenCalledWith(
      expect.objectContaining({ amountDueNow: 250 }),
    );
  });

  it("Path A: stacked adjustments leave the remainder on the last installment", async () => {
    const { client, inserts } = makeSupabaseMock("super_admin");
    mockCreateClient.mockResolvedValue(client);

    // 1000 − 100 − 1 = 899, split into 4. 899/4 = 224.75 → exact, but verify sum.
    const adjustments = [
      { type: "tuition_adjustment" as const, label: "Sibling credit", amount: 100 },
      { type: "credit" as const, label: "Account Credit", amount: 1 },
    ];
    const result = await createAdminRegistration(
      baseInput({ paymentPlanType: "monthly", installmentCount: 4, adjustments }),
    );

    expect(result.success).toBe(true);
    const instRows = (inserts["order_payment_installments"]?.[0] ?? []) as Array<Record<string, unknown>>;
    const sum = instRows.reduce((s, r) => s + (r.amount_due as number), 0);
    expect(sum).toBeCloseTo(899, 2); // reconciles exactly to the adjusted total
  });

  it("Path B: an adjustment that drops the total to the collected amount marks installment 1 PAID", async () => {
    const { client, inserts } = makeSupabaseMock("admin");
    mockCreateClient.mockResolvedValue(client);

    // $1000 base − $600 adjustment = $400 effective; admin collects exactly $400.
    // A regular admin is allowed because it is no longer a partial payment.
    const adjustments = [{ type: "tuition_adjustment" as const, label: "Proration", amount: 600 }];
    const result = await createAdminRegistration(
      baseInput({ paymentPlanType: "pay_in_full", amountCollected: 400, adjustments }),
    );

    expect(result.success).toBe(true);
    const order = (inserts["registration_orders"]?.[0] ?? {}) as Record<string, unknown>;
    expect(order.grand_total).toBe(400);
    const inst = (inserts["order_payment_installments"]?.[0] ?? {}) as Record<string, unknown>;
    expect(inst.amount_due).toBe(400);
    expect(inst.status).toBe("paid"); // 400 collected >= 400 effective
  });

  it("Path A: blocks installments when the family has no parent account", async () => {
    const { client, inserts } = makeSupabaseMock("super_admin");
    mockCreateClient.mockResolvedValue(client);

    const result = await createAdminRegistration(
      baseInput({ paymentPlanType: "monthly", installmentCount: 5, parentUserId: null }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/parent account/i);
    expect(inserts["registration_orders"]).toBeUndefined();
    expect(mockCreateAdminInstallmentSession).not.toHaveBeenCalled();
  });

  it("Path A: rejects fewer than 2 installments", async () => {
    const { client } = makeSupabaseMock("super_admin");
    mockCreateClient.mockResolvedValue(client);

    const result = await createAdminRegistration(
      baseInput({ paymentPlanType: "monthly", installmentCount: 1 }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/at least 2/i);
  });

  /* ----------------------------------------------------------------------- */
  /* Gating — installments + partial overrides are super-admin only           */
  /* ----------------------------------------------------------------------- */
  it("Gate: a regular admin cannot set up an installment plan", async () => {
    const { client, inserts } = makeSupabaseMock("admin");
    mockCreateClient.mockResolvedValue(client);

    const result = await createAdminRegistration(
      baseInput({ paymentPlanType: "monthly", installmentCount: 5 }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/super-admin/i);
    expect(inserts["registration_orders"]).toBeUndefined();
  });

  it("Gate: a regular admin cannot complete a partial (under-collected) payment", async () => {
    const { client, inserts } = makeSupabaseMock("admin");
    mockCreateClient.mockResolvedValue(client);

    const result = await createAdminRegistration(
      baseInput({ paymentPlanType: "pay_in_full", amountCollected: 400 }), // < 1000
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/partial payment/i);
    expect(inserts["registration_orders"]).toBeUndefined();
  });

  /* ----------------------------------------------------------------------- */
  /* Path B — pay-in-full / manual                                            */
  /* ----------------------------------------------------------------------- */
  it("Path B: regular admin pay-in-full confirms the order and marks installment 1 paid", async () => {
    const { client, inserts } = makeSupabaseMock("admin");
    mockCreateClient.mockResolvedValue(client);

    const result = await createAdminRegistration(
      baseInput({ paymentPlanType: "pay_in_full", amountCollected: 1000, paymentMethod: "check", checkNumber: "1234" }),
    );

    expect(result.success).toBe(true);
    expect(result.paymentSessionUrl).toBeUndefined(); // synchronous, no redirect

    const order = (inserts["registration_orders"]?.[0] ?? {}) as Record<string, unknown>;
    expect(order.status).toBe("confirmed");
    expect(order.payment_plan_type).toBe("pay_in_full");
    expect(order.payment_reference_id).toBe("admin");

    const inst = (inserts["order_payment_installments"]?.[0] ?? {}) as Record<string, unknown>;
    expect(inst.status).toBe("paid");
    expect(inst.paid_amount).toBe(1000);
    expect(inst.payment_reference_id).toBe("check-1234");

    expect(mockSendReceipt).toHaveBeenCalledTimes(1);
  });

  it("Path B: super-admin partial payment confirms the order but leaves installment 1 unpaid (override)", async () => {
    const { client, inserts } = makeSupabaseMock("super_admin");
    mockCreateClient.mockResolvedValue(client);

    const result = await createAdminRegistration(
      baseInput({ paymentPlanType: "pay_in_full", amountCollected: 400 }), // partial, allowed for super-admin
    );

    expect(result.success).toBe(true);
    const order = (inserts["registration_orders"]?.[0] ?? {}) as Record<string, unknown>;
    expect(order.status).toBe("confirmed"); // not blocked

    const inst = (inserts["order_payment_installments"]?.[0] ?? {}) as Record<string, unknown>;
    expect(inst.status).toBe("scheduled"); // balance remains due
    expect(inst.paid_at).toBeNull();
  });

  it("rejects an unauthenticated caller", async () => {
    const { client } = makeSupabaseMock(null);
    mockCreateClient.mockResolvedValue(client);

    const result = await createAdminRegistration(baseInput());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/authenticated/i);
  });
});
