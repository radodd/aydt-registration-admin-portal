"use server";

import { SemesterDraft } from "@/types";
import { syncSemesterDiscounts } from "./syncSemesterDiscounts";
import { syncSemesterSessionGroups } from "./syncSemesterGroups";
import { syncSemesterPayment } from "./syncSemesterPayments";
import { syncSemesterSessions } from "./syncSemesterSessions";
import { updateSemesterDetails } from "./updateSemesterDetails";

export async function persistSemesterDraft(state: SemesterDraft) {
  if (!state.id) {
    throw new Error("Missing semester ID");
  }

  const appliedDiscounts = state.discounts?.appliedDiscounts ?? [];

  await updateSemesterDetails(state.id, state.details);

  const idMap = await syncSemesterSessions(
    state.id,
    state.sessions?.appliedSessions ?? [],
  );

  await syncSemesterPayment(state.id, state.paymentPlan);

  await syncSemesterDiscounts(state.id, appliedDiscounts);

  await syncSemesterSessionGroups(
    state.id,
    state.sessionGroups?.groups ?? [],
    idMap,
  );

  return { success: true };
}
