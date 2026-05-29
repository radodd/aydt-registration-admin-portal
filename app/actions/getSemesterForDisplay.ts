"use server";

import { createClient } from "@/utils/supabase/server";
import type {
  DataMode,
  PublicSemester,
  PublicSession,
  PublicSessionGroup,
  PublicPaymentPlan,
  PublicFeeConfig,
  PublicAvailableDay,
} from "@/types/public";
import type { HydratedDiscount, RegistrationFormElement } from "@/types";

/* -------------------------------------------------------------------------- */
/* Main action                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Fetches and normalizes a semester for public display.
 *
 * Phase 1 change: data is now sourced from `classes` + `class_meetings` +
 * `meeting_occurrence_dates` instead of `sessions` + `session_available_days`.
 * Each class_session becomes one PublicSession entry.
 *
 * - mode "live"    → only published semesters are returned
 * - mode "preview" → any status (caller must verify admin role before calling)
 */
export async function getSemesterForDisplay(
  semesterId: string,
  mode: DataMode,
): Promise<PublicSemester> {
  const supabase = await createClient();

  /* ---------------------------------------------------------------------- */
  /* 1. Semester + classes (with class_meetings) + groups + payment + discounts */
  /* ---------------------------------------------------------------------- */

  const { data: semester, error: semesterError } = await supabase
    .from("semesters")
    .select(
      `
      id,
      name,
      status,
      description,
      location,
      capacity_warning_threshold,
      publish_at,
      registration_form,
      waitlist_settings,
      classes (
        id,
        name,
        discipline,
        division,
        description,
        registration_note,
        min_age,
        max_age,
        min_grade,
        max_grade,
        is_active,
        is_competition_track,
        is_tiered,
        waitlist_enabled,
        visibility,
        enrollment_type,
        class_requirements!class_requirements_class_id_fkey ( id, requirement_type, description, enforcement ),
        class_tiers ( id, label, start_time, end_time, price_cents, sort_order, is_default ),
        class_meetings (
          id,
          section_id,
          start_time,
          end_time,
          schedule_date,
          instructor_name,
          location,
          capacity,
          drop_in_price,
          registration_close_at,
          is_active,
          class_sections (
            pricing_model,
            is_drop_in,
            capacity,
            days_of_week,
            section_price_tiers ( id, label, amount, sort_order, is_default )
          ),
          meeting_occurrence_dates (
            id,
            date,
            is_cancelled
          )
        )
      ),
      meeting_groups (
        id,
        name,
        meeting_group_meetings ( meeting_id )
      ),
      semester_payment_plans (*),
      semester_fee_config (
        registration_fee_per_child,
        family_discount_amount,
        junior_costume_fee_per_class,
        senior_video_fee_per_registrant,
        senior_costume_fee_per_class
      ),
      semester_discounts (
        discount_id,
        discount:discounts (
          *,
          discount_rules (*),
          discount_rule_meetings (*)
        )
      )
    `,
    )
    .eq("id", semesterId)
    .maybeSingle();

  if (semesterError || !semester) {
    console.error("[getSemesterForDisplay] query failed", { semesterId, semesterError, semester });
    throw new Error(`Semester not found: ${semesterId}`);
  }

  // Allow published semesters always.
  // Also allow scheduled semesters when a registration_open_at is set — they
  // will render the pre-registration landing page instead of the class catalog.
  const isVisible =
    semester.status === "published" ||
    (semester.status === "scheduled" &&
      !!(semester as { publish_at?: string | null }).publish_at);

  if (mode === "live" && !isVisible) {
    throw new Error("Semester is not published");
  }

  /* ---------------------------------------------------------------------- */
  /* 2. Registration counts per class_session                                */
  /* ---------------------------------------------------------------------- */

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const semesterClasses = ((semester.classes ?? []) as any as ClassRow[])
    // Exclude competition/invite-only and explicitly hidden classes from the
    // public catalog. These are only accessible via token or admin invite.
    .filter(
      (c: ClassRow) => c.visibility === "public" || c.visibility === undefined,
    )
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const classSessionIds: string[] = semesterClasses.flatMap((c: ClassRow) =>
    (c.class_meetings ?? [])
      .filter((cs: ClassSessionRow) => cs.is_active)
      .map((cs: ClassSessionRow) => cs.id),
  );

  // Count confirmed registrations + pending registrations whose hold has not expired.
  // This prevents users from seeing available spots that are actually held by others.
  const now = new Date().toISOString();
  const { data: registrationRows } = await supabase
    .from("meeting_enrollments")
    .select("meeting_id")
    .in("meeting_id", classSessionIds)
    .or(
      `status.eq.confirmed,and(status.eq.pending,or(hold_expires_at.is.null,hold_expires_at.gt.${now}))`,
    );

  const enrolledBySession: Record<string, number> = {};
  for (const row of registrationRows ?? []) {
    const sid = row.meeting_id as string;
    enrolledBySession[sid] = (enrolledBySession[sid] ?? 0) + 1;
  }

  /* ---------------------------------------------------------------------- */
  /* 2b. Schedule enrollment counts for full_schedule sessions (Mode A)      */
  /* ---------------------------------------------------------------------- */

  const scheduleIds: string[] = [
    ...new Set(
      semesterClasses.flatMap((c: ClassRow) =>
        (c.class_meetings ?? [])
          .filter((cs: ClassSessionRow) => cs.is_active && cs.section_id)
          .map((cs: ClassSessionRow) => cs.section_id as string),
      ),
    ),
  ];

  const { data: scheduleEnrollmentRows } = scheduleIds.length
    ? await supabase
        .from("section_enrollments")
        .select("section_id")
        .in("section_id", scheduleIds)
        .neq("status", "cancelled")
    : { data: [] };

  const enrolledBySchedule: Record<string, number> = {};
  for (const row of scheduleEnrollmentRows ?? []) {
    const schId = row.section_id as string;
    enrolledBySchedule[schId] = (enrolledBySchedule[schId] ?? 0) + 1;
  }

  /* ---------------------------------------------------------------------- */
  /* 4. Normalize class_meetings → PublicSession[]                           */
  /*    Each active class_session = one enrollable public session.            */
  /* ---------------------------------------------------------------------- */

  const publicSessions: PublicSession[] = semesterClasses.flatMap(
    (c: ClassRow) =>
      (c.class_meetings ?? [])
        .filter((cs: ClassSessionRow) => cs.is_active)
        .map((cs: ClassSessionRow) => {
          const pricingModel = (cs.class_sections?.pricing_model ??
            "full_schedule") as "full_schedule" | "per_session";

          // Capacity and enrollment semantics differ by pricing model:
          //   full_schedule → capacity from class_sections, enrolled from section_enrollments
          //   per_session   → capacity from class_meetings, enrolled from registrations
          const capacity =
            pricingModel === "full_schedule"
              ? (cs.class_sections?.capacity ?? 0)
              : (cs.capacity ?? 0);
          const enrolled =
            pricingModel === "full_schedule"
              ? (enrolledBySchedule[cs.section_id ?? ""] ?? 0)
              : (enrolledBySession[cs.id] ?? 0);

          // Meeting-plan #5: the waitlist toggle now lives per-CLASS on
          // classes.waitlist_enabled (manual model). The legacy semester-level
          // waitlist_settings JSONB is no longer consulted for the public flag.
          const sessionWaitlistEnabled = c.waitlist_enabled ?? false;

          const priceTiers = (cs.class_sections?.section_price_tiers ?? [])
            .slice()
            .sort(
              (a: PriceTierRow, b: PriceTierRow) => a.sort_order - b.sort_order,
            )
            .map((t: PriceTierRow) => ({
              id: t.id,
              label: t.label,
              amount: Number(t.amount),
              isDefault: t.is_default,
            }));

          // Phase 2 tiers (per-class) — distinct from section_price_tiers above.
          const classTiers = ((c.class_tiers ?? []) as ClassTierRow[])
            .slice()
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .map((t) => ({
              id: t.id,
              label: t.label,
              startTime: t.start_time ? String(t.start_time).slice(0, 5) : null,
              endTime: t.end_time ? String(t.end_time).slice(0, 5) : null,
              price: t.price_cents != null ? Number(t.price_cents) / 100 : null,
              isDefault: t.is_default ?? false,
              sortOrder: t.sort_order ?? 0,
            }));

          return {
            id: cs.id,
            name: c.name,
            description: c.description,
            category: null,
            location: cs.location,
            capacity,
            enrolledCount: enrolled,
            spotsRemaining: Math.max(0, capacity - enrolled),
            minAge: c.min_age,
            maxAge: c.max_age,
            minGrade: c.min_grade,
            maxGrade: c.max_grade,
            scheduleDate: cs.schedule_date,
            daysOfWeek: cs.class_sections?.days_of_week ?? null,
            instructorName: cs.instructor_name,
            startTime: cs.start_time,
            endTime: cs.end_time,
            registrationCloseAt: cs.registration_close_at,
            waitlistEnabled: sessionWaitlistEnabled,
            discipline: c.discipline,
            division: c.division,
            classId: c.id,
            scheduleId: cs.section_id ?? null,
            pricingModel,
            priceTiers,
            dropInPrice: cs.drop_in_price ?? null,
            isTiered: c.is_tiered ?? false,
            classTiers,
            isDropIn: cs.class_sections?.is_drop_in === true,
            isCompetitionTrack: c.is_competition_track ?? false,
            prerequisites: ((c.class_requirements ?? []) as ClassRequirementRow[]).map((r) => ({
              id: r.id,
              requirementType: r.requirement_type,
              description: r.description,
              enforcement: r.enforcement as "soft_warn" | "hard_block",
            })),
            registrationNote: c.registration_note ?? null,
          } satisfies PublicSession;
        }),
  );

  /* ---------------------------------------------------------------------- */
  /* 5. Normalize session groups                                             */
  /* ---------------------------------------------------------------------- */

  const publicGroups: PublicSessionGroup[] = (
    semester.meeting_groups ?? []
  ).map((g: GroupRow) => ({
    id: g.id,
    name: g.name,
    sessionIds: (g.meeting_group_meetings ?? []).map(
      (sgs: { meeting_id: string }) => sgs.meeting_id,
    ),
  }));

  /* ---------------------------------------------------------------------- */
  /* 6. Normalize payment plan                                               */
  /* ---------------------------------------------------------------------- */

  const plan = Array.isArray(semester.semester_payment_plans)
    ? null
    : (semester.semester_payment_plans as PaymentPlanRow | null);
  const publicPaymentPlan: PublicPaymentPlan | null = plan
    ? {
        type: plan.type,
        depositAmount: plan.deposit_amount,
        depositPercent: plan.deposit_percent,
        installmentCount: plan.installment_count,
        dueDate: plan.due_date,
      }
    : null;

  const rawFeeConfig = Array.isArray(semester.semester_fee_config)
    ? (semester.semester_fee_config[0] as FeeConfigRow | undefined)
    : (semester.semester_fee_config as FeeConfigRow | null);
  const publicFeeConfig: PublicFeeConfig | null = rawFeeConfig
    ? {
        registrationFeePerChild: Number(rawFeeConfig.registration_fee_per_child ?? 40),
        familyDiscountAmount: Number(rawFeeConfig.family_discount_amount ?? 50),
        juniorCostumeFeePerClass: Number(rawFeeConfig.junior_costume_fee_per_class ?? 55),
        seniorCostumeFeePerClass: Number(rawFeeConfig.senior_costume_fee_per_class ?? 65),
        seniorVideoFeePerRegistrant: Number(rawFeeConfig.senior_video_fee_per_registrant ?? 15),
      }
    : null;

  /* ---------------------------------------------------------------------- */
  /* 7. Normalize discounts                                                  */
  /* ---------------------------------------------------------------------- */

  const publicDiscounts: HydratedDiscount[] = (
    semester.semester_discounts ?? []
  )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((sd: any) => sd.discount as HydratedDiscount | null)
    .filter((d: HydratedDiscount | null): d is HydratedDiscount => d !== null);

  /* ---------------------------------------------------------------------- */
  /* 8. Semester start / end dates derived from class_meetings               */
  /* ---------------------------------------------------------------------- */

  const allDates = publicSessions
    .map((s) => s.scheduleDate)
    .filter((d): d is string => Boolean(d));

  const startDate =
    allDates.length > 0 ? allDates.reduce((a, b) => (a < b ? a : b)) : null;

  const endDate =
    allDates.length > 0 ? allDates.reduce((a, b) => (a > b ? a : b)) : null;

  /* ---------------------------------------------------------------------- */
  /* 9. Assemble                                                             */
  /* ---------------------------------------------------------------------- */

  const rawRegForm = semester.registration_form as
    | { elements: RegistrationFormElement[] }
    | null
    | undefined;
  const registrationFormElements = rawRegForm?.elements ?? [];
  console.log(
    `[getSemesterForDisplay] semesterId=${semesterId} registration_form raw=`,
    JSON.stringify(rawRegForm),
    `| element count=${registrationFormElements.length}`,
  );

  return {
    id: semester.id,
    name: semester.name,
    status: semester.status,
    description: semester.description ?? null,
    location: (semester.location as string | null) ?? null,
    capacityWarningThreshold: (semester.capacity_warning_threshold as number | null) ?? null,
    startDate,
    endDate,
    // For scheduled semesters, publish_at is the registration open time.
    // Once published the gate is gone — return null so the catalog shows immediately.
    registrationOpenAt:
      semester.status === "scheduled"
        ? ((semester.publish_at as string | null) ?? null)
        : null,
    paymentPlan: publicPaymentPlan,
    feeConfig: publicFeeConfig,
    registrationForm: registrationFormElements,
    sessions: publicSessions,
    sessionGroups: publicGroups,
    discounts: publicDiscounts,
    // Meeting-plan #5: semester-level flag now means "any class has the manual
    // waitlist toggled on" (per-class source of truth: classes.waitlist_enabled).
    waitlistEnabled: semesterClasses.some((c) => c.waitlist_enabled ?? false),
  };
}

