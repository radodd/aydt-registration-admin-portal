"use server";

import { createClient } from "@/utils/supabase/server";
import type { ReportRow, ReportSemester } from "@/types";

function computeAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const today = new Date();
  const dob = new Date(birthDate);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

function formatDayOfWeek(day: string | null): string {
  if (!day) return "";
  return day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
}

/** class_sections.days_of_week is a text[] (e.g. ['monday','wednesday']). */
function formatDays(days: string[] | null | undefined): string {
  if (!days?.length) return "";
  return days.map(formatDayOfWeek).join(", ");
}

// Shared dancer → family → users sub-select used by both enrollment reads.
const DANCER_SELECT = `
  id, first_name, last_name, birth_date, grade, secondary_email, family_id,
  families!family_id(
    id, family_name,
    users!family_id(id, first_name, last_name, email, phone_number, is_primary_parent)
  )
`;

type RowMeta = {
  dayOfWeek: string;
  location: string | null;
  instructor: string | null;
  className: string;
  semesterName: string;
};

/**
 * Map a single enrollment (from either `meeting_enrollments` or
 * `section_enrollments`) plus its joined dancer / order / class metadata into the
 * flat ReportRow shape the builder renders.
 */
function buildReportRow(
  id: string,
  createdAt: string,
  status: string,
  dancer: any,
  order: any,
  meta: RowMeta,
): ReportRow {
  const family = dancer?.families;
  const users: any[] = family?.users ?? [];
  const primaryParent =
    users.find((u: any) => u.is_primary_parent) ?? users[0] ?? null;

  const installments: any[] = order?.order_payment_installments ?? [];
  const paidAmount = installments
    .filter((i: any) => i.status === "paid")
    .reduce((sum: number, i: any) => sum + (i.paid_amount ?? 0), 0);
  const grandTotal = order?.grand_total ?? 0;
  const balance = Math.max(0, grandTotal - paidAmount);

  return {
    id,
    dancerName: dancer
      ? `${dancer.first_name} ${dancer.last_name}`.trim()
      : "—",
    parentName: primaryParent
      ? `${primaryParent.first_name} ${primaryParent.last_name}`.trim()
      : "—",
    seasonName: meta.semesterName,
    sessionName: meta.className
      ? `${meta.className}${meta.dayOfWeek ? " — " + meta.dayOfWeek : ""}`
      : "—",
    age: computeAge(dancer?.birth_date ?? null),
    grade: dancer?.grade ?? null,
    dateRegistered: createdAt,
    daysOfWeek: meta.dayOfWeek,
    location: meta.location,
    instructor: meta.instructor,
    familyId: family?.id ?? "",
    parentEmail: primaryParent?.email ?? "",
    secondaryEmail: dancer?.secondary_email ?? null,
    parentPhone: primaryParent?.phone_number ?? null,
    tuitionAmount: order?.tuition_total ?? 0,
    discountTotal: order?.family_discount_amount ?? 0,
    paymentPlanType: order?.payment_plan_type ?? "—",
    registrationStatus: status,
    balance,
    dancerId: dancer?.id ?? "",
  } satisfies ReportRow;
}

export async function getSemesters(): Promise<ReportSemester[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("semesters")
    .select("id, name, status, created_at")
    .not("status", "eq", "draft")
    .order("created_at", { ascending: false });
  return (data ?? []) as ReportSemester[];
}

