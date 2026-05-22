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
 *   classes(*, class_sections(*, section_price_tiers(*)), class_requirements(*, class_requirement_approved_dancers(dancer_id)))
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
      location: semester.location ?? undefined,
      trackingMode: semester.tracking_mode,
      capacityWarningThreshold: semester.capacity_warning_threshold,
      publishAt: semester.publish_at,
    },

    sessions: {
      classes: (semester.classes ?? []).map((c: any): DraftClass => {
        // Phase 2: auto-set is_drop_in on hydration for legacy data.
        // If the class's division is marked is_drop_in (legacy model), every
        // schedule on this class is treated as drop-in in the in-memory draft
        // so the new per-class toggle reads "on" without a write back to DB.
        const legacyDivisionDropIn = c.division_info?.is_drop_in === true;
        return ({
        id: c.id,
        name: c.name,
        displayName: c.display_name ?? undefined,
        discipline: c.discipline ?? "ballet",
        division: c.division ?? null,
        description: c.description ?? undefined,
        minAge: c.min_age ?? undefined,
        maxAge: c.max_age ?? undefined,
        minGrade: c.min_grade ?? undefined,
        maxGrade: c.max_grade ?? undefined,
        // offeringType is TypeScript-only — derived from is_competition_track, never persisted.
        offeringType: c.is_competition_track ? "competition_track" : "standard",
        isCompetitionTrack: c.is_competition_track ?? false,
        isTiered: c.is_tiered ?? false,
        tiers: (c.class_tiers ?? [])
          .slice()
          .sort((a: { sort_order?: number }, b: { sort_order?: number }) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((t: {
            id: string;
            label: string;
            start_time: string | null;
            end_time: string | null;
            price_cents: number | null;
            sort_order: number | null;
            is_default: boolean | null;
          }) => ({
            _clientKey: t.id,
            id: t.id,
            label: t.label,
            startTime: t.start_time ? String(t.start_time).slice(0, 5) : null,
            endTime: t.end_time ? String(t.end_time).slice(0, 5) : null,
            price: t.price_cents != null ? t.price_cents / 100 : null,
            sortOrder: t.sort_order ?? 0,
            isDefault: t.is_default ?? false,
          })),
        requiresTeacherRec: c.requires_teacher_rec ?? false,
        tuitionOverride: c.tuition_override_amount ? Number(c.tuition_override_amount) : null,
        visibility: c.visibility ?? "public",
        enrollmentType: c.enrollment_type ?? "standard",
        schedules: (c.class_sections ?? []).map((cs: any): DraftClassSchedule => ({
          _clientKey: cs.id,
          id: cs.id,
          daysOfWeek: cs.days_of_week ?? [],
          startTime: cs.start_time ? cs.start_time.slice(0, 5) : undefined,
          endTime: cs.end_time ? cs.end_time.slice(0, 5) : undefined,
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
          // Phase 2: prefer new column, fall back to legacy division flag.
          isDropIn: (cs.is_drop_in as boolean | null) ?? legacyDivisionDropIn,
          dropInPrice: cs.drop_in_price ?? null,
          priceTiers: (cs.section_price_tiers ?? []).map((t: any) => ({
            _clientKey: t.id,
            id: t.id,
            label: t.label,
            amount: Number(t.amount),
            sortOrder: t.sort_order ?? 0,
            isDefault: t.is_default ?? false,
          })),
          perDateOverrides: (cs.pricing_model === "per_session"
            ? (cs.class_sessions ?? [])
            : []
          )
            .filter((s: any) => s.schedule_date)
            .map((s: any) => {
              const sStart = s.start_time ? String(s.start_time).slice(0, 5) : null;
              const sEnd = s.end_time ? String(s.end_time).slice(0, 5) : null;
              const dStart = cs.start_time ? String(cs.start_time).slice(0, 5) : null;
              const dEnd = cs.end_time ? String(cs.end_time).slice(0, 5) : null;
              const capDiffers = (s.capacity ?? null) !== (cs.capacity ?? null);
              const priceDiffers = (s.drop_in_price ?? null) !== (cs.drop_in_price ?? null);
              const startDiffers = sStart !== dStart;
              const endDiffers = sEnd !== dEnd;
              if (!capDiffers && !priceDiffers && !startDiffers && !endDiffers) return null;
              return {
                date: s.schedule_date,
                capacity: capDiffers ? (s.capacity ?? null) : null,
                startTime: startDiffers ? sStart : null,
                endTime: endDiffers ? sEnd : null,
                dropInPrice: priceDiffers ? (s.drop_in_price ?? null) : null,
              };
            })
            .filter(Boolean) as import("@/types").DraftPerDateOverride[],
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
          approvedDancerIds: (r.class_requirement_approved_dancers ?? []).map(
            (d: { dancer_id: string }) => d.dancer_id,
          ),
        })),
        // Competition track transactional email configs (null for standard classes)
        inviteEmail: c.invite_email ?? undefined,
        auditionBookingEmail: c.audition_booking_email ?? undefined,
        competitionAcceptanceEmail: c.competition_acceptance_email ?? undefined,
      });
      }),
    },

    sessionGroups: {
      groups: (semester.session_groups ?? []).map((g: any) => ({
        id: g.id,
        name: g.name,
        // De-duplicate by section_id so each schedule appears once in the group UI.
        sessionIds: [
          ...new Set(
            (g.session_group_sessions ?? [])
              .map((sgs: any) => sgs.class_sessions?.section_id)
              .filter(Boolean),
          ),
        ],
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
      progressive_discount_percent: Number(b.progressive_discount_percent ?? 0),
      semester_total: b.semester_total != null ? Number(b.semester_total) : undefined,
      autopay_installment_amount: b.autopay_installment_amount != null ? Number(b.autopay_installment_amount) : undefined,
      notes: b.notes ?? undefined,
    })),

    coupons: (semester.semester_coupons ?? []).map((sc: any) => {
      const c = sc.coupon;
      return {
        _clientKey: c.id,
        id: c.id,
        name: c.name,
        code: c.code ?? null,
        value: Number(c.value),
        valueType: c.value_type,
        validFrom: c.valid_from ?? null,
        validUntil: c.valid_until ?? null,
        maxTotalUses: c.max_total_uses ?? null,
        usesCount: c.uses_count ?? 0,
        maxPerFamily: c.max_per_family ?? 1,
        stackable: c.stackable ?? false,
        eligibleSessionsMode: c.eligible_sessions_mode ?? "all",
        isActive: c.is_active ?? true,
      };
    }),

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
          junior_costume_fee_per_class: Number(
            semester.semester_fee_config.junior_costume_fee_per_class ?? 55,
          ),
          costume_fee_exempt_keys:
            semester.semester_fee_config.costume_fee_exempt_keys ??
            ["technique", "pointe", "competition"],
        }
      : undefined,
  };
}
