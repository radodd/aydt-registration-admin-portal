"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/requireAdmin";
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

  const { data, error } = await supabase
    .from("family_account_credits")
    .insert({
      family_id: params.familyId,
      amount: params.amount,
      reason: params.reason?.trim() || null,
      issued_by_admin_id: adminUserId,
      source_batch_id: params.sourceBatchId ?? null,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  return { credit: data as FamilyAccountCredit };
}