/* -------------------------------------------------------------------------- */
/* Utility                                                                     */
/* -------------------------------------------------------------------------- */

function dayOfWeekFromDate(dateStr: string): string {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const d = new Date(dateStr + "T00:00:00");
  return days[d.getDay()] ?? dateStr;
}

/* -------------------------------------------------------------------------- */
/* Local DB row types                                                          */
/* -------------------------------------------------------------------------- */

interface OccurrenceDateRow {
  id: string;
  date: string;
  is_cancelled: boolean;
}

interface PriceTierRow {
  id: string;
  label: string;
  amount: number;
  sort_order: number;
  is_default: boolean;
}

interface ClassScheduleRow {
  pricing_model: string;
  /** Phase 2: per-schedule drop-in flag. */
  is_drop_in?: boolean | null;
  capacity: number | null;
  days_of_week: string[] | null;
  section_price_tiers: PriceTierRow[];
}

/** Phase 2: per-class tier (class_tiers). */
interface ClassTierRow {
  id: string;
  label: string;
  start_time: string | null;
  end_time: string | null;
  price_cents: number | null;
  sort_order: number | null;
  is_default: boolean | null;
}

interface ClassSessionRow {
  id: string;
  section_id: string | null;
  schedule_date: string;
  instructor_name: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  capacity: number | null;
  drop_in_price: number | null;
  registration_close_at: string | null;
  is_active: boolean;
  class_sections: ClassScheduleRow | null;
}

