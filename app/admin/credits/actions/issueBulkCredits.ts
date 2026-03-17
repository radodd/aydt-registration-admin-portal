"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/requireAdmin";

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

  const rows = entries.map((e) => ({
    family_id: e.familyId,
    amount: e.amount,
    reason: e.reason?.trim() || null,
    issued_by_admin_id: adminUserId,
    source_batch_id: e.sourceBatchId ?? null,
  }));

  const { error } = await supabase.from("family_account_credits").insert(rows);

  if (error) return { error: error.message };

  return { count: rows.length };
}
