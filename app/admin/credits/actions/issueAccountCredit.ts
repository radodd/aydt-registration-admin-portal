"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/requireAdmin";
import { grantAccountCredits } from "@/queries/credits";
import type { FamilyAccountCredit } from "@/types";

export async function issueAccountCredit(params: {
  familyId: string;
  amount: number;
  reason?: string;
  sourceBatchId?: string;
}): Promise<{ credit?: FamilyAccountCredit; error?: string }> {
  let adminUserId: string;
  try {
    const admin = await requireAdmin();
    adminUserId = admin.userId;
  } catch {
    return { error: "Unauthorized" };
  }

  if (!params.amount || params.amount <= 0) {
    return { error: "Amount must be greater than $0." };
  }

  const supabase = await createClient();

  // Single source of truth: all grants go through the canonical query layer.
  const { credits, error } = await grantAccountCredits(supabase, {
    familyId: params.familyId,
    credits: [{ amount: params.amount, reason: params.reason }],
    issuedByAdminId: adminUserId,
    sourceBatchId: params.sourceBatchId ?? null,
  });

  if (error) return { error };
  return { credit: credits[0] };
}
