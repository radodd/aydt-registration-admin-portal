"use server";

import { createClient } from "@/utils/supabase/server";
import type {
  DataMode,
  PublicSemester,
  PublicSession,
  PublicSessionGroup,
  PublicPaymentPlan,
  PublicAvailableDay,
} from "@/types/public";
import type { HydratedDiscount, RegistrationFormElement } from "@/types";

/* -------------------------------------------------------------------------- */
/* Main action                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Fetches and normalizes a semester for public display.
 *
 * Phase 1 change: data is now sourced from `classes` + `class_sessions` +
 * `session_occurrence_dates` instead of `sessions` + `session_available_days`.
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
  /* 1. Semester + classes (with class_sessions) + groups + payment + discounts */
  /* ---------------------------------------------------------------------- */

  const { data: semester, error: semesterError } = await supabase
    .from("semesters")
    .select(
      `
      id,
      name,
      status,
      description,
      registration_form,
      waitlist_settings,
      classes (
        id,
        name,
        discipline,
        division,
        level,
        description,
        min_age,
        max_age,
        min_grade,
        max_grade,
        is_active,
        is_competition_track,
        visibility,
        enrollment_type,
        class_sessions (
          id,
          schedule_id,
          start_time,
          end_time,
          schedule_date,
          instructor_name,
          location,
          capacity,
          drop_in_price,
          registration_close_at,
          is_active,
          class_schedules (
            pricing_model,
            capacity,
            schedule_price_tiers ( id, label, amount, sort_order, is_default )
          ),
          session_occurrence_dates (
            id,
            date,
            is_cancelled
          )
        )
      ),
      session_groups (
        id,
        name,
        session_group_sessions ( session_id )
      ),
      semester_payment_plans (*),
      semester_discounts (
        discount_id,
        discount:discounts (
          *,
          discount_rules (*),
          discount_rule_sessions (*)
        )
      )
    `,
    )
    .eq("id", semesterId)
    .single();

  if (semesterError || !semester) {
    throw new Error(
      `Semester not found: ${semesterError?.message ?? "unknown"}`,
    );
  }

  if (mode === "live" && semester.status !== "published") {
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
      (c: ClassRow) =>
        c.visibility === "public" || c.visibility === undefined,
    )
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const classSessionIds: string[] = semesterClasses.flatMap(
    (c: ClassRow) =>
      (c.class_sessions ?? [])
        .filter((cs: ClassSessionRow) => cs.is_active)
        .map((cs: ClassSessionRow) => cs.id),
  );

  // Count confirmed registrations + pending registrations whose hold has not expired.
  // This prevents users from seeing available spots that are actually held by others.
  const now = new Date().toISOString();
  const { data: registrationRows } = await supabase
    .from("registrations")
    .select("session_id")
    .in("session_id", classSessionIds)
    .or(
      `status.eq.confirmed,and(status.eq.pending,or(hold_expires_at.is.null,hold_expires_at.gt.${now}))`,
    );

  const enrolledBySession: Record<string, number> = {};
  for (const row of registrationRows ?? []) {
    const sid = row.session_id as string;
    enrolledBySession[sid] = (enrolledBySession[sid] ?? 0) + 1;
  }

  /* ---------------------------------------------------------------------- */
  /* 2b. Schedule enrollment counts for full_schedule sessions (Mode A)      */
  /* ---------------------------------------------------------------------- */

  const scheduleIds: string[] = [
    ...new Set(
      semesterClasses.flatMap((c: ClassRow) =>
        (c.class_sessions ?? [])
          .filter((cs: ClassSessionRow) => cs.is_active && cs.schedule_id)
          .map((cs: ClassSessionRow) => cs.schedule_id as string),
      ),
    ),
  ];

  const { data: scheduleEnrollmentRows } = scheduleIds.length
    ? await supabase
        .from("schedule_enrollments")
        .select("schedule_id")
        .in("schedule_id", scheduleIds)
        .neq("status", "cancelled")
    : { data: [] };

  const enrolledBySchedule: Record<string, number> = {};
  for (const row of scheduleEnrollmentRows ?? []) {
    const schId = row.schedule_id as string;
    enrolledBySchedule[schId] = (enrolledBySchedule[schId] ?? 0) + 1;
  }

  /* ---------------------------------------------------------------------- */
  /* 3. Waitlist settings                                                    */
  /* ---------------------------------------------------------------------- */

  const waitlistSettings: {
    enabled?: boolean;
    sessionSettings?: Record<string, { enabled: boolean }>;
  } = (semester.waitlist_settings as Record<string, unknown>) ?? {};

  /* ---------------------------------------------------------------------- */
  /* 4. Normalize class_sessions → PublicSession[]                           */
  /*    Each active class_session = one enrollable public session.            */
  /* ---------------------------------------------------------------------- */

  const publicSessions: PublicSession[] = semesterClasses.flatMap(
    (c: ClassRow) =>
      (c.class_sessions ?? [])
        .filter((cs: ClassSessionRow) => cs.is_active)
        .map((cs: ClassSessionRow) => {
          const pricingModel = (cs.class_schedules?.pricing_model ?? "full_schedule") as
            | "full_schedule"
            | "per_session";

          // Capacity and enrollment semantics differ by pricing model:
          //   full_schedule → capacity from class_schedules, enrolled from schedule_enrollments
          //   per_session   → capacity from class_sessions, enrolled from registrations
          const capacity =
            pricingModel === "full_schedule"
              ? (cs.class_schedules?.capacity ?? 0)
              : (cs.capacity ?? 0);
          const enrolled =
            pricingModel === "full_schedule"
              ? (enrolledBySchedule[cs.schedule_id ?? ""] ?? 0)
              : (enrolledBySession[cs.id] ?? 0);

          const sessionWaitlistEnabled =
            (waitlistSettings.enabled ?? false) &&
            (waitlistSettings.sessionSettings?.[cs.id]?.enabled ?? false);

          const priceTiers = (cs.class_schedules?.schedule_price_tiers ?? [])
            .slice()
            .sort((a: PriceTierRow, b: PriceTierRow) => a.sort_order - b.sort_order)
            .map((t: PriceTierRow) => ({
              id: t.id,
              label: t.label,
              amount: Number(t.amount),
              isDefault: t.is_default,
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
            instructorName: cs.instructor_name,
            startTime: cs.start_time,
            endTime: cs.end_time,
            registrationCloseAt: cs.registration_close_at,
            waitlistEnabled: sessionWaitlistEnabled,
            discipline: c.discipline,
            division: c.division,
            classId: c.id,
            scheduleId: cs.schedule_id ?? null,
            pricingModel,
            priceTiers,
            dropInPrice: cs.drop_in_price ?? null,
            isCompetitionTrack: c.is_competition_track ?? false,
          } satisfies PublicSession;
        }),
  );

  /* ---------------------------------------------------------------------- */
  /* 5. Normalize session groups                                             */
  /* ---------------------------------------------------------------------- */

  const publicGroups: PublicSessionGroup[] = (
    semester.session_groups ?? []
  ).map((g: GroupRow) => ({
    id: g.id,
    name: g.name,
    sessionIds: (g.session_group_sessions ?? []).map(
      (sgs: { session_id: string }) => sgs.session_id,
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
  /* 8. Semester start / end dates derived from class_sessions               */
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

  return {
    id: semester.id,
    name: semester.name,
    status: semester.status,
    description: semester.description ?? null,
    startDate,
    endDate,
    paymentPlan: publicPaymentPlan,
    registrationForm:
      (semester.registration_form as { elements: RegistrationFormElement[] })
        ?.elements ?? [],
    sessions: publicSessions,
    sessionGroups: publicGroups,
    discounts: publicDiscounts,
    waitlistEnabled: waitlistSettings.enabled ?? false,
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
  capacity: number | null;
  schedule_price_tiers: PriceTierRow[];
}

interface ClassSessionRow {
  id: string;
  schedule_id: string | null;
  schedule_date: string;
  instructor_name: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  capacity: number | null;
  drop_in_price: number | null;
  registration_close_at: string | null;
  is_active: boolean;
  class_schedules: ClassScheduleRow | null;
}

interface ClassRow {
  id: string;
  name: string;
  discipline: string;
  division: string;
  level: string | null;
  description: string | null;
  min_age: number | null;
  max_age: number | null;
  min_grade: number | null;
  max_grade: number | null;
  is_active: boolean;
  is_competition_track: boolean;
  visibility?: string;
  enrollment_type?: string;
  class_sessions: ClassSessionRow[];
}

interface GroupRow {
  id: string;
  name: string;
  session_group_sessions: { session_id: string }[];
}

interface PaymentPlanRow {
  type: "pay_in_full" | "deposit_flat" | "deposit_percent" | "installments";
  deposit_amount: number | null;
  deposit_percent: number | null;
  installment_count: number | null;
  due_date: string | null;
}
