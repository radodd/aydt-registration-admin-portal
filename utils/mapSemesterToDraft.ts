import type {
  DraftClass,
  DraftClassSchedule,
  SemesterDraft,
} from "@/types";

/**
 * Converts a raw Supabase semester object (snake_case DB fields) into the
 * SemesterDraft shape used by the admin UI and SemesterTabs components.
 *
 * Expects the semester query to include:
 *   classes(*, class_schedules(*, schedule_price_tiers(*)), class_requirements(*))
 *   session_groups(id, name, session_group_sessions(session_id))
 *   semester_payment_plans(*)
 *   semester_payment_installments(*)
 *   semester_discounts(semester_id, discount_id, discount:discounts(*, discount_rules(*), discount_rule_sessions(*)))
 *   tuition_rate_bands(*)
 *   semester_fee_config(*)
 */
export function mapSemesterToDraft(semester: any): SemesterDraft {
  // Supabase returns semester_payment_plans as an object (unique FK) or array
  const plan = Array.isArray(semester.semester_payment_plans)
    ? semester.semester_payment_plans[0]
    : semester.semester_payment_plans;

  return {
    id: semester.id,

    details: {
      name: semester.name,
      trackingMode: semester.tracking_mode,
      capacityWarningThreshold: semester.capacity_warning_threshold,
      publishAt: semester.publish_at,
    },

    sessions: {
      classes: (semester.classes ?? []).map((c: any): DraftClass => ({
        id: c.id,
        name: c.name,
        displayName: c.display_name ?? undefined,
        discipline: c.discipline ?? "ballet",
        division: c.division ?? "junior",
        level: c.level ?? undefined,
        description: c.description ?? undefined,
        minAge: c.min_age ?? undefined,
        maxAge: c.max_age ?? undefined,
        minGrade: c.min_grade ?? undefined,
        maxGrade: c.max_grade ?? undefined,
        isCompetitionTrack: c.is_competition_track ?? false,
        requiresTeacherRec: c.requires_teacher_rec ?? false,
        schedules: (c.class_schedules ?? []).map((cs: any): DraftClassSchedule => ({
          _clientKey: cs.id,
          id: cs.id,
          daysOfWeek: cs.days_of_week ?? [],
          startTime: cs.start_time ?? undefined,
          endTime: cs.end_time ?? undefined,
          startDate: cs.start_date ?? undefined,
          endDate: cs.end_date ?? undefined,
          location: cs.location ?? undefined,
          instructorName: cs.instructor_name ?? undefined,
          capacity: cs.capacity ?? undefined,
          registrationOpenAt: cs.registration_open_at ?? null,
          registrationCloseAt: cs.registration_close_at ?? null,
          genderRestriction: cs.gender_restriction ?? null,
          urgencyThreshold: cs.urgency_threshold ?? null,
          pricingModel: cs.pricing_model ?? "full_schedule",
          dropInPrice: cs.drop_in_price ?? null,
          priceTiers: (cs.schedule_price_tiers ?? []).map((t: any) => ({
            _clientKey: t.id,
            id: t.id,
            label: t.label,
            amount: Number(t.amount),
            sortOrder: t.sort_order ?? 0,
            isDefault: t.is_default ?? false,
          })),
        })),
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
      })),
    },

    sessionGroups: {
      groups: (semester.session_groups ?? []).map((g: any) => ({
        id: g.id,
        name: g.name,
        sessionIds: (g.session_group_sessions ?? []).map((sgs: any) => sgs.session_id),
      })),
    },

    paymentPlan: plan
      ? {
          type: plan.type,
          depositAmount: plan.deposit_amount,
          depositPercent: plan.deposit_percent,
          installmentCount: plan.installment_count,
          dueDate: plan.due_date,
          installments: (semester.semester_payment_installments ?? []).map((i: any) => ({
            number: i.installment_number,
            amount: i.amount,
            dueDate: i.due_date,
          })),
        }
      : undefined,

    discounts: {
      appliedDiscounts: (semester.semester_discounts ?? []).map((sd: any) => ({
        discountId: sd.discount_id,
        scope: sd.discount.eligible_sessions_mode,
        sessionIds:
          sd.discount.eligible_sessions_mode === "selected"
            ? (sd.discount.discount_rule_sessions?.map((s: any) => s.session_id) ?? [])
            : [],
      })),
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

    waitlist: semester.waitlist_settings
      ? {
          enabled: semester.waitlist_settings.enabled ?? false,
          sessionSettings: semester.waitlist_settings.sessionSettings ?? {},
          inviteExpiryHours: semester.waitlist_settings.inviteExpiryHours ?? 48,
          stopDaysBeforeClose: semester.waitlist_settings.stopDaysBeforeClose ?? 3,
          invitationEmail: semester.waitlist_settings.invitationEmail ?? {
            subject: "",
            fromName: "",
            fromEmail: "",
            htmlBody: "",
          },
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
          senior_video_fee_per_registrant: Number(
            semester.semester_fee_config.senior_video_fee_per_registrant ?? 15,
          ),
          senior_costume_fee_per_class: Number(
            semester.semester_fee_config.senior_costume_fee_per_class ?? 65,
          ),
        }
      : undefined,
  };
}
