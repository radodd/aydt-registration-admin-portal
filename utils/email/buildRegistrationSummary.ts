/**
 * Meeting-plan item #4 — system-generated "Registration Summary" receipt block.
 *
 * Rendered into EVERY confirmation email regardless of the admin's editable
 * free-text. It is NOT editable in the email designer. The data is sourced from
 * BOTH enrollment tables so tiered/standard enrollments are never silently
 * dropped (see `project_enrollment_table_divergence`):
 *   - meeting_enrollments  → drop-in / per-day bookings (joined via class_meetings)
 *   - section_enrollments  → full-term standard/tiered (joined via class_sections)
 *
 * Money is reported at the ORDER level (one amount-paid + season-balance for the
 * whole order), because no per-participant paid amount exists in the schema —
 * only `registration_orders.grand_total` and the `order_payment_installments`
 * ledger.
 *
 * Two layers:
 *   - `renderRegistrationSummaryHtml(summary)`  — PURE render (unit-testable,
 *     reused by the admin designer preview + test send with sample data).
 *   - `fetchRegistrationSummary(supabase, opts)` — DB I/O against a batch/order.
 *   - `buildRegistrationSummaryHtml(...)`        — fetch + render; returns "" on
 *     empty/failure so the confirmation email never breaks because of it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  RegistrationSummary,
  RegistrationSummaryParticipant,
  RegistrationSummarySession,
} from "@/types";

/* ──────────────────────────────────────────────────────────────────────────── */
/* Formatting helpers                                                           */
/* ──────────────────────────────────────────────────────────────────────────── */

const DAY_LABEL: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

function makeMoneyFormatter(currencyCode?: string) {
  const fmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode || "USD",
  });
  return (n: number | null | undefined): string | undefined =>
    n === null || n === undefined || Number.isNaN(Number(n))
      ? undefined
      : fmt.format(Number(n));
}

function fmtTime(t?: string | null): string | null {
  if (!t) return null;
  const [hRaw, mRaw] = t.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw ?? 0);
  if (Number.isNaN(h)) return null;
  const period = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${period}`;
}

function fmtTimeRange(start?: string | null, end?: string | null): string | null {
  const s = fmtTime(start);
  const e = fmtTime(end);
  if (s && e) return `${s}–${e}`;
  return s || e || null;
}

/** date-only string (YYYY-MM-DD) → "Jun 3, 2026" without TZ drift. */
function fmtDate(d?: string | null): string | null {
  if (!d) return null;
  const parsed = new Date(`${d}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** ISO timestamp → "June 3, 2026" (long form, matches confirmation date style). */
