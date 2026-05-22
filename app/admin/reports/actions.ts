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

  // Step 2: get class session IDs + metadata for those classes
  // class_meetings has direct FKs to both classes and semesters — select them as siblings
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
  if (!sessionIds.length) return [];

  const sessionMeta: Record<
    string,
    {
      dayOfWeek: string;
      location: string | null;
      instructor: string | null;
      className: string;
      semesterName: string;
    }
  > = {};
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

  // Step 3: fetch registrations with related data.
  // TODO(Phase 3a follow-up): merge with section_enrollments so reports include
  // admin-created full-term enrollments. The join shape is non-trivial — separate task.
  // Use explicit FK hint for registration_orders since registrations has two FKs to that table
  const { data: regs, error: regsError } = await supabase
    .from("registrations")
    .select(
      `
      id, created_at, status,
      dancer_id, meeting_id, registration_batch_id,
      dancers(
        id, first_name, last_name, birth_date, grade, family_id,
        families!family_id(
          id, family_name,
          users!family_id(id, first_name, last_name, email, phone_number, is_primary_parent)
        )
      ),
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

  return (regs ?? []).map((reg) => {
    const dancer = (reg as any).dancers;
    const family = dancer?.families;
    const users: any[] = family?.users ?? [];
    const primaryParent =
      users.find((u: any) => u.is_primary_parent) ?? users[0] ?? null;

    const batch = (reg as any).registration_orders;
    const installments: any[] = batch?.order_payment_installments ?? [];
    const paidAmount = installments
      .filter((i: any) => i.status === "paid")
      .reduce((sum: number, i: any) => sum + (i.paid_amount ?? 0), 0);
    const grandTotal = batch?.grand_total ?? 0;
    const balance = Math.max(0, grandTotal - paidAmount);

    const meta = sessionMeta[reg.meeting_id ?? ""] ?? {
      dayOfWeek: "",
      location: null,
      instructor: null,
      className: "",
      semesterName: "",
    };

    return {
      id: reg.id,
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
      dateRegistered: reg.created_at,
      daysOfWeek: meta.dayOfWeek,
      location: meta.location,
      instructor: meta.instructor,
      familyId: family?.id ?? "",
      parentEmail: primaryParent?.email ?? "",
      parentPhone: primaryParent?.phone_number ?? null,
      tuitionAmount: batch?.tuition_total ?? 0,
      discountTotal: batch?.family_discount_amount ?? 0,
      paymentPlanType: batch?.payment_plan_type ?? "—",
      registrationStatus: reg.status,
      balance,
      dancerId: dancer?.id ?? "",
    } satisfies ReportRow;
  });
}
