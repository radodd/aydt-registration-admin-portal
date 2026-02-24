"use client";

import { SemesterDraft } from "@/types";
import SemesterForm from "../SemesterForm";
import { useState } from "react";
import Link from "next/link";

type EditSemesterClientProps = {
  semester: any;
  registrationCount?: number;
};

export default function EditSemesterClient({
  semester,
  registrationCount = 0,
}: EditSemesterClientProps) {

  const isLocked = semester.status === "published" && registrationCount > 0;

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
      confirmationEmail: semester.confirmation_email
        ? {
            subject: semester.confirmation_email.subject ?? "",
            fromName: semester.confirmation_email.fromName ?? "",
            fromEmail: semester.confirmation_email.fromEmail ?? "",
            htmlBody: semester.confirmation_email.htmlBody ?? "",
          }
        : undefined,
    };
  }

  const [draft] = useState(() => mapSemesterToDraft(semester));

  return (
    <div>
      {/* Preview action bar */}
      <div className="flex justify-end px-6 pt-4 pb-0">
        <Link
          href={`/preview/semester/${semester.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm bg-amber-50 text-amber-700 border border-amber-200 px-4 py-2 rounded-xl hover:bg-amber-100 transition-colors font-medium"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
          Preview Semester
        </Link>
      </div>

      <SemesterForm
        mode="edit"
        basePath={`/admin/semesters/${semester.id}/edit`}
        initialState={draft}
        isLocked={isLocked}
      />
    </div>
  );
}
