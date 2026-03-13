// "use server";

// import { createClient } from "@/utils/supabase/server";
// import { SemesterDraft } from "@/types";
// import { syncSemesterDiscounts } from "./syncSemesterDiscounts";
// import { syncSemesterSessionGroups } from "./syncSemesterGroups";
// import { syncSemesterPayment } from "./syncSemesterPayments";
// import { syncSemesterSessions } from "./syncSemesterSessions";
// import { updateSemesterDetails } from "./updateSemesterDetails";

// export async function persistSemesterDraft(
//   state: SemesterDraft,
// ): Promise<{ semesterId: string }> {
//   let semesterId: string;

//   if (!state.id) {
//     // Create mode — first time persisting; INSERT the semester record
//     const supabase = await createClient();
//     const { data, error } = await supabase
//       .from("semesters")
//       .insert({
//         name: state.details?.name ?? "Untitled Semester",
//         tracking_mode: state.details?.trackingMode ?? false,
//         capacity_warning_threshold:
//           state.details?.capacityWarningThreshold ?? null,
//         publish_at: state.details?.publishAt ?? null,
//         status: "draft",
//         registration_form: state.registrationForm ?? { elements: [] },
//       })
//       .select("id")
//       .single();

//     if (error) throw new Error(error.message);
//     semesterId = data.id;
//   } else {
//     semesterId = state.id;
//     // Edit mode — UPDATE existing semester details
//     await updateSemesterDetails(semesterId, state.details);

//     const { error: formError } = await supabase
//       .from("semesters")
//       .update({
//         registration_form: state.registrationForm ?? { elements: [] },
//       })
//       .eq("id", semesterId);

//     if (formError) throw new Error(formError.message);
//   }

//   const appliedDiscounts = state.discounts?.appliedDiscounts ?? [];

//   const idMap = await syncSemesterSessions(
//     semesterId,
//     state.sessions?.appliedSessions ?? [],
//   );

//   await syncSemesterPayment(semesterId, state.paymentPlan);
//   await syncSemesterDiscounts(semesterId, appliedDiscounts);
//   await syncSemesterSessionGroups(
//     semesterId,
//     state.sessionGroups?.groups ?? [],
//     idMap,
//   );

//   return { semesterId };
// }
"use server";

import { createClient } from "@/utils/supabase/server";
import { SemesterDraft } from "@/types";
import { syncSemesterDiscounts } from "./syncSemesterDiscounts";
import { syncSemesterCoupons } from "./syncSemesterCoupons";
import { syncSemesterSessionGroups } from "./syncSemesterGroups";
import { syncSemesterPayment } from "./syncSemesterPayments";
import { syncSemesterSessions } from "./syncSemesterSessions";
import { updateSemesterDetails } from "./updateSemesterDetails";
import { requireAdmin } from "@/utils/requireAdmin";

