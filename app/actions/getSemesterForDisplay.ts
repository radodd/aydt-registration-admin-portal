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
        is_active,
        is_competition_track,
        class_sessions (
          id,
          day_of_week,
          start_time,
          end_time,
          start_date,
          end_date,
          location,
          capacity,
          registration_close_at,
          is_active,
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

  const classSessionIds: string[] = (semester.classes ?? []).flatMap(
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

  const publicSessions: PublicSession[] = (semester.classes ?? []).flatMap(
    (c: ClassRow) =>
      (c.class_sessions ?? [])
        .filter((cs: ClassSessionRow) => cs.is_active)
        .map((cs: ClassSessionRow) => {
          const enrolled = enrolledBySession[cs.id] ?? 0;
          const capacity = cs.capacity ?? 0;

          const availableDays: PublicAvailableDay[] = (
            cs.session_occurrence_dates ?? []
          )
            .filter((od: OccurrenceDateRow) => !od.is_cancelled)
            .map((od: OccurrenceDateRow) => ({
              id: od.id,
              date: od.date,
              dayOfWeek: dayOfWeekFromDate(od.date),
              startTime: cs.start_time ?? "",
              endTime: cs.end_time ?? "",
            }));

          const sessionWaitlistEnabled =
            (waitlistSettings.enabled ?? false) &&
            (waitlistSettings.sessionSettings?.[cs.id]?.enabled ?? false);

          return {
            id: cs.id,
            name: c.name,
            description: c.description,
            category: null,
            location: cs.location,
            capacity,
            enrolledCount: enrolled,
            spotsRemaining: Math.max(0, capacity - enrolled),
            pricePerDay: null,
            priceFull: null,
            minAge: c.min_age,
            maxAge: c.max_age,
            startDate: cs.start_date,
            endDate: cs.end_date,
            daysOfWeek: [cs.day_of_week],
            startTime: cs.start_time,
            endTime: cs.end_time,
            registrationCloseAt: cs.registration_close_at,
            availableDays,
            waitlistEnabled: sessionWaitlistEnabled,
            discipline: c.discipline,
            division: c.division,
            classId: c.id,
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
    .flatMap((s) => [s.startDate, s.endDate])
    .filter(Boolean) as string[];

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

interface ClassSessionRow {
  id: string;
  day_of_week: string;
  start_time: string | null;
  end_time: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  capacity: number | null;
  registration_close_at: string | null;
  is_active: boolean;
  session_occurrence_dates: OccurrenceDateRow[];
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
  is_active: boolean;
  is_competition_track: boolean;
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
