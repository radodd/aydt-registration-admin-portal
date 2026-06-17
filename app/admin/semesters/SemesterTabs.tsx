"use client";

import { useState, useMemo } from "react";
import type { ReactNode } from "react";
import type {
  SemesterDraft,
  DraftClass,
  RegistrationFormElement,
  DraftTuitionRateBand,
  DraftSpecialProgramTuition,
} from "@/types";
import { wrapEmailLayout } from "@/utils/prepareEmailHtml";
import {
  ChevronDown,
  ChevronUp,
  Monitor,
  Smartphone,
  Users,
  Clock,
  Mail,
  CreditCard,
  Check,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type TabKey =
  | "details"
  | "classes"
  | "groups"
  | "payment"
  | "discounts"
  | "regform"
  | "email"
  | "waitlist";

const TABS: { key: TabKey; label: string }[] = [
  { key: "details",   label: "Details" },
  { key: "classes",   label: "Classes & Offerings" },
  { key: "groups",    label: "Class Groups" },
  { key: "payment",   label: "Payment" },
  { key: "discounts", label: "Discounts" },
  { key: "regform",   label: "Registration Form" },
  { key: "email",     label: "Confirmation Email" },
  { key: "waitlist",  label: "Waitlist" },
];

type SemesterTabsProps = {
  data: SemesterDraft;
  /** Optional slot rendered after the tab content area — used by ReviewStep for publish actions. */
  publishActions?: React.ReactNode;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtD(iso: string | undefined | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch {
    return iso;
  }
}

function toTitle(str: string | undefined | null) {
  if (!str) return "—";
  return str.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtMoney(n: number | undefined | null) {
  if (n == null) return "—";
  return `$${n.toFixed(2).replace(/\.00$/, "")}`;
}

const DAY_IDX: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

function countSessions(schedules: DraftClass["schedules"]): number {
  let total = 0;
  for (const cs of schedules ?? []) {
    if (!cs.startDate || !cs.endDate || cs.daysOfWeek.length === 0) {
      total += cs.daysOfWeek.length || 1;
      continue;
    }
    const targetDays = new Set(
      cs.daysOfWeek
        .map((d) => DAY_IDX[d.toLowerCase()])
        .filter((n): n is number => n !== undefined),
    );
    const excluded = new Set((cs.excludedDates ?? []).map((e) => e.date));
    const end = new Date(cs.endDate);
    const cur = new Date(cs.startDate);
    while (cur <= end) {
      if (targetDays.has(cur.getDay())) {
        const iso = cur.toISOString().slice(0, 10);
        if (!excluded.has(iso)) total++;
      }
      cur.setDate(cur.getDate() + 1);
    }
  }
  return total;
}

// ── Atom components ───────────────────────────────────────────────────────────

function SectionHd({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <span className="text-[10.5px] font-[800] uppercase tracking-[.09em] text-neutral-400">
        {title}
      </span>
    </div>
  );
}

function KVTable({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <div className="border border-neutral-200 rounded-lg overflow-hidden shadow-sm">
      {rows.map((row, i) => (
        <div
          key={i}
          className={`flex items-start ${i < rows.length - 1 ? "border-b border-neutral-100" : ""}`}
        >
          <div className="w-[110px] md:w-[180px] shrink-0 px-3 md:px-3.5 py-2.5 text-[12px] md:text-[12.5px] text-neutral-500 font-medium bg-neutral-50 border-r border-neutral-100">
            {row.label}
          </div>
          <div className="flex-1 px-3 md:px-3.5 py-2.5 text-[12.5px] md:text-[13px] font-semibold text-neutral-900 min-w-0">
            {row.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function Chip({
  children,
  variant = "neutral",
}: {
  children: ReactNode;
  variant?: "ok" | "warn" | "err" | "sage" | "mauve" | "lav" | "neutral" | "info";
}) {
  const cls: Record<string, string> = {
    ok:      "bg-mint/20 text-mint-text",
    warn:    "bg-mauve/20 text-mauve-text",
    err:     "bg-red-50 text-red-700",
    sage:    "bg-mint/20 text-mint-text",
    mauve:   "bg-mauve/20 text-mauve-text",
    lav:     "bg-primary-50 text-primary-600",
    neutral: "bg-neutral-100 text-neutral-600 border border-neutral-200",
    info:    "bg-indigo-50 text-indigo-700",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold whitespace-nowrap ${cls[variant]}`}
    >
      {children}
    </span>
  );
}

function EmptyMsg({ children }: { children: ReactNode }) {
  return (
    <div className="border border-neutral-200 rounded-lg px-4 py-5 text-sm text-neutral-400 italic">
      {children}
    </div>
  );
}

function TuitionBandsDrawer({ bands, showInstallments }: { bands: DraftTuitionRateBand[]; showInstallments: boolean }) {
  const [open, setOpen] = useState(false);
  const hasNotes = bands.some((b) => b.notes);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] font-[800] uppercase tracking-[.08em] text-neutral-400">
            Tuition Rate Bands
          </span>
          <span className="text-[11px] font-semibold text-neutral-500 bg-neutral-200 rounded-full px-2 py-0.5">
            {bands.length}
          </span>
        </div>
        {open ? <ChevronUp size={14} className="text-neutral-400" /> : <ChevronDown size={14} className="text-neutral-400" />}
      </button>
      {open && (
        <div className="mt-2 border border-neutral-200 rounded-lg overflow-x-auto shadow-sm">
          <table className="w-full border-collapse" style={{ minWidth: "480px" }}>
            <thead>
              <tr style={{ background: "var(--admin-sidebar-active)" }}>
                {["Division", "Classes/wk", "Base tuition", "Discount", "Semester total",
                  ...(showInstallments ? ["Installment"] : []),
                  ...(hasNotes ? ["Notes"] : []),
                ].map((h, i) => (
                  <th
                    key={h}
                    className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-[.07em] text-white"
                    style={{ textAlign: i === 0 ? "left" : "right" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bands.map((b, i) => (
                <tr key={b._clientKey} className={`border-t border-neutral-100 ${i % 2 === 1 ? "bg-neutral-50" : "bg-white"}`}>
                  <td className="px-3 py-2.5 text-left">
                    <Chip variant="neutral">{toTitle(b.division)}</Chip>
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm font-medium text-neutral-700">{b.weekly_class_count}</td>
                  <td className="px-3 py-2.5 text-right text-sm text-neutral-600">{fmtMoney(b.base_tuition)}</td>
                  <td className="px-3 py-2.5 text-right text-sm text-neutral-500">
                    {b.progressive_discount_percent > 0 ? `${b.progressive_discount_percent}%` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm font-bold text-neutral-900">{fmtMoney(b.semester_total)}</td>
                  {showInstallments && (
                    <td className="px-3 py-2.5 text-right text-sm text-neutral-700">{fmtMoney(b.autopay_installment_amount)}</td>
                  )}
                  {hasNotes && (
                    <td className="px-3 py-2.5 text-sm text-neutral-400 italic">{b.notes ?? "—"}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SpecialProgramsDrawer({ programs, showInstallments }: { programs: DraftSpecialProgramTuition[]; showInstallments: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] font-[800] uppercase tracking-[.08em] text-neutral-400">
            Special Program Tuition
          </span>
          <span className="text-[11px] font-semibold text-neutral-500 bg-neutral-200 rounded-full px-2 py-0.5">
            {programs.length}
          </span>
        </div>
        {open ? <ChevronUp size={14} className="text-neutral-400" /> : <ChevronDown size={14} className="text-neutral-400" />}
      </button>
      {open && (
        <div className="mt-2 border border-neutral-200 rounded-lg overflow-x-auto shadow-sm">
          <table className="w-full border-collapse" style={{ minWidth: "360px" }}>
            <thead>
              <tr style={{ background: "var(--admin-sidebar-active)" }}>
                {["Program", "Semester total",
                  ...(showInstallments ? ["Installment"] : []),
                  "Reg. fee",
                ].map((h, i) => (
                  <th
                    key={h}
                    className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-[.07em] text-white"
                    style={{ textAlign: i === 0 ? "left" : "right" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {programs.map((p, i) => (
                <tr key={p._clientKey} className={`border-t border-neutral-100 ${i % 2 === 1 ? "bg-neutral-50" : "bg-white"}`}>
                  <td className="px-3 py-2.5 text-sm font-medium text-neutral-800">{p.programLabel}</td>
                  <td className="px-3 py-2.5 text-right text-sm font-bold text-neutral-900">{fmtMoney(p.semesterTotal)}</td>
                  {showInstallments && (
                    <td className="px-3 py-2.5 text-right text-sm text-neutral-700">
                      {p.autoPayInstallmentAmount != null ? fmtMoney(p.autoPayInstallmentAmount) : "—"}
                    </td>
                  )}
                  <td className="px-3 py-2.5 text-right text-sm text-neutral-500">
                    {p.registrationFeeOverride == null
                      ? <span className="italic text-neutral-400">Global</span>
                      : p.registrationFeeOverride === 0
                        ? <Chip variant="neutral">Exempt</Chip>
                        : fmtMoney(p.registrationFeeOverride)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SemesterTabs({ data, publishActions }: SemesterTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("details");

  const classes      = data.sessions?.classes ?? [];
  const groups       = data.sessionGroups?.groups ?? [];
  const payment      = data.paymentPlan;
  const feeConfig    = data.feeConfig;
  const coupons      = data.coupons ?? [];
  const formElements = data.registrationForm?.elements ?? [];
  const email        = data.confirmationEmail;
  const waitlist     = data.waitlist;
  const tuitionBands   = data.tuitionRateBands ?? [];
  const specialPrograms = data.specialProgramTuition ?? [];

  const allSchedules = classes.flatMap((c) => c.schedules ?? []);

  const regCloseAt = allSchedules
    .filter((s) => s.registrationCloseAt)
    .map((s) => s.registrationCloseAt!)
    .sort()
    .slice(-1)[0];

  const scheduleMap = useMemo(() => {
    const m = new Map<string, string>();
    classes.forEach((cls) => {
      (cls.schedules ?? []).forEach((cs) => {
        if (cs.id) {
          const days = cs.daysOfWeek
            .map((d) => d.charAt(0).toUpperCase() + d.slice(1))
            .join(", ");
          m.set(cs.id, `${cls.name} — ${days}`);
        }
      });
    });
    return m;
  }, [classes]);

  function renderPanel() {
    switch (activeTab) {

      // ───────────────────────────────────────────────────────────── DETAILS
      case "details":
        return (
          <div className="space-y-6">
            <div>
              <SectionHd title="Semester Info" />
              <KVTable rows={[
                {
                  label: "Semester name",
                  value: data.details?.name
                    ?? <span className="italic text-neutral-400 font-normal">Not set</span>,
                },
                {
                  label: "Attendance tracking",
                  value: <Chip variant={data.details?.trackingMode ? "ok" : "neutral"}>
                    {data.details?.trackingMode ? "Enabled" : "Disabled"}
                  </Chip>,
                },
                {
                  label: "Capacity warning",
                  value: data.details?.capacityWarningThreshold != null
                    ? `${data.details.capacityWarningThreshold}% remaining spots`
                    : <span className="italic text-neutral-400 font-normal">Not set</span>,
                },
              ]} />
            </div>
          </div>
        );

      // ───────────────────────────────────────────────────────────── CLASSES
      case "classes": {
        const totalSessions = classes.reduce(
          (sum, c) => sum + countSessions(c.schedules ?? []), 0,
        );
        const zeroScheduleClasses = classes.filter((c) => (c.schedules ?? []).length === 0);
        return (
          <div className="space-y-4">
            <div>
              <SectionHd
                title={`${classes.length} Class${classes.length !== 1 ? "es" : ""} · ${totalSessions} Total Sessions`}
              />
              {classes.length === 0 ? (
                <EmptyMsg>No classes added yet.</EmptyMsg>
              ) : (
                <div className="border border-neutral-200 rounded-lg overflow-hidden shadow-sm">
                  {/* Mobile: card rows — Discipline/Division shown as sub-text */}
                  <div className="md:hidden divide-y divide-neutral-100">
                    {classes.map((cls, i) => {
                      const sc = countSessions(cls.schedules ?? []);
                      const visBadge =
                        cls.visibility === "public"      ? <Chip variant="sage">Public</Chip> :
                        cls.visibility === "invite_only" ? <Chip variant="mauve">Invite Only</Chip> :
                        cls.visibility === "hidden"      ? <Chip variant="neutral">Hidden</Chip> :
                        <Chip variant="neutral">—</Chip>;
                      return (
                        <div
                          key={cls.id ?? i}
                          className={`flex items-center gap-3 px-4 py-3 ${i % 2 === 1 ? "bg-neutral-50" : "bg-white"}`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-bold text-neutral-900 truncate">{cls.name}</p>
                            <p className="text-[11.5px] text-neutral-500 mt-0.5 truncate">
                              {[
                                toTitle(cls.discipline),
                                (cls.isTiered || (cls.schedules ?? []).some((s) => s.isDropIn === true))
                                  ? null
                                  : toTitle(cls.division),
                              ].filter((v) => v && v !== "—").join(" · ")}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {visBadge}
                            <span
                              className="text-[13px] font-bold tabular-nums"
                              style={{ color: sc === 0 ? "#dc2626" : "var(--admin-text)" }}
                            >
                              {sc === 0 ? "0 ⚠" : sc}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop: full table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr style={{ background: "var(--admin-sidebar-active)" }}>
                          {["Class", "Discipline", "Division", "Visibility", "Sessions"].map((h, i) => (
                            <th
                              key={h}
                              className="px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-[.07em] text-white text-left"
                              style={i === 4 ? { textAlign: "right" } : {}}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {classes.map((cls, i) => {
                          const sc = countSessions(cls.schedules ?? []);
                          const visBadge =
                            cls.visibility === "public"      ? <Chip variant="sage">Public</Chip> :
                            cls.visibility === "invite_only" ? <Chip variant="mauve">Invite Only</Chip> :
                            cls.visibility === "hidden"      ? <Chip variant="neutral">Hidden</Chip> :
                            <Chip variant="neutral">—</Chip>;
                          return (
                            <tr
                              key={cls.id ?? i}
                              className={`border-t border-neutral-100 ${i % 2 === 1 ? "bg-neutral-50" : "bg-white"}`}
                            >
                              <td className="px-3.5 py-2.5 text-sm font-bold text-neutral-900">{cls.name}</td>
                              <td className="px-3.5 py-2.5 text-sm text-neutral-600">{toTitle(cls.discipline)}</td>
                              <td className="px-3.5 py-2.5 text-sm text-neutral-600">{
                                (cls.isTiered || (cls.schedules ?? []).some((s) => s.isDropIn === true))
                                  ? "—"
                                  : toTitle(cls.division)
                              }</td>
                              <td className="px-3.5 py-2.5">{visBadge}</td>
                              <td
                                className="px-3.5 py-2.5 text-right text-sm font-bold"
                                style={sc === 0 ? { color: "#dc2626" } : { color: "var(--admin-text)" }}
                              >
                                {sc === 0 ? "0 ⚠" : sc}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {zeroScheduleClasses.length > 0 && (
              <div className="flex gap-2.5 px-3.5 py-3 rounded-lg border border-mauve bg-mauve/10">
                <p className="text-[12.5px] text-neutral-700 leading-relaxed">
                  <strong>{zeroScheduleClasses.length} class{zeroScheduleClasses.length !== 1 ? "es" : ""} have 0 sessions.</strong>{" "}
                  {zeroScheduleClasses.map((c) => c.name).join(" and ")}{" "}
                  {zeroScheduleClasses.length === 1 ? "has" : "have"} no sessions configured.
                </p>
              </div>
            )}
          </div>
        );
      }

      // ───────────────────────────────────────────────────────────── GROUPS
      case "groups":
        return (
          <div>
            <SectionHd
              title={`${groups.length} Group${groups.length !== 1 ? "s" : ""}`}
            />
            {groups.length === 0 ? (
              <EmptyMsg>No class groups configured.</EmptyMsg>
            ) : (
              <div className="border border-neutral-200 rounded-lg overflow-hidden shadow-sm">
                {/* Mobile: card rows — classes shown as sub-text */}
                <div className="md:hidden divide-y divide-neutral-100">
                  {groups.map((g, i) => {
                    const labels = g.sessionIds
                      .map((sid) => scheduleMap.get(sid))
                      .filter(Boolean) as string[];
                    return (
                      <div
                        key={g.id}
                        className={`flex items-center gap-3 px-4 py-3 ${i % 2 === 1 ? "bg-neutral-50" : "bg-white"}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-bold text-neutral-900">{g.name}</p>
                          <p className="text-[11.5px] text-neutral-500 mt-0.5 truncate">
                            {labels.length > 0 ? labels.join(", ") : "No classes assigned"}
                          </p>
                        </div>
                        <span className="shrink-0 text-[13px] font-bold text-neutral-900 tabular-nums">
                          {g.sessionIds.length}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop: full table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr style={{ background: "var(--admin-sidebar-active)" }}>
                        {["Group", "Classes included", "Sessions"].map((h, i) => (
                          <th
                            key={h}
                            className="px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-[.07em] text-white text-left"
                            style={i === 2 ? { textAlign: "right" } : {}}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map((g, i) => {
                        const labels = g.sessionIds
                          .map((sid) => scheduleMap.get(sid))
                          .filter(Boolean) as string[];
                        return (
                          <tr
                            key={g.id}
                            className={`border-t border-neutral-100 ${i % 2 === 1 ? "bg-neutral-50" : "bg-white"}`}
                          >
                            <td className="px-3.5 py-2.5 text-sm font-bold text-neutral-900">{g.name}</td>
                            <td className="px-3.5 py-2.5 text-sm text-neutral-600">
                              {labels.length > 0
                                ? labels.join(", ")
                                : <span className="italic text-neutral-400">None assigned</span>}
                            </td>
                            <td className="px-3.5 py-2.5 text-right text-sm font-bold text-neutral-900">
                              {g.sessionIds.length}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );

      // ───────────────────────────────────────────────────────────── PAYMENT
      case "payment": {
        const isInstallments = payment?.type === "installments";
        const isDepositFlat  = payment?.type === "deposit_flat";
        const isDepositPct   = payment?.type === "deposit_percent";
        const isDeposit      = isDepositFlat || isDepositPct;
        return (
          <div className="space-y-6">

            {/* Plan */}
            <div>
              <SectionHd title="Payment Plan" />
              <KVTable rows={[
                {
                  label: "Plan type",
                  value: payment ? (
                    <Chip variant="lav">
                      {isDepositFlat    ? "Deposit (flat)" :
                       isDepositPct     ? "Deposit (percent)" :
                       isInstallments   ? "Auto-pay installments" :
                                         "Pay in full"}
                    </Chip>
                  ) : <span className="italic text-neutral-400 font-normal">Not set</span>,
                },
                ...(isDepositFlat && payment?.depositAmount != null ? [{
                  label: "Deposit amount",
                  value: fmtMoney(payment.depositAmount),
                }] : []),
                ...(isDepositPct && payment?.depositPercent != null ? [{
                  label: "Deposit percent",
                  value: `${payment.depositPercent}%`,
                }] : []),
                ...(isDeposit && payment?.dueDate ? [{
                  label: "Deposit due date",
                  value: fmtD(payment.dueDate),
                }] : []),
                ...(isInstallments && payment?.installmentCount ? [{
                  label: "Installment count",
                  value: `${payment.installmentCount} payments`,
                }] : []),
                ...(isInstallments && feeConfig?.auto_pay_admin_fee_monthly != null ? [{
                  label: "Auto-pay admin fee",
                  value: `${fmtMoney(feeConfig.auto_pay_admin_fee_monthly)} / month`,
                }] : []),
              ]} />
            </div>

            {/* Fee config */}
            {feeConfig && (
              <div>
                <SectionHd title="Fee Configuration" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                  {[
                    { label: "Registration fee",     val: feeConfig.registration_fee_per_child,      sub: "Per child",      money: true },
                    { label: "Family discount",      val: feeConfig.family_discount_amount,           sub: "2+ dancers",     money: true },
                    { label: "Junior costume",       val: feeConfig.junior_costume_fee_per_class,     sub: "Per class",      money: true },
                    { label: "Senior costume",       val: feeConfig.senior_costume_fee_per_class,     sub: "Per class",      money: true },
                    { label: "Senior video",         val: feeConfig.senior_video_fee_per_registrant,  sub: "Per registrant", money: true },
                    { label: "Auto-pay fee",         val: feeConfig.auto_pay_admin_fee_monthly,       sub: "Per month",      money: true },
                    { label: "Auto-pay installments",val: feeConfig.auto_pay_installment_count,       sub: "# payments",     money: false },
                  ].map((card) => (
                    <div key={card.label} className="border border-neutral-200 rounded-lg px-4 py-3.5 bg-neutral-50 shadow-sm">
                      <div className="text-[10.5px] font-[800] uppercase tracking-[.08em] text-neutral-400 mb-1.5">
                        {card.label}
                      </div>
                      <div className="text-[22px] font-[800] text-neutral-900 leading-none tracking-tight">
                        {card.money ? fmtMoney(card.val as number) : (card.val ?? "—")}
                      </div>
                      <div className="text-[11.5px] text-neutral-500 mt-1">{card.sub}</div>
                    </div>
                  ))}
                </div>
                {(feeConfig.costume_fee_exempt_keys ?? []).length > 0 && (
                  <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-medium text-neutral-400">Costume exempt:</span>
                    {feeConfig.costume_fee_exempt_keys!.map((k) => (
                      <Chip key={k} variant="neutral">{toTitle(k)}</Chip>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tuition rate bands — collapsible */}
            {tuitionBands.length > 0 && (
              <TuitionBandsDrawer bands={tuitionBands} showInstallments={isInstallments} />
            )}

            {/* Special programs — collapsible */}
            {specialPrograms.length > 0 && (
              <SpecialProgramsDrawer programs={specialPrograms} showInstallments={isInstallments} />
            )}

            {/* Sample installment schedule */}
            {(payment?.installments ?? []).length > 0 && (
              <div>
                <SectionHd title="Sample Installment Schedule" />
                <div className="border border-neutral-200 rounded-lg overflow-hidden shadow-sm">
                  <div
                    className="flex items-center gap-3 px-3.5 py-2"
                    style={{ background: "var(--admin-sidebar-active)" }}
                  >
                    <span className="w-8" />
                    <span className="flex-1 text-[11px] font-bold uppercase tracking-[.07em] text-white/80">
                      Due date
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-[.07em] text-white/80">
                      Amount
                    </span>
                  </div>
                  {payment!.installments!.map((inst, i) => (
                    <div
                      key={inst.number}
                      className={`flex items-center gap-3 px-3.5 py-2.5 ${
                        i < payment!.installments!.length - 1 ? "border-b border-neutral-100" : ""
                      } ${i % 2 === 1 ? "bg-neutral-50" : "bg-white"}`}
                    >
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 border-[1.5px]"
                        style={{
                          background: "#f5ecea",
                          borderColor: "#d4938d",
                          color: "var(--admin-sidebar-active)",
                        }}
                      >
                        {inst.number}
                      </div>
                      <span className="flex-1 text-sm font-medium text-neutral-700">
                        {inst.dueDate === "registration" ? "Due at registration" : fmtD(inst.dueDate)}
                      </span>
                      <span className="text-[13.5px] font-bold text-neutral-900">
                        {fmtMoney(inst.amount)}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[11.5px] text-neutral-400 mt-1.5">
                  Sample based on one registration. Actual amounts vary by tuition band.
                </p>
              </div>
            )}
          </div>
        );
      }

      // ─────────────────────────────────────────────────────────── DISCOUNTS
      case "discounts":
        return (
          <div>
            <SectionHd
              title={`${coupons.length} Coupon${coupons.length !== 1 ? "s" : ""}`}
            />
            {coupons.length === 0 ? (
              <EmptyMsg>No coupons configured for this semester.</EmptyMsg>
            ) : (
              <div className="border border-neutral-200 rounded-lg overflow-hidden shadow-sm">
                {/* Mobile: card rows — Code/Max uses/Stackable as sub-text */}
                <div className="md:hidden divide-y divide-neutral-100">
                  {coupons.map((c, i) => (
                    <div
                      key={c._clientKey}
                      className={`flex items-center gap-3 px-4 py-3 ${i % 2 === 1 ? "bg-neutral-50" : "bg-white"}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold text-neutral-900">{c.name}</p>
                        <p className="text-[11.5px] text-neutral-500 mt-0.5">
                          {c.code
                            ? <span className="font-mono bg-neutral-100 px-1.5 rounded text-neutral-700">{c.code}</span>
                            : <span className="italic">Auto-apply</span>}
                          {" · "}
                          {c.maxTotalUses ? `Max ${c.maxTotalUses}` : "Unlimited"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[12.5px] font-bold" style={{ color: "var(--admin-sidebar-active)" }}>
                          {c.valueType === "percent" ? `${c.value}%` : fmtMoney(c.value)}
                        </span>
                        <Chip variant={c.isActive ? "ok" : "neutral"}>
                          {c.isActive ? "Active" : "Off"}
                        </Chip>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop: full table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr style={{ background: "var(--admin-sidebar-active)" }}>
                        {["Name", "Code", "Value", "Max uses", "Stackable", "Status"].map((h) => (
                          <th
                            key={h}
                            className="px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-[.07em] text-white text-left"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {coupons.map((c, i) => (
                        <tr
                          key={c._clientKey}
                          className={`border-t border-neutral-100 ${i % 2 === 1 ? "bg-neutral-50" : "bg-white"}`}
                        >
                          <td className="px-3.5 py-2.5 text-sm font-bold text-neutral-900">{c.name}</td>
                          <td className="px-3.5 py-2.5">
                            {c.code
                              ? <span className="font-mono text-xs bg-neutral-100 px-2 py-0.5 rounded font-bold text-neutral-700">{c.code}</span>
                              : <span className="text-xs text-neutral-400 italic">Auto-apply</span>}
                          </td>
                          <td className="px-3.5 py-2.5 text-sm font-bold" style={{ color: "var(--admin-sidebar-active)" }}>
                            {c.valueType === "percent" ? `${c.value}% off` : `${fmtMoney(c.value)} flat`}
                          </td>
                          <td className="px-3.5 py-2.5 text-sm text-neutral-600">
                            {c.maxTotalUses ?? "Unlimited"}
                          </td>
                          <td className="px-3.5 py-2.5">
                            <Chip variant={c.stackable ? "ok" : "neutral"}>
                              {c.stackable ? "Yes" : "No"}
                            </Chip>
                          </td>
                          <td className="px-3.5 py-2.5">
                            <Chip variant={c.isActive ? "ok" : "neutral"}>
                              {c.isActive ? "Active" : "Inactive"}
                            </Chip>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );

      // ────────────────────────────────────────────────── REGISTRATION FORM
      case "regform": {
        type RSection = { header: RegistrationFormElement; fields: RegistrationFormElement[] };
        const rSections: RSection[] = [];
        let rCur: RSection | null = null;
        for (const el of formElements) {
          if (el.type === "subheader") {
            rCur = { header: el, fields: [] };
            rSections.push(rCur);
          } else if (rCur) {
            rCur.fields.push(el);
          }
        }

        const fieldCount = formElements.filter((e) => e.type === "question").length;

        return (
          <div>
            <SectionHd
              title={`${fieldCount} Field${fieldCount !== 1 ? "s" : ""} · ${rSections.length} Section${rSections.length !== 1 ? "s" : ""}`}
            />
            {formElements.length === 0 ? (
              <EmptyMsg>No registration form configured.</EmptyMsg>
            ) : (
              <div className="space-y-4">
                {rSections.map((section) => (
                  <div
                    key={section.header.id}
                    className="rounded-xl border border-neutral-200 bg-white overflow-hidden"
                  >
                    <div className="flex items-center gap-2 px-3 py-3 border-b-2 border-primary-600">
                      <span className="flex-1 text-sm font-bold uppercase tracking-wide text-neutral-800 truncate">
                        {section.header.label}
                      </span>
                      <span className="shrink-0 text-xs px-2 py-0.5 rounded-full border border-neutral-200 text-neutral-500 font-medium">
                        {section.fields.length} {section.fields.length === 1 ? "field" : "fields"}
                      </span>
                    </div>

                    {section.fields.map((el) => {
                      const typeLabel =
                        el.type === "text_block" ? "text block" :
                        el.inputType === "short_answer"  ? "short answer"  :
                        el.inputType === "long_answer"   ? "long answer"   :
                        el.inputType === "phone_number"  ? "phone number"  :
                        el.inputType ?? el.type;

                      return (
                        <div
                          key={el.id}
                          className="flex items-center px-4 py-3 border-b border-neutral-100 last:border-b-0 bg-white"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {el.type === "question" && el.required ? (
                                <span className="text-primary-600 text-[10px] leading-none shrink-0">●</span>
                              ) : (
                                <span className="w-3 shrink-0" />
                              )}
                              <span className={`text-sm font-medium text-neutral-900 truncate ${el.type === "text_block" ? "italic" : ""}`}>
                                {el.label}
                              </span>
                            </div>
                            <div className="text-xs text-neutral-400 mt-0.5 pl-[18px]">{typeLabel}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }

      // ─────────────────────────────────────────────── CONFIRMATION EMAIL
      case "email":
        if (!email) return <EmptyMsg>No confirmation email configured.</EmptyMsg>;
        return (
          <div className="space-y-5">
            <div>
              <SectionHd title="Email Preview" />
              <KVTable rows={[
                {
                  label: "From",
                  value: `${email.fromName || "AYDT Studio"} <${email.fromEmail || "hello@aydt.org"}>`,
                },
                { label: "Subject",   value: email.subject },
                { label: "Signature", value: <Chip variant="ok">Included</Chip> },
              ]} />
            </div>

            {email.htmlBody && (
              <div className="space-y-4">
                <span className="text-[10.5px] font-[800] uppercase tracking-[.08em] text-neutral-400">
                  Preview
                </span>

                <div className="flex flex-col gap-5 md:flex-row md:items-start">
                  {/* Desktop preview */}
                  <div className="w-full md:w-[345px] md:shrink-0">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Monitor size={11} className="text-neutral-400" />
                      <span className="text-[11px] font-medium text-neutral-400">Desktop</span>
                    </div>
                    <div className="border border-neutral-200 rounded-lg overflow-hidden shadow-md">
                      <div className="flex items-center gap-1.5 px-3 py-2 bg-neutral-50 border-b border-neutral-200">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                        <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                        <div className="flex-1 mx-2 bg-white border border-neutral-200 rounded px-2 py-0.5 text-[11px] text-neutral-400">
                          mail.google.com
                        </div>
                      </div>
                      <div className="px-4 py-2.5 bg-neutral-50 border-b border-neutral-200">
                        <p className="text-[12.5px] font-bold text-neutral-900 truncate">{email.subject}</p>
                        <p className="text-[11.5px] text-neutral-500 mt-0.5">
                          {email.fromName || "AYDT Studio"} &lt;{email.fromEmail || "hello@aydt.org"}&gt;
                        </p>
                      </div>
                      <div style={{ height: 300, overflow: "hidden", position: "relative" }}>
                        <iframe
                          srcDoc={wrapEmailLayout(email.htmlBody)}
                          title="Email desktop preview"
                          sandbox="allow-same-origin"
                          style={{
                            position: "absolute", top: 0, left: 0,
                            width: 600, height: 560, border: "none",
                            transform: "scale(0.575)", transformOrigin: "top left",
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Mobile */}
                  <div className="shrink-0">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Smartphone size={11} className="text-neutral-400" />
                      <span className="text-[11px] font-medium text-neutral-400">Mobile</span>
                    </div>
                    <div
                      className="relative"
                      style={{
                        width: 240, height: 490,
                        background: "#1a1a1a",
                        borderRadius: 36,
                        padding: "10px 7px",
                        boxShadow: "0 20px 50px rgba(0,0,0,0.3), inset 0 0 0 1.5px #3a3a3a",
                      }}
                    >
                      <div
                        className="absolute left-1/2 -translate-x-1/2"
                        style={{ top: 16, width: 60, height: 8, background: "#000", borderRadius: 4, zIndex: 2 }}
                      />
                      <div className="w-full h-full overflow-hidden" style={{ borderRadius: 28, background: "#fff" }}>
                        <div
                          className="flex items-center gap-1.5 px-2 py-1.5 border-b border-neutral-100"
                          style={{ background: "#f5f5f5" }}
                        >
                          <div className="flex gap-0.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                            <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                          </div>
                          <span className="flex-1 text-center text-[7px] font-medium text-neutral-500 truncate">
                            Mail — AYDT Studio
                          </span>
                        </div>
                        <div style={{ width: 226, height: 452, overflow: "hidden", position: "relative" }}>
                          <iframe
                            srcDoc={wrapEmailLayout(email.htmlBody)}
                            title="Email mobile preview"
                            sandbox="allow-same-origin"
                            style={{
                              position: "absolute", top: 0, left: 0,
                              width: 390, height: 780, border: "none",
                              transform: "scale(0.58)", transformOrigin: "top left",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2.5 px-3.5 py-2.5 mt-3 rounded-lg border border-indigo-100 bg-indigo-50">
                  <Mail size={13} className="text-indigo-400 shrink-0 mt-0.5" />
                  <p className="text-[12px] text-neutral-600 leading-relaxed">
                    Tokens like{" "}
                    <span className="bg-indigo-100 text-indigo-700 rounded px-1 py-0.5 font-mono text-[11px] font-bold">
                      {`{{first_name}}`}
                    </span>{" "}
                    will be replaced with real values at send time.
                  </p>
                </div>
              </div>
            )}
          </div>
        );

      // ──────────────────────────────────────────────────────────── WAITLIST
      case "waitlist": {
        const wl = waitlist;
        return (
          <div className="space-y-6">
            <div>
              <SectionHd title="Status" />
              <div className="flex items-center gap-3.5 p-4 border border-neutral-200 rounded-lg bg-white shadow-sm">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    wl?.enabled ? "bg-mint/20" : "bg-neutral-100"
                  }`}
                >
                  <Users size={18} className={wl?.enabled ? "text-mint-text" : "text-neutral-400"} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-neutral-900">
                    {wl?.enabled
                      ? "Waitlist enabled for this semester"
                      : "Waitlist is disabled"}
                  </p>
                  <p className="text-[12.5px] text-neutral-500 mt-0.5">
                    {wl?.enabled
                      ? "Families can join session waitlists when capacity is reached. Automated invitations are active."
                      : "Enable in the Waitlist step to allow families to queue for full sessions."}
                  </p>
                </div>
                <Chip variant={wl?.enabled ? "ok" : "neutral"}>
                  {wl?.enabled ? "Enabled" : "Disabled"}
                </Chip>
              </div>
            </div>

            {wl?.enabled && (
              <>
                <div>
                  <SectionHd title="Configuration" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
                    {[
                      { label: "Invite expiry",       val: `${wl.inviteExpiryHours} hrs`, sub: "After invitation sent" },
                      { label: "Spot hold",            val: "30 min",                     sub: "After acceptance" },
                      { label: "Stop accepting",       val: `${wl.stopDaysBeforeClose} days`, sub: "Before registration closes" },
                      { label: "Processing interval",  val: "1 min",                     sub: "Cron check interval" },
                    ].map((stat) => (
                      <div key={stat.label} className="border border-neutral-200 rounded-lg px-4 py-3 bg-neutral-50">
                        <div className="text-[10.5px] font-[800] uppercase tracking-[.08em] text-neutral-400 mb-1.5">
                          {stat.label}
                        </div>
                        <div className="text-xl font-[800] text-neutral-900 leading-none">{stat.val}</div>
                        <div className="text-xs text-neutral-500 mt-1">{stat.sub}</div>
                      </div>
                    ))}
                  </div>
                  <KVTable rows={[
                    { label: "Queue order",            value: "First in, first invited" },
                    { label: "Concurrent invitations", value: "1 per session at a time" },
                    ...(wl.stopDaysBeforeClose && regCloseAt ? [{
                      label: "Stop date",
                      value: fmtD(
                        new Date(
                          new Date(regCloseAt).getTime() - wl.stopDaysBeforeClose * 24 * 3600 * 1000,
                        ).toISOString(),
                      ),
                    }] : []),
                  ]} />
                </div>

                <div>
                  <SectionHd title="How Automation Works" />
                  <div className="border border-neutral-200 rounded-lg px-5 py-5 bg-white">
                    <div className="relative pl-7 space-y-5">
                      <div className="absolute left-[10px] top-2 bottom-2 w-0.5 bg-neutral-100" />
                      {[
                        {
                          icon: <Users size={10} />,
                          title: "Family joins waitlist",
                          desc: 'When a session reaches capacity, a "Join Waitlist" option appears. Families are assigned a queue position by timestamp.',
                        },
                        {
                          icon: <Clock size={10} />,
                          title: "System checks every minute",
                          desc: "A pg_cron job runs every 60 seconds, checking for open capacity with no pending invitations and families waiting.",
                          tag: "pg_cron · process-waitlist()",
                        },
                        {
                          icon: <Mail size={10} />,
                          title: "Invitation email sent",
                          desc: `The next family in queue receives an invitation with a unique acceptance link. It expires after ${wl.inviteExpiryHours} hours.`,
                          tag: "Token link · /waitlist/accept/[token]",
                        },
                        {
                          icon: <CreditCard size={10} />,
                          title: "Family accepts & holds spot",
                          desc: "Clicking the link starts a 30-minute spot hold. Payment must be completed within this window to confirm enrollment.",
                          tag: "hold_expires_at = now + 30min",
                        },
                        {
                          icon: <Check size={10} />,
                          title: "Spot confirmed or released",
                          desc: "Payment completed → confirmed. Hold expired → spot released and the next family in queue is invited.",
                          ok: true,
                        },
                      ].map((step, i) => (
                        <div key={i} className="relative">
                          <div
                            className="absolute -left-7 top-0.5 w-[22px] h-[22px] rounded-full flex items-center justify-center border-2"
                            style={
                              step.ok
                                ? { background: "rgba(125,206,194,0.2)", borderColor: "#7DCEC2", color: "#0A5A50" }
                                : { background: "#f5ecea", borderColor: "#d4938d", color: "var(--admin-sidebar-active)" }
                            }
                          >
                            {step.icon}
                          </div>
                          <p className="text-[13.5px] font-bold text-neutral-900 mb-0.5">{step.title}</p>
                          <p className="text-[12.5px] text-neutral-500 leading-relaxed">{step.desc}</p>
                          {step.tag && (
                            <span
                              className="inline-block mt-1.5 text-[11.5px] font-bold rounded px-2 py-0.5"
                              style={{ background: "#f5ecea", color: "var(--admin-sidebar-active)" }}
                            >
                              {step.tag}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        );
      }
    }
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex overflow-x-auto border-b border-neutral-200 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`h-11 px-4 flex items-center gap-1.5 text-[12.5px] font-semibold whitespace-nowrap border-b-2 flex-shrink-0 transition-colors ${
                isActive ? "font-bold" : "border-transparent text-neutral-500 hover:text-neutral-700"
              }`}
              style={
                isActive
                  ? { borderBottomColor: "var(--admin-sidebar-active)", color: "var(--admin-sidebar-active)" }
                  : {}
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="p-4 md:p-6 min-h-[200px] overflow-x-auto">{renderPanel()}</div>

      {/* Optional publish / action slot (ReviewStep passes buttons here) */}
      {publishActions && <div className="px-6 pb-6">{publishActions}</div>}
    </div>
  );
}
