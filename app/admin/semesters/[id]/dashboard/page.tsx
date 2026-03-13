import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
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

  // Step 1: semester info + session IDs (in parallel)
  const [semesterResult, sessionsResult] = await Promise.all([
    supabase
      .from("semesters")
      .select("id, name, status")
      .eq("id", id)
      .single(),
    supabase.from("class_sessions").select("id").eq("semester_id", id),
  ]);

  if (!semesterResult.data) notFound();
  const semester = semesterResult.data;
  const sessionIds = sessionsResult.data?.map((s) => s.id) ?? [];

  // Step 2: operational data (all in parallel)
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
            .select("dancer_id, created_at")
            .in("session_id", sessionIds)
            .eq("status", "confirmed")
        : Promise.resolve({ data: [] as any[] }),

      supabase
        .from("registration_batches")
        .select("id, status, batch_payment_installments(amount_due, status)")
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
    (b) => (b.batch_payment_installments as any[]) ?? []
  );
  const collected = allInstallments
    .filter((i) => i.status === "paid")
    .reduce((sum: number, i: any) => sum + (i.amount_due ?? 0), 0);
  const outstanding = allInstallments
    .filter((i) => ["scheduled", "overdue", "processing"].includes(i.status))
    .reduce((sum: number, i: any) => sum + (i.amount_due ?? 0), 0);

  const trendData = buildTrendData(allRegs);

  return (
    <div className="mx-auto max-w-5xl p-6 text-slate-700 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{semester.name}</h1>
          <p className="text-sm text-slate-400 mt-0.5">Season Dashboard</p>
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
      />
    </div>
  );
}
