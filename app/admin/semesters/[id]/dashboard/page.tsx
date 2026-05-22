import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import SemesterDashboard from "./SemesterDashboard";

type PageProps = {
  params: { id: string };
};

function buildTrendData(regs: { created_at: string }[]) {
  const counts: Record<string, number> = {};
  for (const r of regs) {
    const d = new Date(r.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => {
      const [year, month] = key.split("-");
      const label = new Date(Number(year), Number(month) - 1).toLocaleString(
        "en-US",
        { month: "short" }
      );
      return { month: `${label} '${String(year).slice(2)}`, count };
    });
}

export default async function SemesterDashboardPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Phase 1: semester info + sessions (with capacity/class info) in parallel
  const [semesterResult, sessionsResult] = await Promise.all([
    supabase
      .from("semesters")
      .select("id, name, status")
      .eq("id", id)
      .single(),
    supabase
      .from("class_sessions")
      .select("id, schedule_id, capacity, classes(name)")
      .eq("semester_id", id)
      .is("cancelled_at", null),
  ]);

  if (!semesterResult.data) notFound();
  const semester = semesterResult.data;
  const capSessions = sessionsResult.data ?? [];
  const sessionIds = capSessions.map((s) => s.id);

  // Phase 2: operational data (all in parallel)
  const [recentRegsResult, allRegsResult, batchesResult, waitlistResult] =
    await Promise.all([
      sessionIds.length > 0
        ? supabase
            .from("registrations")
            .select(
              "id, created_at, dancers(id, first_name, last_name, birth_date, gender), class_sessions(classes(name))"
            )
            .in("session_id", sessionIds)
            .eq("status", "confirmed")
            .order("created_at", { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [] as any[] }),

      sessionIds.length > 0
        ? supabase
            .from("registrations")
            .select("dancer_id, created_at, session_id")
            .in("session_id", sessionIds)
            .eq("status", "confirmed")
        : Promise.resolve({ data: [] as any[] }),

      supabase
        .from("registration_orders")
        .select("id, status, order_payment_installments(amount_due, status)")
        .eq("semester_id", id),

      sessionIds.length > 0
        ? supabase
            .from("waitlist_entries")
            .select("id", { count: "exact", head: true })
            .in("session_id", sessionIds)
            .eq("status", "waiting")
        : Promise.resolve({ count: 0 }),
    ]);

  // Derived stats
  const allRegs = allRegsResult.data ?? [];
  const participantCount = new Set(allRegs.map((r) => r.dancer_id)).size;
  const spotsFilledCount = allRegs.length;

  const batches = (batchesResult.data ?? []).filter(
    (b) => b.status !== "failed" && b.status !== "refunded"
  );
  const allInstallments = batches.flatMap(
    (b) => (b.order_payment_installments as any[]) ?? []
  );
  const collected = allInstallments
    .filter((i) => i.status === "paid")
    .reduce((sum: number, i: any) => sum + (i.amount_due ?? 0), 0);
  const outstanding = allInstallments
    .filter((i) => ["scheduled", "overdue", "processing"].includes(i.status))
    .reduce((sum: number, i: any) => sum + (i.amount_due ?? 0), 0);

  const trendData = buildTrendData(allRegs);

  // Build enrollment count per session ID
  const enrolledBySessionId: Record<string, number> = {};
  for (const r of allRegs) {
    if (r.session_id) {
      enrolledBySessionId[r.session_id] =
        (enrolledBySessionId[r.session_id] ?? 0) + 1;
    }
  }

  // Build session capacity rows, grouped by schedule_id
  const scheduleMap = new Map<
    string,
    { name: string; enrolled: number; capacity: number }
  >();
  for (const s of capSessions) {
    const key = (s as any).schedule_id ?? s.id;
    const className = (s.classes as any)?.name ?? "—";
    const sessionEnrolled = enrolledBySessionId[s.id] ?? 0;
    const existing = scheduleMap.get(key);
    if (existing) {
      existing.enrolled += sessionEnrolled;
    } else {
      scheduleMap.set(key, {
        name: className,
        enrolled: sessionEnrolled,
        capacity: s.capacity ?? 0,
      });
    }
  }
  const sessionCapacity = Array.from(scheduleMap.values())
    .filter((s) => s.capacity > 0)
    .sort((a, b) => b.enrolled / b.capacity - a.enrolled / a.capacity);

  return (
    <div className="p-6 space-y-5">
      {/* Page header */}
      <div className="admin-page-header">
        <div>
          <h1
            className="font-outfit text-2xl font-bold tracking-tight"
            style={{ color: "var(--admin-text)" }}
          >
            {semester.name}
          </h1>
          <p className="admin-page-subtitle mt-1 flex items-center gap-2">
            Season Dashboard
            <span className="badge badge-success capitalize">
              {semester.status}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/preview/semester/${id}`}
            target="_blank"
            className="admin-btn-neutral admin-btn-sm"
          >
            Preview semester
          </Link>
          <Link
            href={`/admin/register?semester=${id}`}
            className="admin-btn-primary admin-btn-sm"
          >
            + Register dancer
          </Link>
        </div>
      </div>

      <SemesterDashboard
        semesterId={id}
        recentRegistrations={recentRegsResult.data ?? []}
        participantCount={participantCount}
        spotsFilledCount={spotsFilledCount}
        waitlistCount={(waitlistResult as any).count ?? 0}
        collected={collected}
        outstanding={outstanding}
        totalRevenue={collected + outstanding}
        trendData={trendData}
        sessionCapacity={sessionCapacity}
      />
    </div>
  );
}