export async function getReportData(
  semesterIds: string[],
): Promise<ReportRow[]> {
  if (!semesterIds.length) return [];

  const supabase = await createClient();

  // Step 1: get class IDs for the selected semesters
  const { data: classes, error: classesError } = await supabase
    .from("classes")
    .select("id")
    .in("semester_id", semesterIds);

  if (classesError) {
    console.error("[reports] classes query error:", classesError.message);
    return [];
  }

  const classIds = (classes ?? []).map((c) => c.id);
  if (!classIds.length) return [];

  const rows: ReportRow[] = [];

  // ── Path A: per-session bookings (drop-in + public flow) ─────────────────────
  // meeting_enrollments → class_meetings (one calendar date each).

  // Step 2: get class meeting IDs + metadata for those classes.
  // class_meetings has direct FKs to both classes and semesters — select them as siblings.
  const { data: sessions, error: sessionsError } = await supabase
    .from("class_meetings")
    .select(
      "id, day_of_week, location, instructor_name, class_id, classes(id, name), semesters(id, name)",
    )
    .in("class_id", classIds)
    .is("cancelled_at", null);

  if (sessionsError) {
    console.error("[reports] sessions query error:", sessionsError.message);
    return [];
  }

  const sessionIds = (sessions ?? []).map((s) => s.id);
  const sessionMeta: Record<string, RowMeta> = {};
  for (const s of sessions ?? []) {
    const cls = (s as any).classes;
    const sem = (s as any).semesters;
    sessionMeta[s.id] = {
      dayOfWeek: formatDayOfWeek(s.day_of_week),
      location: s.location ?? null,
      instructor: s.instructor_name ?? null,
      className: cls?.name ?? "",
      semesterName: sem?.name ?? "",
    };
  }

  if (sessionIds.length) {
    // Use explicit FK hint for registration_orders since meeting_enrollments has
    // two FKs to that table.
    const { data: regs, error: regsError } = await supabase
      .from("meeting_enrollments")
      .select(
        `
        id, created_at, status,
        dancer_id, meeting_id, registration_batch_id,
        dancers(${DANCER_SELECT}),
        registration_orders!registration_batch_id(
          id, grand_total, payment_plan_type, tuition_total, family_discount_amount,
          order_payment_installments(status, paid_amount)
        )
      `,
      )
      .in("meeting_id", sessionIds)
      .neq("status", "cancelled");

    if (regsError) {
      console.error("[reports] registrations query error:", regsError.message);
      return [];
    }

    for (const reg of regs ?? []) {
      const meta = sessionMeta[(reg as any).meeting_id ?? ""] ?? {
        dayOfWeek: "",
        location: null,
        instructor: null,
        className: "",
        semesterName: "",
      };
      rows.push(
        buildReportRow(
          reg.id,
          (reg as any).created_at,
          (reg as any).status,
          (reg as any).dancers,
          (reg as any).registration_orders,
          meta,
        ),
      );
    }
  }

  // ── Path B: full-term enrollments (admin standard / tiered flow) ─────────────
  // section_enrollments → class_sections (recurring block). Without this, reports
  // under-count every dancer enrolled via the standard/tiered admin flow.

  const { data: sections, error: sectionsError } = await supabase
    .from("class_sections")
    .select(
      "id, days_of_week, location, instructor_name, class_id, classes(id, name), semesters(id, name)",
    )
    .in("class_id", classIds);

  if (sectionsError) {
    console.error("[reports] sections query error:", sectionsError.message);
    return rows; // return what we have from Path A rather than dropping everything
  }

  const sectionIds = (sections ?? []).map((s) => s.id);
  const sectionMeta: Record<string, RowMeta> = {};
  for (const s of sections ?? []) {
    const cls = (s as any).classes;
    const sem = (s as any).semesters;
    sectionMeta[s.id] = {
      dayOfWeek: formatDays((s as any).days_of_week),
      location: (s as any).location ?? null,
      instructor: (s as any).instructor_name ?? null,
      className: cls?.name ?? "",
      semesterName: sem?.name ?? "",
    };
  }

  if (sectionIds.length) {
    const { data: enrolls, error: enrollsError } = await supabase
      .from("section_enrollments")
      .select(
        `
        id, created_at, status,
        dancer_id, section_id, batch_id,
        dancers(${DANCER_SELECT}),
        registration_orders!batch_id(
          id, grand_total, payment_plan_type, tuition_total, family_discount_amount,
          order_payment_installments(status, paid_amount)
        )
      `,
      )
      .in("section_id", sectionIds)
      .neq("status", "cancelled");

    if (enrollsError) {
      console.error(
        "[reports] section enrollments query error:",
        enrollsError.message,
      );
      return rows;
    }

    for (const e of enrolls ?? []) {
      const meta = sectionMeta[(e as any).section_id ?? ""] ?? {
        dayOfWeek: "",
        location: null,
        instructor: null,
        className: "",
        semesterName: "",
      };
      rows.push(
        buildReportRow(
          e.id,
          (e as any).created_at,
          (e as any).status,
          (e as any).dancers,
          (e as any).registration_orders,
          meta,
        ),
      );
    }
  }

  return rows;
}
