"use server";

import { createClient } from "@/utils/supabase/server";
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

  const result = await createAdminRegistration(regInput);
  if (!result.success) {
    return { success: false, error: result.error ?? "Registration failed." };
  }

  // Mark the waitlist entry resolved.
  await supabase
    .from("waitlist_entries")
    .update({ status: "registered" })
    .eq("id", input.entryId);

  return { success: true, batchId: result.batchId };
}
