"use client";

import { SemesterDraft } from "@/types";
import SemesterForm from "../SemesterForm";
import { useState } from "react";

type EditSemesterClientProps = {
  semester: any;
};

export default function EditSemesterClient({
  semester,
}: EditSemesterClientProps) {

  function mapSemesterToDraft(semester: any): SemesterDraft {
    return {
      id: semester.id,
      details: {
        name: semester.name,
        trackingMode: semester.tracking_mode,
        capacityWarningThreshold: semester.capacity_warning_threshold,
        publishAt: semester.publish_at,
      },
      sessions: {
        appliedSessions: semester.sessions.map((s: any) => ({
          sessionId: s.id,
          title: s.title,
          type: s.type,
          capacity: s.capacity,
          startDate: s.start_date,
          endDate: s.end_date,
          daysOfWeek: s.days_of_week,
          overriddenTitle: null,
          overriddenCategory: null,
          overriddenType: null,
          overriddenCapacity: null,
          overriddenStartDate: null,
          overriddenEndDate: null,
          overriddenDaysOfWeek: null,
        })),
      },
      sessionGroups: {
        groups: (semester.session_groups ?? []).map((g: any) => ({
          id: g.id,
          name: g.name,
          sessionIds: (g.session_group_sessions ?? []).map(
            (sgs: any) => sgs.session_id,
          ),
        })),
      },
      paymentPlan: semester.semester_payment_plans
        ? {
            type: semester.semester_payment_plans.type,
            depositAmount: semester.semester_payment_plans.deposit_amount,
            depositPercent: semester.semester_payment_plans.deposit_percent,
            installmentCount: semester.semester_payment_plans.installment_count,
            dueDate: semester.semester_payment_plans.due_date,
            installments: semester.semester_payment_installments?.map(
              (i: any) => ({
                number: i.installment_number,
                amount: i.amount,
                dueDate: i.due_date,
              }),
            ),
          }
        : undefined,
      discounts: {
        appliedDiscounts:
          semester.semester_discounts?.map((sd: any) => ({
            discountId: sd.discount_id,
            scope: sd.discount.eligible_sessions_mode,
            sessionIds:
              sd.discount.eligible_sessions_mode === "selected"
                ? (sd.discount.discount_rule_sessions?.map(
                    (s: any) => s.session_id,
                  ) ?? [])
                : [],
          })) ?? [],
      },
      registrationForm: semester.registration_form ?? { elements: [] },
    };
  }

  // 🔥 This is the important line
  const [draft] = useState(() => mapSemesterToDraft(semester));

  return (
    <SemesterForm
      mode="edit"
      basePath={`/admin/semesters/${semester.id}/edit`}
      initialState={draft}
    />
  );
}
