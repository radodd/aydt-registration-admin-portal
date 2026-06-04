import type { SupabaseClient } from "@supabase/supabase-js";
import type { FamilyAccountCredit } from "@/types";

/**
 * Canonical access layer for `family_account_credits` — the SINGLE SOURCE OF
 * TRUTH for generating, applying, and reading account credits.
 *
 * Nothing else in the app should `supabase.from("family_account_credits")`
 * directly. Every generate path routes through {@link grantAccountCredits};
 * every apply path through {@link getApplicableCredits} + {@link markCreditsUsed};
 * every "spendable balance" read through {@link getAvailableCredits}.
 *
 * Each function takes an injected Supabase client so it works from both server
 * actions (server client) and client components (browser client).
 */

/** A credit is spendable when it is active and not yet consumed by an order. */
export function isCreditSpendable(c: {
  is_active: boolean;
  used_in_batch_id: string | null;
}): boolean {
  return c.is_active && c.used_in_batch_id == null;
}

/** Sum a list of credit rows. */
export function sumCredits(rows: { amount: number }[]): number {
  return rows.reduce((s, r) => s + Number(r.amount), 0);
}

/**
 * All spendable (active, unused) credits for a family. Used by both checkout
 * surfaces to show "Apply account credit". This is the one place the
 * spendable predicate is expressed for fetches.
 */
export async function getAvailableCredits(
  supabase: SupabaseClient,
  familyId: string,
): Promise<FamilyAccountCredit[]> {
  const { data, error } = await supabase
    .from("family_account_credits")
    .select("*")
    .eq("family_id", familyId)
    .is("used_in_batch_id", null)
    .eq("is_active", true);
  if (error) {
    console.warn("[credits] getAvailableCredits failed:", error.message);
    return [];
  }
  return (data as FamilyAccountCredit[]) ?? [];
}

/**
 * Server-side validation before spending: given a list of credit ids the client
 * wants to apply, return only those that genuinely belong to `familyId` and are
 * still spendable. Callers MUST trust the returned `total`/`ids`, never a
 * client-supplied amount — this is what prevents an admin (or a tampered client)
 * from applying another family's or already-used credits.
 */
export async function getApplicableCredits(
  supabase: SupabaseClient,
  params: { familyId: string | null; creditIds?: string[] },
): Promise<{ ids: string[]; total: number }> {
  const { familyId, creditIds } = params;
  if (!familyId || !creditIds?.length) return { ids: [], total: 0 };

  const { data, error } = await supabase
    .from("family_account_credits")
    .select("id, amount")
    .in("id", creditIds)
    .eq("family_id", familyId)
    .is("used_in_batch_id", null)
    .eq("is_active", true);

  if (error) {
    console.warn("[credits] getApplicableCredits failed:", error.message);
    return { ids: [], total: 0 };
  }
  const rows = (data as { id: string; amount: number }[]) ?? [];
  return { ids: rows.map((r) => r.id), total: sumCredits(rows) };
}

/**
 * Consume credits against an order. Pass the VERIFIED ids from
 * {@link getApplicableCredits}. Best-effort: logs on failure, never throws, so a
 * registration is never blocked by a credit-marking hiccup.
 */
export async function markCreditsUsed(
  supabase: SupabaseClient,
  params: { creditIds: string[]; batchId: string },
): Promise<void> {
  if (!params.creditIds.length) return;
  const { error } = await supabase
    .from("family_account_credits")
    .update({ used_in_batch_id: params.batchId, used_at: new Date().toISOString() })
    .in("id", params.creditIds);
  if (error) console.warn("[credits] markCreditsUsed failed:", error.message);
}

export type CreditGrant = { amount: number; reason?: string | null };

/**
 * The ONE insert path for new account credits. Validates each amount > 0 and
 * stamps issuer + source order. Used by issueAccountCredit (single),
 * issueBulkCredits (many families), and the admin-registration grant (#17).
 */
export async function grantAccountCredits(
  supabase: SupabaseClient,
  params: {
    /** Single-family grants. Mutually combinable with `entries`. */
    familyId?: string | null;
    credits?: CreditGrant[];
    /** Multi-family grants (each row may target a different family). */
    entries?: { familyId: string; amount: number; reason?: string | null }[];
    issuedByAdminId?: string | null;
    /** Optional order this credit originated from (refund, injury make-up, …). */
    sourceBatchId?: string | null;
  },
): Promise<{ credits: FamilyAccountCredit[]; error?: string }> {
  const rows: {
    family_id: string;
    amount: number;
    reason: string | null;
    issued_by_admin_id: string | null;
    source_batch_id: string | null;
  }[] = [];

  if (params.familyId && params.credits?.length) {
    for (const c of params.credits) {
      if (c.amount > 0) {
        rows.push({
          family_id: params.familyId,
          amount: c.amount,
          reason: c.reason?.trim() || null,
          issued_by_admin_id: params.issuedByAdminId ?? null,
          source_batch_id: params.sourceBatchId ?? null,
        });
      }
    }
  }

  for (const e of params.entries ?? []) {
    if (e.amount > 0) {
      rows.push({
        family_id: e.familyId,
        amount: e.amount,
        reason: e.reason?.trim() || null,
        issued_by_admin_id: params.issuedByAdminId ?? null,
        source_batch_id: params.sourceBatchId ?? null,
      });
    }
  }

  if (rows.length === 0) return { credits: [] };

  const { data, error } = await supabase
    .from("family_account_credits")
    .insert(rows)
    .select();

  if (error) return { credits: [], error: error.message };
  return { credits: (data as FamilyAccountCredit[]) ?? [] };
}
