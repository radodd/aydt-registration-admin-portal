import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import SemesterLifecycleActions from "./SemesterLifecycleActions";
import SemesterDetailTabs from "./SemesterDetailTabs";

type PageProps = {
  params: {
    id: string;
  };
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_BADGE: Record<string, string> = {
  published: "bg-green-100 text-green-700",
  draft: "bg-neutral-100 text-neutral-600",
  scheduled: "bg-blue-100 text-blue-700",
  archived: "bg-red-100 text-red-600",
};

export default async function SemesterDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Phase 1: all independent queries in parallel
  const [semesterResult, enrollResult, auditResult] = await Promise.all([
    supabase
      .from("semesters")
      .select(
        `
        *,
        classes(
          *,
          class_schedules (*, schedule_price_tiers(*))
        ),
        session_groups(
          id, name, session_group_sessions(session_id, class_sessions(schedule_id))
        ),
        semester_payment_plans(*),
        semester_payment_installments(*),
        semester_discounts(
          semester_id,
          discount_id,
          discount:discounts(
            *,
            discount_rules(*),
            discount_rule_sessions(session_id)
          )
        ),
        tuition_rate_bands(*),
        semester_fee_config(*),
        semester_coupons(
          coupon:discount_coupons(*)
        )
        `,
      )
      .eq("id", id)
      .single(),

    supabase
      .from("registrations")
      .select("id, class_sessions!inner(semester_id)", {
        count: "exact",
        head: true,
      })
      .eq("class_sessions.semester_id", id)
      .eq("status", "confirmed"),

    supabase
      .from("semester_audit_logs")
      .select("id, action, created_at, changes")
      .eq("semester_id", id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (!semesterResult.data || semesterResult.error) {
    notFound();
  }

  const semester = semesterResult.data;

  // Phase 2: waitlist count (needs session IDs)
  const sessionIds =
    (
      await supabase
        .from("class_sessions")
        .select("id")
        .eq("semester_id", id)
    ).data?.map((s) => s.id) ?? [];

  const waitlistResult =
    sessionIds.length > 0
      ? await supabase
          .from("waitlist_entries")
          .select("id", { count: "exact", head: true })
          .in("session_id", sessionIds)
          .eq("status", "waiting")
      : { count: 0 };

  const enrolledCount = enrollResult.count ?? 0;
  const waitlistCount = (waitlistResult as any).count ?? 0;
  const auditLogs = auditResult.data ?? [];

  // Compute date range from class schedules
  const allSchedules = (semester.classes ?? []).flatMap(
    (c: any) => c.class_schedules ?? [],
  );
  const startDates = allSchedules
    .map((s: any) => s.start_date)
    .filter(Boolean)
    .sort();
  const endDates = allSchedules
    .map((s: any) => s.end_date)
    .filter(Boolean)
    .sort();
  const regCloseDates = allSchedules
    .map((s: any) => s.registration_close_at)
    .filter(Boolean)
    .sort();

  const semesterStart = startDates[0] ?? null;
  const semesterEnd = endDates[endDates.length - 1] ?? null;
  const regCloseAt = regCloseDates[0] ?? null;

  // Health checks
  const classCount = (semester.classes ?? []).length;
  const paymentSet = (semester.semester_payment_plans ?? []).length > 0;
  const regFormBuilt =
    (semester.registration_form?.elements ?? []).length > 0;
  const emailSet = !!(semester.confirmation_email?.subject);

  const statusBadge = STATUS_BADGE[semester.status] ?? STATUS_BADGE.draft;

  return (
    <div className="p-6 text-slate-700 space-y-4 min-h-full">
      {/* Breadcrumb */}
      <nav className="text-sm text-neutral-500 flex items-center gap-1.5">
        <Link href="/admin/semesters" className="hover:text-neutral-700 transition">
          Semesters
        </Link>
        <span className="text-neutral-300">/</span>
        <span className="text-neutral-700">{semester.name}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold">{semester.name}</h1>
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${statusBadge}`}
            >
              {semester.status}
            </span>
          </div>
          <p className="text-sm text-neutral-400 mt-1 flex items-center gap-2 flex-wrap">
            {semesterStart && semesterEnd && (
              <span>
                {fmtDate(semesterStart)} – {fmtDate(semesterEnd)}
              </span>
            )}
            {regCloseAt && (
              <>
                <span className="text-neutral-200">·</span>
                <span>Reg closes {fmtDate(regCloseAt)}</span>
              </>
            )}
            <span className="text-neutral-200">·</span>
            <span>{enrolledCount} enrolled</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/semesters/${id}/dashboard`}
            className="inline-flex items-center px-3.5 py-2 text-sm font-medium rounded-lg border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 transition"
          >
            Dashboard
          </Link>
          <Link
            href={`/admin/semesters/${id}/invites`}
            className="inline-flex items-center px-3.5 py-2 text-sm font-medium rounded-lg border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 transition"
          >
            Competition invites
          </Link>
          <Link
            href={`/preview/semester/${id}`}
            target="_blank"
            className="inline-flex items-center px-3.5 py-2 text-sm font-medium rounded-lg border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 transition"
          >
            Preview page
          </Link>
          <Link
            href={`/admin/semesters/${id}/edit`}
            className="inline-flex items-center px-3.5 py-2 text-sm font-medium rounded-lg text-white transition"
            style={{ background: "var(--admin-sidebar-active)" }}
          >
            Edit semester
          </Link>
        </div>
      </div>

      {/* Two-column body */}
      <div className="flex gap-5 items-start">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          <SemesterDetailTabs semester={semester} />
        </div>

        {/* Right sidebar */}
        <div className="w-68 shrink-0">
          <SemesterLifecycleActions
            semesterId={id}
            status={semester.status}
            publishAt={semester.publish_at}
            health={{
              classCount,
              paymentSet,
              regFormBuilt,
              emailSet,
              waitlistCount,
            }}
            auditLogs={auditLogs}
          />
        </div>
      </div>
    </div>
  );
}
