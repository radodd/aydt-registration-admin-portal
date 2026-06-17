"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireAdmin } from "@/utils/requireAdmin";
import {
  createAdminRegistration,
  type AdminRegInput,
  type NewDancerInput,
} from "@/app/admin/register/actions/createAdminRegistration";

export interface RegisterWaitlistEntryInput {
  entryId: string;
  /** Custom total set by the admin (super-admin "catch-all" price). */
  priceOverride?: number | null;
  paymentMethod: string;
  amountCollected: number;
  payerName?: string;
  checkNumber?: string;
  notes?: string;
}

export interface RegisterWaitlistEntryResult {
  success: boolean;
  batchId?: string;
  error?: string;
}

/**
 * Meeting-plan #5, Path B: convert a waitlist entry into a real registration
 * from inside the admin portal. Reuses the item #7 createAdminRegistration path
 * (offline / admin-collected payment) and marks the entry "registered". For the
 * tokenized parent-payment path see Path A (inviteWaitlistEntryByLink).
 */
export async function registerWaitlistEntryInPortal(
  input: RegisterWaitlistEntryInput,
): Promise<RegisterWaitlistEntryResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: entry, error } = await supabase
    .from("waitlist_entries")
    .select(
      "id, status, dancer_id, family_id, parent_user_id, class_id, section_id, meeting_id, class_tier_id, form_data, contact_name, classes(name, semester_id, semesters(name))",
    )
    .eq("id", input.entryId)
    .maybeSingle();

  if (error || !entry) {
    return { success: false, error: "Waitlist entry not found." };
  }
  if (entry.status === "registered") {
    return { success: false, error: "This entry has already been registered." };
  }

  const classRel = entry.classes as
    | { name?: string; semester_id?: string; semesters?: { name?: string } | { name?: string }[] }
    | { name?: string; semester_id?: string; semesters?: { name?: string } | { name?: string }[] }[]
    | null;
  const cls = Array.isArray(classRel) ? classRel[0] : classRel;
  const semesterId = cls?.semester_id;
  const semRel = Array.isArray(cls?.semesters) ? cls?.semesters[0] : cls?.semesters;
  const semesterName = semRel?.name ?? "";

  if (!semesterId) {
    return { success: false, error: "Could not resolve the semester for this class." };
  }

  // Resolve the enrollment target. Standard/tiered → scheduleIds (section);
  // drop-in → sessionIds (meeting).
  const scheduleIds: string[] = [];
  const sessionIds: string[] = [];
  let classTierIdsBySchedule: Record<string, string> | undefined;

  if (entry.section_id) {
    scheduleIds.push(entry.section_id as string);
    if (entry.class_tier_id) {
      classTierIdsBySchedule = { [entry.section_id as string]: entry.class_tier_id as string };
    }
  } else if (entry.meeting_id) {
    sessionIds.push(entry.meeting_id as string);
  } else {
    return {
      success: false,
      error: "This entry has no class section or meeting to register into.",
    };
  }

  // Existing dancer vs brand-new (captured as form_data._newDancer in joinWaitlist).
  const formData = { ...(entry.form_data as Record<string, unknown> | null) };
  const newDancerRaw = (formData as { _newDancer?: Record<string, unknown> })._newDancer;
  delete (formData as { _newDancer?: unknown })._newDancer;

  let dancerId: string | null = (entry.dancer_id as string | null) ?? null;
  let dancerName = entry.contact_name ?? "Waitlisted dancer";
  let newDancer: NewDancerInput | null = null;

  if (!dancerId && newDancerRaw) {
    const nd = newDancerRaw as {
      firstName?: string;
      lastName?: string;
      dateOfBirth?: string;
      gender?: string;
    };
    newDancer = {
      firstName: nd.firstName ?? "",
      lastName: nd.lastName ?? "",
      birthDate: nd.dateOfBirth ?? "",
      gender: nd.gender ?? "",
      grade: "",
      familyId: (entry.family_id as string | null) ?? null,
    };
    dancerName = `${nd.firstName ?? ""} ${nd.lastName ?? ""}`.trim() || dancerName;
  } else if (dancerId) {
    const { data: d } = await supabase
      .from("dancers")
      .select("first_name, last_name")
      .eq("id", dancerId)
      .maybeSingle();
    if (d) {
      dancerName =
        `${(d as { first_name?: string }).first_name ?? ""} ${
          (d as { last_name?: string }).last_name ?? ""
        }`.trim() || dancerName;
    }
  } else {
    return {
      success: false,
      error: "This entry has no dancer information to register.",
    };
  }

  const regInput: AdminRegInput = {
    semesterId,
    semesterName,
    scheduleIds,
    sessionIds: sessionIds.length ? sessionIds : undefined,
    classTierIdsBySchedule,
    dancerId,
    dancerName,
    familyId: (entry.family_id as string | null) ?? null,
    parentUserId: (entry.parent_user_id as string | null) ?? null,
    newDancer,
    formData,
    priceOverride: input.priceOverride ?? null,
    paymentPlanType: "pay_in_full",
    paymentMethod: input.paymentMethod,
    amountCollected: input.amountCollected,
    payerName: input.payerName,
    checkNumber: input.checkNumber,
    notes: input.notes,
  };

  // If a refund-/capacity-freed seat is being HELD for the admin (an
  // admin_reserved placeholder), release ONE so capacity has room for this
  // enrollment. Restored if the registration fails so the seat isn't lost.
  // seat_holds is owner-scoped, so use the service-role client.
  const admin = createAdminClient();
  const grainCol = entry.section_id ? "section_id" : entry.meeting_id ? "meeting_id" : null;
  const grainVal = (entry.section_id as string | null) ?? (entry.meeting_id as string | null);
  let releasedPlaceholderId: string | null = null;
  if (grainCol && grainVal) {
    const { data: ph } = await admin
      .from("seat_holds")
      .select("id")
      .eq("hold_type", "admin_reserved")
      .is("released_at", null)
      .eq(grainCol, grainVal)
      .limit(1)
      .maybeSingle();
    if (ph) {
      await admin
        .from("seat_holds")
        .update({ released_at: new Date().toISOString() })
        .eq("id", (ph as { id: string }).id);
      releasedPlaceholderId = (ph as { id: string }).id;
    }
  }

  const result = await createAdminRegistration(regInput);
  if (!result.success) {
    // Restore the held seat so a failed assignment doesn't lose it.
    if (releasedPlaceholderId) {
      await admin.from("seat_holds").update({ released_at: null }).eq("id", releasedPlaceholderId);
    }
    return { success: false, error: result.error ?? "Registration failed." };
  }

  // Mark the waitlist entry resolved.
  await supabase
    .from("waitlist_entries")
    .update({ status: "registered" })
    .eq("id", input.entryId);

  // Log the manual assignment for the admin Logs view (best-effort).
  await admin
    .from("waitlist_promotion_events")
    .insert({
      event_type: "manual_assigned",
      severity: "info",
      waitlist_entry_id: input.entryId,
      class_id: (entry.class_id as string | null) ?? null,
      section_id: (entry.section_id as string | null) ?? null,
      meeting_id: (entry.meeting_id as string | null) ?? null,
      semester_id: semesterId,
      batch_id: result.batchId ?? null,
      message: releasedPlaceholderId
        ? "Admin assigned a held (refund-freed) seat to a waitlisted dancer."
        : "Admin registered a waitlisted dancer.",
      detail: { released_placeholder: !!releasedPlaceholderId },
    })
    .then(() => {}, () => {});

  return { success: true, batchId: result.batchId };
}