function fmtLongDate(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/* PostgREST nested relations come back as an object or a single-element array
 * depending on cardinality — normalize to the first record. */
function firstOf<T>(rel: T | T[] | null | undefined): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : (rel ?? null);
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function className(classRel: { name: string | null; display_name?: string | null } | null): string {
  if (!classRel) return "Registration";
  return (classRel.display_name?.trim() || classRel.name?.trim() || "Registration");
}

/* ──────────────────────────────────────────────────────────────────────────── */
/* Render (pure)                                                                */
/* ──────────────────────────────────────────────────────────────────────────── */

const LABEL = "color:#64748b;font-size:13px;";
const VALUE = "color:#333;font-size:13px;";

function renderDetailLine(label: string, value?: string): string {
  if (!value) return "";
  return `<div style="margin:1px 0;"><span style="${LABEL}">${htmlEscape(label)}:</span> <span style="${VALUE}">${htmlEscape(value)}</span></div>`;
}

function renderSession(session: RegistrationSummarySession): string {
  const amount = session.amount
    ? `<span style="float:right;font-size:13px;color:#333;">${htmlEscape(session.amount)}</span>`
    : "";
  const excluded =
    session.excludedDates && session.excludedDates.length > 0
      ? renderDetailLine("Excluded dates", session.excludedDates.join(", "))
      : "";

  return `
    <div style="margin:0 0 12px;padding:0 0 10px;border-bottom:1px solid #eee;">
      <div style="font-weight:bold;font-size:14px;color:#333;">${htmlEscape(session.name)}${amount}</div>
      ${renderDetailLine("When", session.schedule)}
      ${renderDetailLine("Location", session.location)}
      ${renderDetailLine("Address", session.locationAddress)}
      ${renderDetailLine("Classroom", session.classroom)}
      ${renderDetailLine("Instructor", session.instructor)}
      ${renderDetailLine("Group", session.group)}
      ${excluded}
    </div>`;
}

function renderParticipant(p: RegistrationSummaryParticipant): string {
  const sessions = p.sessions.map(renderSession).join("");
  const purchases =
    p.purchases && p.purchases.length > 0
      ? `<div style="margin:6px 0 10px;">
           <div style="${LABEL}font-weight:bold;text-transform:uppercase;letter-spacing:0.04em;margin:0 0 4px;">Purchases</div>
           ${p.purchases.map((line) => `<div style="${VALUE}margin:1px 0;">${htmlEscape(line)}</div>`).join("")}
         </div>`
      : "";

  return `
    <div style="margin:0 0 18px;">
      <div style="font-weight:bold;font-size:15px;color:#7B1F1A;">${htmlEscape(p.name)}</div>
      ${p.registeredOn ? `<div style="${LABEL}margin:0 0 8px;">Registered on ${htmlEscape(p.registeredOn)}</div>` : `<div style="margin:0 0 8px;"></div>`}
      ${sessions}
      ${purchases}
    </div>`;
}

/**
 * Pure render. Returns "" when there is nothing to show (no participants and no
 * money), so callers can append unconditionally.
 */
export function renderRegistrationSummaryHtml(summary: RegistrationSummary): string {
  const hasParticipants = summary.participants.length > 0;
  const hasMoney = Boolean(summary.amountPaid || summary.seasonBalance);
  if (!hasParticipants && !hasMoney) return "";

  const participants = summary.participants.map(renderParticipant).join("");

  const moneyRows = [
    summary.amountPaid
      ? `<tr><td style="padding:4px 0;font-size:14px;color:#555;">Amount paid</td><td style="padding:4px 0;font-size:14px;text-align:right;color:#16a34a;font-weight:bold;">${htmlEscape(summary.amountPaid)}</td></tr>`
      : "",
    summary.seasonBalance
      ? `<tr><td style="padding:4px 0;font-size:14px;color:#555;">Season balance</td><td style="padding:4px 0;font-size:14px;text-align:right;color:#333;">${htmlEscape(summary.seasonBalance)}</td></tr>`
      : "",
  ].join("");

  const moneyBlock = moneyRows
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 0;border-top:2px solid #7B1F1A;border-collapse:collapse;">${moneyRows}</table>`
    : "";

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;border-collapse:collapse;">
      <tr>
        <td style="padding:0 0 12px 0;font-weight:bold;font-size:13px;color:#7B1F1A;border-bottom:2px solid #7B1F1A;text-transform:uppercase;letter-spacing:0.05em;">
          Registration Summary
        </td>
      </tr>
      <tr>
        <td style="padding:16px 0 0 0;">
          ${participants}
          ${moneyBlock}
        </td>
      </tr>
    </table>`;
}

/* ──────────────────────────────────────────────────────────────────────────── */
/* Fetch (DB I/O)                                                               */
/* ──────────────────────────────────────────────────────────────────────────── */

type DancerRel = { first_name: string | null; last_name: string | null };
type ClassRel = { name: string | null; display_name: string | null };
type MeetingRel = {
  schedule_date: string | null;
  day_of_week: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  location_address: string | null;
  classroom_name: string | null;
  instructor_name: string | null;
  classes: ClassRel | ClassRel[] | null;
};
type SectionRel = {
  days_of_week: string[] | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  location_address: string | null;
  classroom_name: string | null;
  instructor_name: string | null;
  classes: ClassRel | ClassRel[] | null;
};

export interface FetchRegistrationSummaryOptions {
  batchId: string;
  currencyCode?: string;
}

/** Await a PostgREST query, returning its rows or [] on any failure. */
async function safeRows<T>(
  builder: PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  try {
    const { data } = await builder;
    return data ?? [];
  } catch {
    return [];
  }
}

/**
 * Build a {@link RegistrationSummary} for one order/batch. Resilient by design:
 * each enrichment query is independent, so a missing/empty satellite (group,
 * excluded dates, purchases) degrades to an omitted field rather than failing
 * the whole summary.
 */
export async function fetchRegistrationSummary(
  // Generic supabase client (the EPG webhook uses a service-role client).
  supabase: SupabaseClient,
  { batchId, currencyCode }: FetchRegistrationSummaryOptions,
): Promise<RegistrationSummary | null> {
  const money = makeMoneyFormatter(currencyCode);

  const [
    { data: order },
    { data: installments },
    { data: meetingRows },
    { data: sectionRows },
    { data: optionItems },
  ] = await Promise.all([
    supabase.from("registration_orders").select("grand_total").eq("id", batchId).single(),
    supabase
      .from("order_payment_installments")
      .select("amount_due, status")
      .eq("batch_id", batchId),
    supabase
      .from("meeting_enrollments")
      .select(
        "id, dancer_id, meeting_id, total_amount, created_at, dancers(first_name, last_name), class_meetings(schedule_date, day_of_week, start_time, end_time, location, location_address, classroom_name, instructor_name, classes(name, display_name))",
      )
      .eq("registration_batch_id", batchId)
      .neq("status", "cancelled"),
    supabase
      .from("section_enrollments")
      .select(
        "id, dancer_id, section_id, price_snapshot, created_at, dancers(first_name, last_name), class_sections(days_of_week, start_time, end_time, location, location_address, classroom_name, instructor_name, classes(name, display_name))",
      )
      .eq("batch_id", batchId)
      .neq("status", "cancelled"),
    supabase
      .from("order_line_items")
      .select("dancer_id, label, amount")
      .eq("batch_id", batchId)
      .eq("item_type", "option"),
  ]);

  const meetingIds = (meetingRows ?? [])
    .map((r) => (r as { meeting_id: string | null }).meeting_id)
    .filter((v): v is string => Boolean(v));
  const sectionIds = (sectionRows ?? [])
    .map((r) => (r as { section_id: string | null }).section_id)
    .filter((v): v is string => Boolean(v));

  // Enrichment satellites — each guarded so a failure can't break the email.
  const [meetingGroups, meetingExcluded, sectionExcluded] = await Promise.all([
    meetingIds.length
      ? safeRows<{ meeting_id: string; meeting_groups: unknown }>(
          supabase
            .from("meeting_group_meetings")
            .select("meeting_id, meeting_groups(name)")
            .in("meeting_id", meetingIds),
        )
      : Promise.resolve([]),
    meetingIds.length
      ? safeRows<{ class_meeting_id: string; excluded_date: string }>(
          supabase
            .from("class_meeting_excluded_dates")
            .select("class_meeting_id, excluded_date")
            .in("class_meeting_id", meetingIds),
        )
      : Promise.resolve([]),
    sectionIds.length
      ? safeRows<{ section_id: string; excluded_date: string }>(
          supabase
            .from("class_section_excluded_dates")
            .select("section_id, excluded_date")
            .in("section_id", sectionIds),
        )
      : Promise.resolve([]),
  ]);

  // meetingId → group name
  const groupByMeeting = new Map<string, string>();
  for (const g of meetingGroups as Array<{ meeting_id: string; meeting_groups: unknown }>) {
    const grp = firstOf(g.meeting_groups as { name: string | null } | { name: string | null }[] | null);
    if (grp?.name) groupByMeeting.set(g.meeting_id, grp.name);
  }

  // meetingId / sectionId → formatted excluded dates
  const excludedByMeeting = new Map<string, string[]>();
  for (const e of meetingExcluded as Array<{ class_meeting_id: string; excluded_date: string }>) {
    const label = fmtDate(e.excluded_date);
    if (!label) continue;
    const arr = excludedByMeeting.get(e.class_meeting_id) ?? [];
    arr.push(label);
    excludedByMeeting.set(e.class_meeting_id, arr);
  }
  const excludedBySection = new Map<string, string[]>();
  for (const e of sectionExcluded as Array<{ section_id: string; excluded_date: string }>) {
    const label = fmtDate(e.excluded_date);
    if (!label) continue;
    const arr = excludedBySection.get(e.section_id) ?? [];
    arr.push(label);
    excludedBySection.set(e.section_id, arr);
  }

  // Group everything by participant (dancer).
  type Acc = {
    name: string;
    earliest: string | null;
    sessions: RegistrationSummarySession[];
    purchases: string[];
  };
  const byDancer = new Map<string, Acc>();

  const ensure = (dancerId: string, dancerRel: DancerRel | DancerRel[] | null): Acc => {
    let acc = byDancer.get(dancerId);
    if (!acc) {
      const d = firstOf(dancerRel);
      const name = `${d?.first_name ?? ""} ${d?.last_name ?? ""}`.trim() || "Participant";
      acc = { name, earliest: null, sessions: [], purchases: [] };
      byDancer.set(dancerId, acc);
    }
    return acc;
  };

  const noteDate = (acc: Acc, created: string | null) => {
    if (created && (!acc.earliest || created < acc.earliest)) acc.earliest = created;
  };

  // Drop-in / per-day meetings
  for (const row of meetingRows ?? []) {
    const r = row as {
      dancer_id: string;
      meeting_id: string | null;
      total_amount: number | null;
      created_at: string | null;
      dancers: DancerRel | DancerRel[] | null;
      class_meetings: MeetingRel | MeetingRel[] | null;
    };
    const acc = ensure(r.dancer_id, r.dancers);
    noteDate(acc, r.created_at);
    const m = firstOf(r.class_meetings);
    const datePart = m?.schedule_date
      ? fmtDate(m.schedule_date)
      : m?.day_of_week
        ? `${m.day_of_week.charAt(0).toUpperCase()}${m.day_of_week.slice(1)}s`
        : null;
    const schedule = [datePart, fmtTimeRange(m?.start_time, m?.end_time)]
      .filter(Boolean)
      .join(" · ");
    acc.sessions.push({
      name: className(firstOf(m?.classes ?? null)),
      schedule: schedule || undefined,
      location: m?.location?.trim() || undefined,
      locationAddress: m?.location_address?.trim() || undefined,
      classroom: m?.classroom_name?.trim() || undefined,
      instructor: m?.instructor_name?.trim() || undefined,
      group: (r.meeting_id && groupByMeeting.get(r.meeting_id)) || undefined,
      excludedDates: (r.meeting_id && excludedByMeeting.get(r.meeting_id)) || undefined,
      amount: money(r.total_amount),
    });
  }

  // Full-term sections (standard / tiered)
  for (const row of sectionRows ?? []) {
    const r = row as {
      dancer_id: string;
      section_id: string | null;
      price_snapshot: number | null;
      created_at: string | null;
      dancers: DancerRel | DancerRel[] | null;
      class_sections: SectionRel | SectionRel[] | null;
    };
    const acc = ensure(r.dancer_id, r.dancers);
    noteDate(acc, r.created_at);
    const s = firstOf(r.class_sections);
    const days = (s?.days_of_week ?? [])
      .map((d: string) => DAY_LABEL[d] ?? d)
      .join("/");
    const schedule = [days || null, fmtTimeRange(s?.start_time, s?.end_time)]
      .filter(Boolean)
      .join(" · ");
    acc.sessions.push({
      name: className(firstOf(s?.classes ?? null)),
      schedule: schedule || undefined,
      location: s?.location?.trim() || undefined,
      locationAddress: s?.location_address?.trim() || undefined,
      classroom: s?.classroom_name?.trim() || undefined,
      instructor: s?.instructor_name?.trim() || undefined,
      excludedDates: (r.section_id && excludedBySection.get(r.section_id)) || undefined,
      amount: money(r.price_snapshot),
    });
  }

  // Add-on purchases (option line items), attributed to their dancer.
  for (const item of optionItems ?? []) {
    const it = item as { dancer_id: string | null; label: string | null; amount: number | null };
    if (!it.dancer_id || !byDancer.has(it.dancer_id)) continue;
    const formatted = money(it.amount);
    const label = it.label?.trim() || "Add-on";
    byDancer.get(it.dancer_id)!.purchases.push(formatted ? `${label} — ${formatted}` : label);
  }

  const participants: RegistrationSummaryParticipant[] = [...byDancer.values()].map((acc) => ({
    name: acc.name,
    registeredOn: fmtLongDate(acc.earliest),
    sessions: acc.sessions,
    purchases: acc.purchases.length ? acc.purchases : undefined,
  }));

  // Order-level money: amount paid = sum of paid installments, or grand_total
  // for pay-in-full (no installment rows). Balance = grand_total − paid.
  const grandTotal =
    (order as { grand_total: number | null } | null)?.grand_total ?? null;
  const paidFromInstallments = (installments ?? [])
    .filter((i) => (i as { status: string }).status === "paid")
    .reduce((sum, i) => sum + Number((i as { amount_due: number }).amount_due || 0), 0);
  const hasInstallments = (installments ?? []).length > 0;
  const amountPaidNum = hasInstallments
    ? paidFromInstallments
    : grandTotal !== null
      ? Number(grandTotal)
      : null;
  const balanceNum =
    grandTotal !== null && amountPaidNum !== null
      ? Math.max(0, Number(grandTotal) - amountPaidNum)
      : null;

  const summary: RegistrationSummary = {
    participants,
    amountPaid: money(amountPaidNum),
    seasonBalance: balanceNum !== null ? money(balanceNum) : undefined,
  };

  if (participants.length === 0 && !summary.amountPaid && !summary.seasonBalance) {
    return null;
  }
  return summary;
}

/**
 * Convenience used by the confirmation-email send path: fetch + render. Returns
 * "" on empty or error so it can be appended to the email body unconditionally
 * without risk of breaking the send.
 */
export async function buildRegistrationSummaryHtml(
  supabase: SupabaseClient,
  opts: FetchRegistrationSummaryOptions,
): Promise<string> {
  try {
    const summary = await fetchRegistrationSummary(supabase, opts);
    if (!summary) return "";
    return renderRegistrationSummaryHtml(summary);
  } catch (err) {
    console.error(
      `[registration-summary] failed to build summary for batch ${opts.batchId}:`,
      err,
    );
    return "";
  }
}

/**
 * Representative sample used by the admin email designer preview and the test
 * send, so admins see the shape of the non-editable block without a real order.
 */
export const SAMPLE_REGISTRATION_SUMMARY: RegistrationSummary = {
  participants: [
    {
      name: "Ava Martinez",
      registeredOn: "June 3, 2026",
      sessions: [
        {
          name: "Ballet I",
          schedule: "Mon/Wed · 4:00–5:00 PM",
          location: "Upper East Side Studio",
          locationAddress: "428 E 75th Street, New York, NY 10021",
          classroom: "Studio A",
          instructor: "Ms. Rivera",
          excludedDates: ["Jul 4, 2026"],
          amount: "$420.00",
        },
        {
          name: "Open Rehearsal (Drop-in)",
          schedule: "Jun 14, 2026 · 1:00–2:30 PM",
          location: "Washington Heights",
          instructor: "Mr. Chen",
          amount: "$35.00",
        },
      ],
      purchases: ["Recital T-shirt — $25.00"],
    },
  ],
  amountPaid: "$240.00",
  seasonBalance: "$240.00",
};
