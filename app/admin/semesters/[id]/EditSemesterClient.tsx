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
        classes: (semester.classes ?? []).map((c: any) => ({
          id: c.id,
          name: c.name,
          discipline: c.discipline ?? "ballet",
          division: c.division ?? "junior",
          level: c.level ?? undefined,
          description: c.description ?? undefined,
          minAge: c.min_age ?? undefined,
          maxAge: c.max_age ?? undefined,
          isCompetitionTrack: c.is_competition_track ?? false,
          requiresTeacherRec: c.requires_teacher_rec ?? false,
          requirements: (c.class_requirements ?? []).map((r: any) => ({
            id: r.id,
            requirement_type: r.requirement_type,
            description: r.description,
            enforcement: r.enforcement,
            is_waivable: r.is_waivable,
            required_discipline: r.required_discipline ?? null,
            required_level: r.required_level ?? null,
            required_class_id: r.required_class_id ?? null,
          })),
          sessions: (c.class_sessions ?? []).map((cs: any) => ({
            id: cs.id,
            dayOfWeek: cs.day_of_week,
            startTime: cs.start_time ?? undefined,
            endTime: cs.end_time ?? undefined,
            startDate: cs.start_date ?? undefined,
            endDate: cs.end_date ?? undefined,
            location: cs.location ?? undefined,
            instructorName: cs.instructor_name ?? undefined,
            capacity: cs.capacity ?? undefined,
            registrationCloseAt: cs.registration_close_at ?? null,
          })),
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
      tuitionRateBands: (semester.tuition_rate_bands ?? []).map((b: any) => ({
        _clientKey: b.id,
        id: b.id,
        division: b.division,
        weekly_class_count: b.weekly_class_count,
        base_tuition: Number(b.base_tuition),
        recital_fee_included: Number(b.recital_fee_included),
        notes: b.notes ?? undefined,
      })),
      feeConfig: semester.semester_fee_config
        ? {
            registration_fee_per_child: Number(
              semester.semester_fee_config.registration_fee_per_child,
            ),
            family_discount_amount: Number(
              semester.semester_fee_config.family_discount_amount,
            ),
            auto_pay_admin_fee_monthly: Number(
              semester.semester_fee_config.auto_pay_admin_fee_monthly,
            ),
            auto_pay_installment_count: Number(
              semester.semester_fee_config.auto_pay_installment_count,
            ),
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