interface ClassRequirementRow {
  id: string;
  requirement_type: string;
  description: string;
  enforcement: string;
}

interface ClassRow {
  id: string;
  name: string;
  discipline: string;
  division: string;
  description: string | null;
  registration_note?: string | null;
  min_age: number | null;
  max_age: number | null;
  min_grade: number | null;
  max_grade: number | null;
  is_active: boolean;
  is_competition_track: boolean;
  /** Phase 2: per-class tiered flag. */
  is_tiered?: boolean | null;
  /** Meeting-plan #5: per-class manual-waitlist toggle. */
  waitlist_enabled?: boolean | null;
  visibility?: string;
  enrollment_type?: string;
  class_requirements?: ClassRequirementRow[];
  /** Phase 2: per-class tiers. */
  class_tiers?: ClassTierRow[];
  class_meetings: ClassSessionRow[];
}

interface GroupRow {
  id: string;
  name: string;
  meeting_group_meetings: { meeting_id: string }[];
}

interface PaymentPlanRow {
  type: "pay_in_full" | "deposit_flat" | "deposit_percent" | "installments";
  deposit_amount: number | null;
  deposit_percent: number | null;
  installment_count: number | null;
  due_date: string | null;
}

interface FeeConfigRow {
  registration_fee_per_child: number | null;
  family_discount_amount: number | null;
  junior_costume_fee_per_class: number | null;
  senior_video_fee_per_registrant: number | null;
  senior_costume_fee_per_class: number | null;
}
