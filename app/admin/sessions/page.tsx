import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { SessionsTable } from "./SessionsTable";
import { SessionsRightPanel } from "@/app/admin/_components/SessionsRightPanel";

export default async function AdminSessionsPage() {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/auth");

  // Fetch all active (non-cancelled) sessions with class + semester info
  // section_id is included so we can aggregate enrollment at the schedule level
  const { data: sessions } = await supabase
    .from("class_meetings")
    .select(
      `id, section_id, day_of_week, start_time, end_time, start_date, end_date,
       capacity, registration_close_at, cancelled_at,
       classes ( name, discipline ),
       semesters ( name )`
    )
    .is("cancelled_at", null)
    .order("start_date", { ascending: true });

  const allSessions = sessions ?? [];

  // Build meeting_id → section_id map from the already-fetched sessions
  const sessionToSchedule: Record<string, string> = {};
  for (const s of allSessions) {
    const schedId = (s as any).section_id;
    if (schedId) sessionToSchedule[s.id] = schedId;
  }

  const uniqueScheduleIds = Array.from(new Set(Object.values(sessionToSchedule)));

  // Count confirmed registrations per section_id.
  const enrolledBySchedule: Record<string, number> = {};
  const { data: counts } = await supabase
    .from("registrations")
    .select("meeting_id")
    .eq("status", "confirmed");

  for (const row of counts ?? []) {
    const schedId = sessionToSchedule[row.meeting_id];
    if (schedId) {
      enrolledBySchedule[schedId] = (enrolledBySchedule[schedId] ?? 0) + 1;
    }
  }

  // Deduplicate by section_id — one row per class instance
  const seen = new Set<string>();
  const uniqueClassInstances = allSessions.filter((s) => {
    const schedId = (s as any).section_id;
    if (!schedId) return true;
    if (seen.has(schedId)) return false;
    seen.add(schedId);
    return true;
  });

  // Build countMap keyed by representative session id for each schedule
  const countMap: Record<string, number> = {};
  for (const s of uniqueClassInstances) {
    const schedId = (s as any).section_id;
    countMap[s.id] = schedId ? (enrolledBySchedule[schedId] ?? 0) : 0;
  }

  // Derive unique filter options from deduplicated instances
  const DAY_ORDER = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const uniqueSemesters = Array.from(
    new Set(uniqueClassInstances.map((s) => (s.semesters as any)?.name).filter(Boolean))
  ).sort() as string[];
  const uniqueDisciplines = Array.from(
    new Set(uniqueClassInstances.map((s) => (s.classes as any)?.discipline).filter(Boolean))
  ).sort() as string[];
  const uniqueDays = Array.from(
    new Set(uniqueClassInstances.map((s) => s.day_of_week).filter(Boolean))
  ) as string[];
  uniqueDays.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));

  return (
    <div className="flex gap-0 md:-mx-8 md:-my-8" style={{ minHeight: "calc(100vh - 56px)" }}>
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 md:px-8 md:py-8 space-y-5">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--admin-text)" }}>Class Sessions</h1>
          <p className="text-sm mt-1" style={{ color: "var(--admin-text-faint)" }}>
            All active classes across semesters. Cancelling a class will notify all enrolled families.
          </p>
        </div>

        <SessionsTable
          sessions={uniqueClassInstances as any}
          registrationCounts={countMap}
          filterOptions={{ semesters: uniqueSemesters, disciplines: uniqueDisciplines, days: uniqueDays }}
        />
      </div>
      <div className="hidden lg:block">
        <SessionsRightPanel />
      </div>
    </div>
  );
}
