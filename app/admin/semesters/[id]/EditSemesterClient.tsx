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
  semester_payment_plans: any;
  semester_payment_installments: any[];
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
      sessions: {
        appliedSessions: semester.sessions.map((s) => ({
          sessionId: s.id,

          title: s.title,
          type: s.type,
          capacity: s.capacity,

          startDate: s.start_date,
          endDate: s.end_date,
          daysOfWeek: s.days_of_week,

          // no overrides when editing existing
          overriddenTitle: null,
          overriddenCategory: null,
          overriddenType: null,
          overriddenCapacity: null,
          overriddenStartDate: null,
          overriddenEndDate: null,
          overriddenDaysOfWeek: null,
        })),
      },
      paymentPlan: semester.semester_payment_plans
        ? {
            type: semester.semester_payment_plans.type,
            depositAmount: semester.semester_payment_plans.deposit_amount,
            depositPercent: semester.semester_payment_plans.deposit_percent,
            installmentCount: semester.semester_payment_plans.installment_count,
            dueDate: semester.semester_payment_plans.due_date,
            installments: semester.semester_payment_installments?.map((i) => ({
              number: i.installment_number,
              amount: i.amount,
              dueDate: i.due_date,
            })),
          }
        : undefined,
      discounts: {
        appliedDiscounts:
          semester.semester_discounts?.map((sd) => ({
            discountId: sd.discount_id,
            scope: "all_sessions", // until you persist scope properly
            sessionIds: [],
          })) ?? [],
      },
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
      basePath={`/admin/semesters/${semester.id}/edit`}
      initialState={mapSemesterToDraft(semester)}
      onFinalSubmit={handleUpdate}
    />
  );
}
