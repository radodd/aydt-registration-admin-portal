import { createClient } from "@/utils/supabase/server";
import type {
  FamilyDetail,
  FamilyDetailBatch,
  FamilyDetailParent,
  FamilyAccountCreditWithAdmin,
  StoredPaymentMethod,
} from "@/types";

const CREDIT_SELECT = `
  id, family_id, amount, reason, is_active,
  created_at, used_at, source_batch_id, used_in_batch_id,
  issued_by_admin:users!family_account_credits_issued_by_admin_id_fkey(first_name, last_name)
`;

export async function getFamilyDetail(
  familyId: string
): Promise<FamilyDetail | null> {
  const supabase = await createClient();

  // ── Call 1: Family core — users + dancers + registrations ───────────────
  const { data: familyData, error: familyError } = await supabase
    .from("families")
    .select(
      `
      id,
      family_name,
      created_at,

      users:users!family_id (
        id,
        first_name,
        last_name,
        email,
        phone_number,
        is_primary_parent,
        role,
        status,
        address_line1,
        address_line2,
        city,
        state,
        zipcode
      ),

      dancers:dancers!family_id (
        id,
        first_name,
        last_name,
        gender,
        birth_date,
        grade,
        is_self,

        registrations:registrations!dancer_id (
          id,
          status,
          class_sessions!session_id (
            id,
            day_of_week,
            start_time,
            end_time,
            classes ( name, division )
          )
        )
      )
    `
    )
    .eq("id", familyId)
    .single();

  if (familyError || !familyData) {
    console.error("getFamilyDetail family:", familyError?.message);
    return null;
  }

  // ── Call 2: Registration batches + installments ──────────────────────────
  const { data: batchData, error: batchError } = await supabase
    .from("registration_batches")
    .select(
      `
      id,
      status,
      payment_plan_type,
      grand_total,
      created_at,
      confirmed_at,

      semester:semesters!semester_id ( name ),
      parent:users!parent_id ( first_name, last_name ),

      installments:batch_payment_installments (
        id,
        installment_number,
        amount_due,
        due_date,
        status,
        paid_at
      )
    `
    )
    .eq("family_id", familyId)
    .order("created_at", { ascending: false });

  if (batchError) {
    console.error("getFamilyDetail batches:", batchError.message);
  }

  // ── Call 3: Credits ──────────────────────────────────────────────────────
  const { data: creditData, error: creditError } = await supabase
    .from("family_account_credits")
    .select(CREDIT_SELECT)
    .eq("family_id", familyId)
    .order("created_at", { ascending: false });

  if (creditError) {
    console.error("getFamilyDetail credits:", creditError.message);
  }

  // ── Call 4: Stored payment methods per user ──────────────────────────────
  const userIds = (familyData.users as { id: string }[]).map((u) => u.id);
  let paymentMethodsByUserId: Record<string, StoredPaymentMethod[]> = {};

  if (userIds.length > 0) {
    const { data: shopperData, error: shopperError } = await supabase
      .from("shoppers")
      .select(
        `
        user_id,
        stored_payment_methods (
          id,
          shopper_id,
          type,
          epg_stored_id,
          epg_stored_href,
          masked_number,
          card_scheme,
          card_last4,
          expiration_month,
          expiration_year,
          ach_account_type,
          ach_last4,
          account_name,
          is_default,
          created_at
        )
      `
      )
      .in("user_id", userIds);

    if (shopperError) {
      console.error("getFamilyDetail shoppers:", shopperError.message);
    }

    for (const shopper of shopperData ?? []) {
      const methods = (shopper.stored_payment_methods ?? []) as StoredPaymentMethod[];
      paymentMethodsByUserId[shopper.user_id] = methods;
    }
  }

  // ── Post-process ─────────────────────────────────────────────────────────

  const users: FamilyDetailParent[] = (
    familyData.users as FamilyDetailParent[]
  ).map((u) => ({
    ...u,
    storedPaymentMethods: paymentMethodsByUserId[u.id] ?? [],
  }));

  const batches: FamilyDetailBatch[] = (batchData ?? []).map((b) => {
    const installments = (b.installments ?? []) as FamilyDetailBatch["installments"];
    const amountPaid = installments
      .filter((i) => i.status === "paid")
      .reduce((sum, i) => sum + Number(i.amount_due), 0);
    return {
      id: b.id,
      status: b.status,
      payment_plan_type: b.payment_plan_type,
      grand_total: b.grand_total,
      created_at: b.created_at,
      confirmed_at: b.confirmed_at,
      semester: b.semester as unknown as { name: string } | null,
      parent: b.parent as unknown as { first_name: string; last_name: string } | null,
      installments,
      amountPaid,
    };
  });

  const credits = (creditData ?? []) as unknown as FamilyAccountCreditWithAdmin[];

  const creditBalance = credits
    .filter((c) => c.is_active && !c.used_in_batch_id)
    .reduce((sum, c) => sum + Number(c.amount), 0);

  return {
    id: familyData.id,
    family_name: familyData.family_name,
    created_at: familyData.created_at,
    users,
    dancers: familyData.dancers as FamilyDetail["dancers"],
    registration_batches: batches,
    credits,
    creditBalance,
  };
}
