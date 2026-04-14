"use server";

import { createClient } from "@/utils/supabase/server";

export async function waiveInstallment(installmentId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("batch_payment_installments")
    .update({ status: "waived" })
    .eq("id", installmentId);
  if (error) return { error: error.message };
  return {};
}