export async function persistSemesterDraft(
  state: SemesterDraft,
): Promise<{ semesterId: string }> {
  await requireAdmin();
  const supabase = await createClient();
  let semesterId: string;

  if (!state.id) {
    const { data, error } = await supabase
      .from("semesters")
      .insert({
        name: state.details?.name ?? "Untitled Semester",
        tracking_mode: state.details?.trackingMode ?? false,
        capacity_warning_threshold:
          state.details?.capacityWarningThreshold ?? null,
        publish_at: state.details?.publishAt ?? null,
        status: "draft",
        registration_form: state.registrationForm ?? { elements: [] },
        confirmation_email: state.confirmationEmail ?? {},
        waitlist_settings: state.waitlist ?? { enabled: false },
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    semesterId = data.id;
  } else {
    semesterId = state.id;

    await updateSemesterDetails(semesterId, state.details);

    const { error: formError } = await supabase
      .from("semesters")
      .update({
        registration_form: state.registrationForm ?? { elements: [] },
        confirmation_email: state.confirmationEmail ?? {},
        waitlist_settings: state.waitlist ?? { enabled: false },
      })
      .eq("id", semesterId);

    if (formError) throw new Error(formError.message);
  }

  const appliedDiscounts = state.discounts?.appliedDiscounts ?? [];

  const idMap = await syncSemesterSessions(
    semesterId,
    state.sessions?.classes ?? [],
  );

  await syncSemesterPayment(semesterId, state.paymentPlan);
  await syncSemesterDiscounts(semesterId, appliedDiscounts);
  await syncSemesterSessionGroups(
    semesterId,
    state.sessionGroups?.groups ?? [],
    idMap,
  );

  // Phase 2: sync tuition rate bands
  if (state.tuitionRateBands !== undefined) {
    await syncTuitionRateBands(supabase, semesterId, state.tuitionRateBands);
  }

  // Phase 2: upsert fee config
  if (state.feeConfig !== undefined) {
    await upsertFeeConfig(supabase, semesterId, state.feeConfig);
  }

  // Tuition engine: sync special program tuition overrides
  if (state.specialProgramTuition !== undefined) {
    await syncSpecialProgramTuition(supabase, semesterId, state.specialProgramTuition);
  }

  // Sync coupon links for this semester
  if (state.coupons !== undefined) {
    await syncSemesterCoupons(semesterId, state.coupons);
  }

  return { semesterId };
}

/* -------------------------------------------------------------------------- */
/* Phase 2 helpers                                                             */
/* -------------------------------------------------------------------------- */

type SupabaseClient = Awaited<
  ReturnType<typeof import("@/utils/supabase/server").createClient>
>;

async function syncTuitionRateBands(
  supabase: SupabaseClient,
  semesterId: string,
  bands: import("@/types").DraftTuitionRateBand[],
) {
  // Delete all existing bands for this semester, then re-insert.
  const { error: deleteError } = await supabase
    .from("tuition_rate_bands")
    .delete()
    .eq("semester_id", semesterId);

  if (deleteError) throw new Error(deleteError.message);

  if (bands.length === 0) return;

  const rows = bands.map((b) => ({
    semester_id: semesterId,
    division: b.division,
    weekly_class_count: b.weekly_class_count,
    base_tuition: b.base_tuition,
    progressive_discount_percent: b.progressive_discount_percent ?? 0,
    semester_total: b.semester_total ?? null,
    autopay_installment_amount: b.autopay_installment_amount ?? null,
    notes: b.notes ?? null,
  }));

  const { error: insertError } = await supabase
    .from("tuition_rate_bands")
    .insert(rows);

  if (insertError) throw new Error(insertError.message);
}

async function syncSpecialProgramTuition(
  supabase: SupabaseClient,
  semesterId: string,
  programs: import("@/types").DraftSpecialProgramTuition[],
) {
  const { error: deleteError } = await supabase
    .from("special_program_tuition")
    .delete()
    .eq("semester_id", semesterId);

  if (deleteError) throw new Error(deleteError.message);

  if (programs.length === 0) return;

  const rows = programs.map((p) => ({
    semester_id: semesterId,
    program_key: p.programKey,
    program_label: p.programLabel,
    semester_total: p.semesterTotal,
    autopay_installment_amount: p.autoPayInstallmentAmount ?? null,
    autopay_installment_count: p.autoPayInstallmentCount ?? null,
    registration_fee_override: p.registrationFeeOverride ?? null,
    notes: p.notes ?? null,
  }));

  const { error: insertError } = await supabase
    .from("special_program_tuition")
    .insert(rows);

  if (insertError) throw new Error(insertError.message);
}

async function upsertFeeConfig(
  supabase: SupabaseClient,
  semesterId: string,
  feeConfig: import("@/types").DraftFeeConfig,
) {
  const { error } = await supabase.from("semester_fee_config").upsert(
    {
      semester_id: semesterId,
      registration_fee_per_child: feeConfig.registration_fee_per_child,
      family_discount_amount: feeConfig.family_discount_amount,
      auto_pay_admin_fee_monthly: feeConfig.auto_pay_admin_fee_monthly,
      auto_pay_installment_count: feeConfig.auto_pay_installment_count,
      senior_video_fee_per_registrant: feeConfig.senior_video_fee_per_registrant,
      senior_costume_fee_per_class: feeConfig.senior_costume_fee_per_class,
      junior_costume_fee_per_class: feeConfig.junior_costume_fee_per_class,
    },
    { onConflict: "semester_id" },
  );

  if (error) throw new Error(error.message);
}
