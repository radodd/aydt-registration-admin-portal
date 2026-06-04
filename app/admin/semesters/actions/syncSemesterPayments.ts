"use server";

import { createClient } from "@/utils/supabase/server";
import { SemesterDraft } from "@/types";
import { requireAdmin } from "@/utils/requireAdmin";

export async function syncSemesterPayment(
  semesterId: string,
  payment?: SemesterDraft["paymentPlan"],
) {
  await requireAdmin();
  const supabase = await createClient();

  // If no payment defined → remove existing
  if (!payment) {
    await supabase
      .from("semester_payment_plans")
      .delete()
      .eq("semester_id", semesterId);

    await supabase
      .from("semester_payment_installments")
      .delete()
      .eq("semester_id", semesterId);

    return;
  }

  // 1️⃣ Upsert payment plan (1:1)
  const { error: planError } = await supabase
    .from("semester_payment_plans")
    .upsert(
      {
        semester_id: semesterId,
        type: payment.type,
        deposit_amount: payment.depositAmount ?? null,
        deposit_percent: payment.depositPercent ?? null,
        installment_count: payment.installmentCount ?? null,
        due_date: payment.dueDate,
      },
      { onConflict: "semester_id" },
    );

  if (planError) {
    throw new Error(planError.message);
  }

  // 1️⃣b Sync semester_fee_config.auto_pay_installment_count ← the admin's
  // "Number of installments" input on the Payment Plan section. That field
  // (semester_payment_plans.installment_count) is the source of truth — it
  // sits next to the installments toggle and is exposed to families — but
  // the pricing engine reads auto_pay_installment_count, so without this
  // sync the two could disagree silently. Only fires for installment plans
  // with a non-null count; pay_in_full / deposit_* leave fee-config alone.
  if (payment.type === "installments" && payment.installmentCount != null) {
    const { error: feeConfigSyncError } = await supabase
      .from("semester_fee_config")
      .update({ auto_pay_installment_count: payment.installmentCount })
      .eq("semester_id", semesterId);

    if (feeConfigSyncError) {
      throw new Error(feeConfigSyncError.message);
    }
  }

  // 2️⃣ Reset installments
  const { error: deleteError } = await supabase
    .from("semester_payment_installments")
    .delete()
    .eq("semester_id", semesterId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  // 3️⃣ Insert installments if applicable
  if (payment.type === "installments" && payment.installments?.length) {
    const rows = payment.installments.map((inst) => ({
      semester_id: semesterId,
      installment_number: inst.number,
      amount: inst.amount,
      due_date: inst.dueDate,
    }));

    const { error: insertError } = await supabase
      .from("semester_payment_installments")
      .insert(rows);

    if (insertError) {
      throw new Error(insertError.message);
    }
  }
}
