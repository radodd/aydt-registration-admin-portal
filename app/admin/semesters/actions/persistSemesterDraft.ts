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

export type PersistSemesterResult =
  | { ok: true; semesterId: string }
  | { ok: false; error: string };

export async function persistSemesterDraft(
  state: SemesterDraft,
): Promise<PersistSemesterResult> {
  await requireAdmin();
  const supabase = await createClient();

  // Known-safe DB errors (published-semester section locks, capacity guards) are
  // RETURNED so the client can surface the real message — a thrown server-action
  // error is sanitized to an opaque digest in production. Unknown errors re-throw.
  try {
  let semesterId: string;
  // When true, the semester is published WITH active enrollments, so the DB
  // locks its registration form / confirmation email / waitlist / payment plan
  // / discounts / session groups. persistSemesterDraft then applies ONLY
  // class/section changes (the class_sections trigger is row-scoped) and leaves
  // those locked domains untouched — the editor UI locks those steps too — so an
  // admin can still add a class without the full-draft re-save tripping the
  // semester-wide locks. Create mode is always an unpublished draft.
  let lockedDomains = false;

  if (!state.id) {
    const { data, error } = await supabase
      .from("semesters")
      .insert({
        name: state.details?.name ?? "Untitled Semester",
        location: state.details?.location ?? null,
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

    lockedDomains = await isSemesterLockedForBulkEdit(supabase, semesterId);

    if (!lockedDomains) {
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
  }

  // Class/section changes are ALWAYS applied — the class_sections lock is
  // row-scoped, so adding a class or editing a non-enrolled section is allowed.
  const idMap = await syncSemesterSessions(
    semesterId,
    state.sessions?.classes ?? [],
  );

  // The remaining domains are semester-wide locked once the semester is
  // published with enrollments. Skip them in that case: re-writing them would
  // trip the semester-wide locks and roll back the whole save, and the editor
  // UI already locks these steps so there is nothing new to persist.
  if (!lockedDomains) {
    await syncSemesterPayment(semesterId, state.paymentPlan);
    await syncSemesterDiscounts(
      semesterId,
      state.discounts?.appliedDiscounts ?? [],
    );
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
      // Option B sync: the Payment Plan section's "Number of installments" is the
      // source of truth for the installment count. If installments are enabled
      // with a non-null count, override fee-config's auto_pay_installment_count
      // here so this upsert doesn't clobber the sync syncSemesterPayment just
      // performed. Immutable spread — does not mutate the caller's state.feeConfig.
      const feeConfigForUpsert =
        state.paymentPlan?.type === "installments" &&
        state.paymentPlan.installmentCount != null
          ? {
              ...state.feeConfig,
              auto_pay_installment_count: state.paymentPlan.installmentCount,
            }
          : state.feeConfig;
      await upsertFeeConfig(supabase, semesterId, feeConfigForUpsert);
    }

    // Tuition engine: sync special program tuition overrides
    if (state.specialProgramTuition !== undefined) {
      await syncSpecialProgramTuition(supabase, semesterId, state.specialProgramTuition);
    }

    // Sync coupon links for this semester
    if (state.coupons !== undefined) {
      await syncSemesterCoupons(semesterId, state.coupons);
    }
  }

    return { ok: true, semesterId };
  } catch (err) {
    const friendly = friendlyPersistError(err);
    if (friendly) return { ok: false, error: friendly };
    throw err;
  }
}

/**
 * Maps known, user-safe DB errors raised during persist to a friendly message.
 * Returns null for anything unrecognized so the caller re-throws — genuinely
 * unexpected failures are not silently swallowed.
 */
function friendlyPersistError(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  // Row-scoped published-semester section lock — the trigger message is already clear.
  if (/active enrollments in a published semester/i.test(msg)) return msg;
  // Legacy semester-wide lock (in case the trigger migration hasn't shipped yet).
  if (/published semester with meeting_enrollments/i.test(msg)) {
    return "This semester has active registrations, so its enrolled classes can’t be changed. You can still add new classes.";
  }
  // Per-session capacity guard (reducing capacity below current enrollment).
  if (/Cannot reduce capacity|registrations exist/i.test(msg)) return msg;
  return null;
}

/**
 * True when a semester is published AND has at least one active enrollment
 * (per-session OR full-term). Those semesters are locked at the DB level against
 * changes to their registration form, confirmation email, waitlist, payment
 * plan, discounts, and session groups. When true, persistSemesterDraft applies
 * only class/section changes so an admin can still add a class. Active-enrollment
 * definition mirrors unpublishSemester() and the class_sections trigger.
 */
async function isSemesterLockedForBulkEdit(
  supabase: SupabaseClient,
  semesterId: string,
): Promise<boolean> {
  const { data: sem } = await supabase
    .from("semesters")
    .select("status")
    .eq("id", semesterId)
    .single();
  if (sem?.status !== "published") return false;

  const [meetingRes, sectionRes] = await Promise.all([
    supabase
      .from("meeting_enrollments")
      .select("*, class_meetings!inner(semester_id)", { count: "exact", head: true })
      .eq("class_meetings.semester_id", semesterId)
      .not("status", "in", "(cancelled,waitlisted)"),
    supabase
      .from("section_enrollments")
      .select("*, class_sections!inner(semester_id)", { count: "exact", head: true })
      .eq("class_sections.semester_id", semesterId)
      .neq("status", "cancelled"),
  ]);
  return ((meetingRes.count ?? 0) + (sectionRes.count ?? 0)) > 0;
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
      costume_fee_exempt_keys: feeConfig.costume_fee_exempt_keys,
    },
    { onConflict: "semester_id" },
  );

  if (error) throw new Error(error.message);
}
