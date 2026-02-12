"use client";

import { SemesterDraft } from "@/types";
import { updateSemesterDetails } from "../actions/updateSemesterDetails";
import SemesterForm from "../SemesterForm";
// import { updateSemester } from "../actions/updateSemester";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

type SemesterWithRelations = {
  id: string;
  name: string;
  tracking_mode: boolean;
  capacity_warning_threshold: number | null;
  publish_at: string | null;

  sessions: any[];
  payment_plan: any[];
  semester_discounts: any[];
  discounts: any[];
};

type EditSemesterClientProps = {
  semester: SemesterWithRelations;
};

export default function EditSemesterClient({
  semester,
}: EditSemesterClientProps) {
  const router = useRouter();

  function mapSemesterToDraft(semester: SemesterWithRelations) {
    return {
      id: semester.id,
      details: {
        name: semester.name,
        trackingMode: semester.tracking_mode,
        capacity_warning_threshold: semester.capacity_warning_threshold,
        publish_at: semester.publish_at,
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

  useEffect(() => {
    console.group("🔎 EditSemesterClient: Raw Semester");
    console.log(semester);
    console.log("Sessions:", semester.sessions);
    console.log("Payment Plan:", semester.payment_plan);
    console.log("Semester Discounts:", semester.semester_discounts);
    console.log("Discounts:", semester.discounts);
    console.groupEnd();
  }, [semester]);

  return (
    <SemesterForm
      mode="edit"
      basePath={`/admin/semesters/${semester.id}`}
      initialState={mapSemesterToDraft(semester)}
      onFinalSubmit={handleUpdate}
    />
  );
}
