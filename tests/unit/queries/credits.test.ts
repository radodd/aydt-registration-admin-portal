/**
 * Unit tests for the canonical credit query layer (queries/credits.ts) — the
 * single source of truth for generating, applying, and reading account credits.
 */
import { describe, it, expect, vi } from "vitest";
import {
  isCreditSpendable,
  sumCredits,
  getAvailableCredits,
  getApplicableCredits,
  markCreditsUsed,
  grantAccountCredits,
} from "@/queries/credits";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Minimal chainable Supabase mock. Records the last insert/update payload and
 * resolves the configured `data`/`error` when the query chain is awaited.
 */
function makeClient(result: { data?: unknown; error?: { message: string } | null } = {}) {
  const captured: { table?: string; insert?: unknown; update?: unknown; inIds?: unknown } = {};
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "order"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.in = vi.fn((_col: string, ids: unknown) => {
    captured.inIds = ids;
    return chain;
  });
  chain.insert = vi.fn((payload: unknown) => {
    captured.insert = payload;
    return chain;
  });
  chain.update = vi.fn((payload: unknown) => {
    captured.update = payload;
    return chain;
  });
  chain.then = (resolve: (v: unknown) => void) =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve);

  const client = {
    from: vi.fn((table: string) => {
      captured.table = table;
      return chain;
    }),
  } as unknown as SupabaseClient;

  return { client, captured };
}

describe("queries/credits — canonical credit layer", () => {
  it("isCreditSpendable: active + unused only", () => {
    expect(isCreditSpendable({ is_active: true, used_in_batch_id: null })).toBe(true);
    expect(isCreditSpendable({ is_active: false, used_in_batch_id: null })).toBe(false);
    expect(isCreditSpendable({ is_active: true, used_in_batch_id: "b1" })).toBe(false);
  });

  it("sumCredits coerces and adds", () => {
    expect(sumCredits([{ amount: 10 }, { amount: 5.5 }])).toBe(15.5);
  });

  it("getApplicableCredits returns only the verified rows' ids + total", async () => {
    const { client, captured } = makeClient({
      data: [
        { id: "c1", amount: 100 },
        { id: "c2", amount: 25 },
      ],
    });
    const res = await getApplicableCredits(client, {
      familyId: "fam1",
      creditIds: ["c1", "c2", "c3"],
    });
    expect(res).toEqual({ ids: ["c1", "c2"], total: 125 });
    expect(captured.table).toBe("family_account_credits");
    expect(captured.inIds).toEqual(["c1", "c2", "c3"]);
  });

  it("getApplicableCredits short-circuits with no ids / no family (no query)", async () => {
    const { client, captured } = makeClient({ data: [{ id: "x", amount: 1 }] });
    expect(await getApplicableCredits(client, { familyId: "fam1", creditIds: [] })).toEqual({ ids: [], total: 0 });
    expect(await getApplicableCredits(client, { familyId: null, creditIds: ["c1"] })).toEqual({ ids: [], total: 0 });
    expect(captured.table).toBeUndefined(); // never hit the DB
  });

  it("markCreditsUsed updates the given ids with used_in_batch_id", async () => {
    const { client, captured } = makeClient({});
    await markCreditsUsed(client, { creditIds: ["c1", "c2"], batchId: "batch9" });
    expect(captured.inIds).toEqual(["c1", "c2"]);
    expect(captured.update).toMatchObject({ used_in_batch_id: "batch9" });
    expect((captured.update as Record<string, unknown>).used_at).toBeTruthy();
  });

  it("markCreditsUsed is a no-op with no ids", async () => {
    const { client, captured } = makeClient({});
    await markCreditsUsed(client, { creditIds: [], batchId: "batch9" });
    expect(captured.table).toBeUndefined();
  });

  it("grantAccountCredits: single-family, filters non-positive amounts, stamps issuer + source", async () => {
    const { client, captured } = makeClient({ data: [{ id: "new1" }] });
    const res = await grantAccountCredits(client, {
      familyId: "fam1",
      credits: [
        { amount: 120, reason: "Injury make-up" },
        { amount: 0, reason: "ignored" },
        { amount: -5 },
      ],
      issuedByAdminId: "admin1",
      sourceBatchId: "batch1",
    });
    expect(res.error).toBeUndefined();
    const rows = captured.insert as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1); // 0 and -5 filtered out
    expect(rows[0]).toMatchObject({
      family_id: "fam1",
      amount: 120,
      reason: "Injury make-up",
      issued_by_admin_id: "admin1",
      source_batch_id: "batch1",
    });
  });

  it("grantAccountCredits: multi-family entries each keep their own family/amount", async () => {
    const { client, captured } = makeClient({ data: [{ id: "a" }, { id: "b" }] });
    await grantAccountCredits(client, {
      entries: [
        { familyId: "famA", amount: 50 },
        { familyId: "famB", amount: 75, reason: "Cancellation" },
      ],
      issuedByAdminId: "admin1",
      sourceBatchId: "cancelBatch",
    });
    const rows = captured.insert as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ family_id: "famA", amount: 50, source_batch_id: "cancelBatch" });
    expect(rows[1]).toMatchObject({ family_id: "famB", amount: 75, reason: "Cancellation" });
  });

  it("grantAccountCredits: nothing to insert → no DB call", async () => {
    const { client, captured } = makeClient({});
    const res = await grantAccountCredits(client, { familyId: "fam1", credits: [{ amount: 0 }] });
    expect(res).toEqual({ credits: [] });
    expect(captured.table).toBeUndefined();
  });

  it("getAvailableCredits returns the rows for a family", async () => {
    const { client, captured } = makeClient({ data: [{ id: "c1", amount: 10 }] });
    const rows = await getAvailableCredits(client, "fam1");
    expect(rows).toHaveLength(1);
    expect(captured.table).toBe("family_account_credits");
  });
});
