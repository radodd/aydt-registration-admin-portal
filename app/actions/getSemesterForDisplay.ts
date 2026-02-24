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
 * - mode "live"    → only published semesters are returned
 * - mode "preview" → any status (caller must verify admin role before calling)
 */
export async function getSemesterForDisplay(
  semesterId: string,
  mode: DataMode,
): Promise<PublicSemester> {
  const supabase = await createClient();

  /* ---------------------------------------------------------------------- */
  /* 1. Semester + sessions + groups + payment + discounts                   */
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
      sessions (
        id,
        title,
        description,
        category,
        location,
        capacity,
        price,
        registration_fee,
        min_age,
        max_age,
        start_date,
        end_date,
        days_of_week,
        registration_close_at,
        session_available_days (
          id,
          date,
          start_time,
          end_time,
          capacity
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
  /* 2. Registration counts per session                                       */
  /* ---------------------------------------------------------------------- */

  const sessionIds: string[] = (semester.sessions ?? []).map(
    (s: { id: string }) => s.id,
  );

  const { data: registrationRows } = await supabase
    .from("registrations")
    .select("session_id")
    .in("session_id", sessionIds)
    .eq("status", "confirmed");

  // Count confirmed registrations per session
  const enrolledBySession: Record<string, number> = {};
  for (const row of registrationRows ?? []) {
    const sid = row.session_id as string;
    enrolledBySession[sid] = (enrolledBySession[sid] ?? 0) + 1;
  }

  /* ---------------------------------------------------------------------- */
  /* 3. Waitlist settings                                                     */
  /* ---------------------------------------------------------------------- */

  const waitlistSettings: {
    enabled?: boolean;
    sessionSettings?: Record<string, { enabled: boolean }>;
  } = (semester.waitlist_settings as Record<string, unknown>) ?? {};

  /* ---------------------------------------------------------------------- */
  /* 4. Normalize sessions                                                    */
  /* ---------------------------------------------------------------------- */

  const publicSessions: PublicSession[] = (semester.sessions ?? []).map(
    (s: SessionRow) => {
      const enrolled = enrolledBySession[s.id] ?? 0;
      const capacity = s.capacity ?? 0;

      const availableDays: PublicAvailableDay[] = (
        s.session_available_days ?? []
      ).map((d: AvailableDayRow) => ({
        id: d.id,
        date: d.date,
        dayOfWeek: dayOfWeekFromDate(d.date),
        startTime: d.start_time ?? "",
        endTime: d.end_time ?? "",
      }));

      const sessionWaitlistEnabled =
        (waitlistSettings.enabled ?? false) &&
        (waitlistSettings.sessionSettings?.[s.id]?.enabled ?? false);

      return {
        id: s.id,
        name: s.title,
        description: s.description,
        category: s.category,
        location: s.location,
        capacity,
        enrolledCount: enrolled,
        spotsRemaining: Math.max(0, capacity - enrolled),
        pricePerDay: s.price,
        priceFull: s.registration_fee,
        minAge: s.min_age,
        maxAge: s.max_age,
        startDate: s.start_date,
        endDate: s.end_date,
        daysOfWeek: s.days_of_week ?? [],
        registrationCloseAt: s.registration_close_at,
        availableDays,
        waitlistEnabled: sessionWaitlistEnabled,
      };
    },
  );

  /* ---------------------------------------------------------------------- */
  /* 5. Normalize session groups                                              */
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
  /* 6. Normalize payment plan                                                */
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
  /* 7. Normalize discounts                                                   */
  /* ---------------------------------------------------------------------- */

  const publicDiscounts: HydratedDiscount[] = (
    semester.semester_discounts ?? []
  )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((sd: any) => sd.discount as HydratedDiscount | null)
    .filter((d: HydratedDiscount | null): d is HydratedDiscount => d !== null);

  /* ---------------------------------------------------------------------- */
  /* 8. Start / end dates derived from sessions                              */
  /* ---------------------------------------------------------------------- */

  const allDates = publicSessions
    .flatMap((s) => [s.startDate, s.endDate])
    .filter(Boolean) as string[];

  const startDate =
    allDates.length > 0 ? allDates.reduce((a, b) => (a < b ? a : b)) : null;
  const endDate =
    allDates.length > 0 ? allDates.reduce((a, b) => (a > b ? a : b)) : null;

  /* ---------------------------------------------------------------------- */
  /* 9. Assemble                                                              */
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
  const d = new Date(dateStr + "T00:00:00"); // avoid timezone offset
  return days[d.getDay()] ?? dateStr;
}

/* -------------------------------------------------------------------------- */
/* Local DB row types (avoid importing full Supabase generated types)         */
/* -------------------------------------------------------------------------- */

interface SessionRow {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  location: string | null;
  capacity: number | null;
  price: number | null;
  registration_fee: number | null;
  min_age: number | null;
  max_age: number | null;
  start_date: string | null;
  end_date: string | null;
  days_of_week: string[] | null;
  registration_close_at: string | null;
  session_available_days: AvailableDayRow[];
}

interface AvailableDayRow {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  capacity: number | null;
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
