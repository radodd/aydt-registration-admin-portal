import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { SessionsTable } from "./SessionsTable";

export default async function AdminSessionsPage() {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/auth");

  // Fetch all active (non-cancelled) sessions with class + semester info
  // schedule_id is included so we can aggregate enrollment at the schedule level
  const { data: sessions } = await supabase
    .from("class_sessions")
    .select(
      `id, schedule_id, day_of_week, start_time, end_time, start_date, end_date,
       capacity, registration_close_at, cancelled_at,
       classes ( name, discipline ),
       semesters ( name )`
    )
    .is("cancelled_at", null)
    .order("start_date", { ascending: true });

  const allSessions = sessions ?? [];
  console.log("[sessions/page] total class_sessions fetched:", allSessions.length);

  // Sample the first session to check its shape (does schedule_id exist?)
  if (allSessions.length > 0) {
    const sample = allSessions[0] as Record<string, unknown>;
    console.log("[sessions/page] sample session keys:", Object.keys(sample));
    console.log("[sessions/page] sample session:", {
      id: sample.id,
      schedule_id: sample.schedule_id,
      day_of_week: sample.day_of_week,
      class: sample.classes,
      semester: sample.semesters,
    });
  }

  // Build session_id → schedule_id map from the already-fetched sessions
  const sessionToSchedule: Record<string, string> = {};
  for (const s of allSessions) {
    const schedId = (s as any).schedule_id;
    if (schedId) sessionToSchedule[s.id] = schedId;
  }

  const sessionIds = Object.keys(sessionToSchedule);
  const uniqueScheduleIds = Array.from(new Set(Object.values(sessionToSchedule)));
  console.log("[sessions/page] sessions with schedule_id:", sessionIds.length, "/ unique schedules:", uniqueScheduleIds.length);

  // Count confirmed registrations per schedule_id.
  const enrolledBySchedule: Record<string, number> = {};
  // Fetch all confirmed registrations (no .in() filter — avoids URL length limits with large session sets).
  // The sessionToSchedule map acts as the join/filter in JS.
  const { data: counts, error: countError } = await supabase
    .from("registrations")
    .select("session_id")
    .eq("status", "confirmed");

  console.log("[sessions/page] registrations query error:", countError);
  console.log("[sessions/page] confirmed registrations found:", counts?.length ?? 0);
  if (counts && counts.length > 0) {
    console.log("[sessions/page] sample reg session_ids:", counts.slice(0, 5).map(r => r.session_id));
  }

  for (const row of counts ?? []) {
    const schedId = sessionToSchedule[row.session_id];
    if (schedId) {
      enrolledBySchedule[schedId] = (enrolledBySchedule[schedId] ?? 0) + 1;
    }
  }
  console.log("[sessions/page] enrolledBySchedule:", enrolledBySchedule);

  // Build a per-session countMap so SessionsTable can look up by session id
  const countMap: Record<string, number> = {};
  for (const s of allSessions) {
    const schedId = (s as any).schedule_id;
    if (schedId) {
      countMap[s.id] = enrolledBySchedule[schedId] ?? 0;
    }
  }
  const nonZero = Object.values(countMap).filter(v => v > 0).length;
  console.log("[sessions/page] countMap entries with enrollment > 0:", nonZero, "/", allSessions.length);

  // Derive unique filter options from session data
  const uniqueSemesters = Array.from(
    new Set(allSessions.map((s) => (s.semesters as any)?.name).filter(Boolean))
  ).sort() as string[];
  const uniqueDisciplines = Array.from(
    new Set(allSessions.map((s) => (s.classes as any)?.discipline).filter(Boolean))
  ).sort() as string[];
  const uniqueDays = Array.from(
    new Set(allSessions.map((s) => s.day_of_week).filter(Boolean))
  ) as string[];
  const DAY_ORDER = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  uniqueDays.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Class Sessions</h1>
        <p className="text-sm text-gray-500 mt-1">
          All active sessions across semesters. Cancelling a session will notify all enrolled families by email and SMS.
        </p>
      </div>

      <SessionsTable
        sessions={allSessions as any}
        registrationCounts={countMap}
        filterOptions={{ semesters: uniqueSemesters, disciplines: uniqueDisciplines, days: uniqueDays }}
      />
    </div>
  );
}
