import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import SemesterLifecycleActions from "./SemesterLifecycleActions";
import SemesterDetailTabs from "./SemesterDetailTabs";
import SemesterHeaderMenu from "./SemesterHeaderMenu";

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

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  published: { bg: "rgba(125,206,194,.18)", color: "#0A5A50" },
  draft:     { bg: "rgba(158,196,180,.18)", color: "#20503A" },
  scheduled: { bg: "rgba(196,160,212,.18)", color: "#5A2878" },
  archived:  { bg: "rgba(232,184,176,.18)", color: "#802818" },
};

export default async function SemesterDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  /* ── Data fetching (unchanged) ────────────────────────────────── */
  const [semesterResult, enrollResult, auditResult] = await Promise.all([
    supabase
      .from("semesters")
      .select(`
        *,
        classes(*, class_sections(*, section_price_tiers(*))),
        meeting_groups(id, name, meeting_group_meetings(meeting_id, class_meetings(section_id))),
        semester_payment_plans(*),
        semester_payment_installments(*),
        semester_discounts(
          semester_id, discount_id,
          discount:discounts(*, discount_rules(*), discount_rule_meetings(meeting_id))
        ),
        tuition_rate_bands(*),
        semester_fee_config(*),
        semester_coupons(coupon:discount_coupons(*))
      `)
      .eq("id", id)
      .single(),

    supabase
      .from("meeting_enrollments")
      .select("id, class_meetings!inner(semester_id)", { count: "exact", head: true })
      .eq("class_meetings.semester_id", id)
      .eq("status", "confirmed"),

    supabase
      .from("semester_audit_logs")
      .select("id, action, created_at, changes")
      .eq("semester_id", id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (!semesterResult.data || semesterResult.error) notFound();
  const semester = semesterResult.data;

  const sessionIds = (
    await supabase.from("class_meetings").select("id").eq("semester_id", id)
  ).data?.map((s) => s.id) ?? [];

  const waitlistResult =
    sessionIds.length > 0
      ? await supabase
          .from("waitlist_entries")
          .select("id", { count: "exact", head: true })
          .in("meeting_id", sessionIds)
          .eq("status", "waiting")
      : { count: 0 };

  const enrolledCount = enrollResult.count ?? 0;
  const waitlistCount = (waitlistResult as any).count ?? 0;
  const auditLogs = auditResult.data ?? [];

  const allSchedules = (semester.classes ?? []).flatMap((c: any) => c.class_sections ?? []);
  const startDates = allSchedules.map((s: any) => s.start_date).filter(Boolean).sort();
  const endDates   = allSchedules.map((s: any) => s.end_date).filter(Boolean).sort();
  const regCloseDates = allSchedules.map((s: any) => s.registration_close_at).filter(Boolean).sort();

  const semesterStart = startDates[0] ?? null;
  const semesterEnd   = endDates[endDates.length - 1] ?? null;
  const regCloseAt    = regCloseDates[0] ?? null;

  const classCount    = (semester.classes ?? []).length;
  const paymentSet    = (semester.semester_payment_plans ?? []).length > 0;
  const regFormBuilt  = (semester.registration_form?.elements ?? []).length > 0;
  const emailSet      = !!(semester.confirmation_email?.subject);

  const badge = STATUS_BADGE[semester.status] ?? STATUS_BADGE.draft;

  return (
    <div className="space-y-4 min-h-full">

      {/* ── Header card ───────────────────────────────────────────── */}
      <div
        className="admin-card overflow-hidden"
        style={{ borderTop: "3px solid var(--admin-card-accent)" }}
      >
        <div className="px-5 py-4">

          {/* Row 1: name + status badge + ⋯ menu */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1
                  className="text-xl font-semibold"
                  style={{ color: "var(--admin-text)", wordBreak: "break-word" }}
                >
                  {semester.name}
                </h1>
                <span
                  className="shrink-0 text-[11.5px] font-semibold px-2.5 py-0.5 rounded-full capitalize"
                  style={{ background: badge.bg, color: badge.color }}
                >
                  {semester.status}
                </span>
              </div>
            </div>

            {/* ⋯ secondary navigation menu */}
            <div className="shrink-0">
              <SemesterHeaderMenu semesterId={id} />
            </div>
          </div>

          {/* Row 2: date range + reg close */}
          {(semesterStart || regCloseAt) && (
            <p className="mt-1 text-[12.5px] flex items-center gap-2 flex-wrap" style={{ color: "var(--admin-text-faint)" }}>
              {semesterStart && semesterEnd && (
                <span>{fmtDate(semesterStart)} – {fmtDate(semesterEnd)}</span>
              )}
              {regCloseAt && (
                <>
                  <span style={{ color: "var(--admin-border)" }}>·</span>
                  <span>Reg closes {fmtDate(regCloseAt)}</span>
                </>
              )}
            </p>
          )}
        </div>

        {/* Stat strip — compact */}
        <div
          className="flex items-center border-t divide-x"
          style={{ borderColor: "var(--admin-border-sub)", background: "var(--admin-surface-sub)" }}
        >
          {[
            { label: "enrolled",   value: enrolledCount.toLocaleString() },
            { label: "classes",    value: classCount.toLocaleString() },
            { label: "waitlisted", value: waitlistCount.toLocaleString() },
          ].map(({ label, value }) => (
            <div key={label} className="flex-1 px-4 py-2 flex items-center gap-1.5">
              <span
                className="text-[13px] font-semibold tabular-nums"
                style={{ color: "var(--admin-text)" }}
              >
                {value}
              </span>
              <span
                className="text-[11.5px]"
                style={{ color: "var(--admin-text-faint)" }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Body — tabs + sidebar ─────────────────────────────────── */}
      {/*
        lg+:  tabs (flex-1) | sidebar (w-68)
        <lg:  tabs full-width, sidebar stacked below
      */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 items-start">

        {/* Tabs — takes full width on mobile/iPad */}
        <div className="flex-1 min-w-0 w-full">
          <SemesterDetailTabs semester={semester} />
        </div>

        {/* Status & Publishing sidebar */}
        <div className="w-full lg:w-68 lg:shrink-0">
          <SemesterLifecycleActions
            semesterId={id}
            status={semester.status}
            publishAt={semester.publish_at}
            health={{ classCount, paymentSet, regFormBuilt, emailSet, waitlistCount }}
            auditLogs={auditLogs}
          />
        </div>
      </div>

    </div>
  );
}
