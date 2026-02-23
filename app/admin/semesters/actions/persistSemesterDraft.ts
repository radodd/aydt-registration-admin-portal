"use server";

import { createClient } from "@/utils/supabase/server";
import { SemesterDraft } from "@/types";
import { syncSemesterDiscounts } from "./syncSemesterDiscounts";
import { syncSemesterSessionGroups } from "./syncSemesterGroups";
import { syncSemesterPayment } from "./syncSemesterPayments";
import { syncSemesterSessions } from "./syncSemesterSessions";
import { updateSemesterDetails } from "./updateSemesterDetails";

export async function persistSemesterDraft(
  state: SemesterDraft,
): Promise<{ semesterId: string }> {
  let semesterId: string;

  if (!state.id) {
    // Create mode — first time persisting; INSERT the semester record
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("semesters")
      .insert({
        name: state.details?.name ?? "Untitled Semester",
        tracking_mode: state.details?.trackingMode ?? false,
        capacity_warning_threshold:
          state.details?.capacityWarningThreshold ?? null,
        publish_at: state.details?.publishAt ?? null,
        status: "draft",
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    semesterId = data.id;
  } else {
    semesterId = state.id;
    // Edit mode — UPDATE existing semester details
    await updateSemesterDetails(semesterId, state.details);
  }

  const appliedDiscounts = state.discounts?.appliedDiscounts ?? [];

  const idMap = await syncSemesterSessions(
    semesterId,
    state.sessions?.appliedSessions ?? [],
  );

  await syncSemesterPayment(semesterId, state.paymentPlan);
  await syncSemesterDiscounts(semesterId, appliedDiscounts);
  await syncSemesterSessionGroups(
    semesterId,
    state.sessionGroups?.groups ?? [],
    idMap,
  );

  return { semesterId };
}
