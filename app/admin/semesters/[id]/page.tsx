"use client";

import { SemesterDraft } from "@/types";
import { updateSemesterDetails } from "../actions/updateSemesterDetails";
import SemesterForm from "../SemesterForm";
// import { updateSemester } from "../actions/updateSemester";
import { useRouter } from "next/navigation";

export default function EditSemesterClient({ semester }) {
  const router = useRouter();

  function mapSemesterToDraft(semester): SemesterDraft {
    return {
      id: semester.id,
      details: {
        name: semester.name,
        startDate: semester.start_date,
        endDate: semester.end_date,
      },
      sessions: semester.sessions,
      paymentPlan: semester.payment_plan,
      discounts: semester.discounts,
    };
  }

  async function handleUpdate(state: SemesterDraft) {
    await updateSemesterDetails(semester.id, state);
    router.push("/admin/semesters");
  }

  return (
    <SemesterForm
      mode="edit"
      basePath={`/admin/semesters/${semester.id}`}
      initialState={mapSemesterToDraft(semester)}
      onFinalSubmit={handleUpdate}
    />
  );
}
