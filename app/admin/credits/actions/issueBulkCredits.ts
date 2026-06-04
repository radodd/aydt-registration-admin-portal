"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/requireAdmin";
import { grantAccountCredits } from "@/queries/credits";

export async function issueBulkCredits(entries: {
  familyId: string;
  amount: number;
  reason?: string;
  sourceBatchId?: string;
}[]): Promise<{ count?: number; error?: string }> {
  let adminUserId: string;
  try {
    const admin = await requireAdmin();
    adminUserId = admin.userId;
  } catch {
    return { error: "Unauthorized" };
  }

  if (!entries.length) return { count: 0 };

  const supabase = await createClient();

  // Single source of truth: bulk multi-family grants route through the same
  // canonical insert path as single grants. Note `sourceBatchId` here is a
  // single value applied to all rows (callers pass one cancellation batch);
  // grantAccountCredits keeps the per-row family/amount/reason from `entries`.
  const { credits, error } = await grantAccountCredits(supabase, {
    entries: entries.map((e) => ({
      familyId: e.familyId,
      amount: e.amount,
      reason: e.reason,
    })),
    issuedByAdminId: adminUserId,
    sourceBatchId: entries[0]?.sourceBatchId ?? null,
  });

  if (error) return { error };

  return { count: credits.length };
}
