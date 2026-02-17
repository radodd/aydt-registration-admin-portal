"use client";

import { SemesterDraft } from "@/types";
import { useRouter } from "next/navigation";
import SemesterForm from "../SemesterForm";
import { publishSemester } from "../actions/publishSemester";
import { syncSemesterDiscounts } from "../actions/syncSemesterDiscounts";
import { updateSemesterDetails } from "../actions/updateSemesterDetails";
import { syncSemesterSessions } from "../actions/syncSemesterSessions";
import { syncSemesterPayment } from "../actions/syncSemesterPayments";
import { syncSemesterSessionGroups } from "../actions/syncSemesterGroups";

export default function NewSemesterPage() {
  const router = useRouter();

  async function handleCreate(state: SemesterDraft) {
    console.group("🚀 NewSemesterPage.handleCreate");
    console.log("Incoming draft state:", state);

    if (!state.id) {
      console.error("❌ Missing semester ID before publish");
      console.groupEnd();
      throw new Error("Cannot publish semester without ID");
    }

    try {
      const appliedDiscounts = state.discounts?.appliedDiscounts ?? [];

      // 🔴 Persist discount bridge rows
      await syncSemesterDiscounts(state.id, appliedDiscounts);
      await updateSemesterDetails(state.id, state.details);
      const idMap = await syncSemesterSessions(
        state.id,
        state.sessions?.appliedSessions ?? [],
      );
      await syncSemesterPayment(state.id, state.paymentPlan);
      await syncSemesterSessionGroups(
        state.id,
        state.sessionGroups?.groups ?? [],
        idMap,
      );

      console.log("Publishing semester with ID:", state.id);

      await publishSemester(state.id);

      console.log("✅ Publish successful");
      console.log("Redirecting to /admin/semesters");

      router.push("/admin/semesters");
    } catch (err) {
      console.error("❌ Publish failed:", err);
      throw err;
    } finally {
      console.groupEnd();
    }
  }

  return (
    <SemesterForm
      mode="create"
      basePath="/admin/semesters/new"
      onFinalSubmit={handleCreate}
    />
  );
}
