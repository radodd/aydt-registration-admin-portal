"use client";

import { useState, useMemo, useEffect } from "react";
import { InlineDatePicker } from "@/app/components/ui/InlineDatePicker";
import type { ReactNode } from "react";
import type {
  SemesterDraft,
  DraftClass,
  RegistrationFormElement,
  DraftTuitionRateBand,
  DraftSpecialProgramTuition,
  HydratedDiscount,
} from "@/types";
import { getDiscounts } from "@/queries/admin";
import { wrapEmailLayout } from "@/utils/prepareEmailHtml";
import {
  AlertTriangle,
  Check,
  Edit2,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Monitor,
  Smartphone,
  Mail,
  Globe,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type TabKey =
  | "details"
  | "classes"
  | "groups"
  | "payment"
  | "discounts"
  | "regform"
  | "email";

const TABS: { key: TabKey; label: string }[] = [
  { key: "details",   label: "Details" },
  { key: "classes",   label: "Classes & Offerings" },
  { key: "groups",    label: "Class Groups" },
  { key: "payment",   label: "Payment" },
  { key: "discounts", label: "Discounts" },
  { key: "regform",   label: "Registration Form" },
  { key: "email",     label: "Emails" },
];

type Props = {
  state: SemesterDraft;
  onBack: () => void;
  onPublishNow: () => void;
  onSaveDraft: () => void;
  onSchedule: (publishAt: string) => void;
  onGoToStep: (stepKey: string) => void;
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

function discountCatLabel(cat: string) {
  return cat === "multi_session"
    ? "Multi-session"
    : cat === "multi_person"
      ? "Multi-person"
      : toTitle(cat);
}

function discountChipCls(cat: string) {
  return cat === "multi_session"
    ? "bg-[rgba(125,206,194,0.20)] text-[#0A5A50]"
    : cat === "multi_person"
      ? "bg-[rgba(196,160,212,0.20)] text-[#5A2878]"
      : "bg-neutral-100 text-neutral-500";
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

/* Card-with-header — the prototype's `.rcard`: a clean header bar (uppercase
 * title + Edit link) divided from the body. Each review section is one Card,
 * giving the visual distinction between the tab nav and the content below. */
function Card({
  title,
  onEdit,
  children,
  noPad = false,
}: {
  title: string;
  onEdit?: () => void;
  children: ReactNode;
  noPad?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-100">
        <span className="text-[11px] font-[800] uppercase tracking-[.09em] text-neutral-400">
          {title}
        </span>
        {onEdit && (
          <button
            onClick={onEdit}
            className="flex items-center gap-1 text-[13px] font-bold px-2 py-1 rounded transition-colors hover:bg-red-50"
            style={{ color: "var(--admin-sidebar-active)" }}
          >
            <Edit2 size={11} />
            Edit
          </button>
        )}
      </div>
      <div className={noPad ? "" : "p-5"}>{children}</div>
    </div>
  );
}

/* Retained for the Registration Form panel, which is intentionally left
 * unchanged per the design request. */
function SectionHd({ title, onEdit }: { title: string; onEdit?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <span className="text-[10.5px] font-[800] uppercase tracking-[.09em] text-neutral-400">
        {title}
      </span>
      {onEdit && (
        <button
          onClick={onEdit}
          className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded transition-colors hover:bg-red-50"
          style={{ color: "var(--admin-sidebar-active)" }}
        >
          <Edit2 size={11} />
          Edit
        </button>
      )}
    </div>
  );
}

/* Minimalist borderless key/value rows (prototype `.kv`) — sits directly in a
 * Card body, no nested box. */
function KVTable({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <table className="w-full border-collapse">
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={i}
            className={i < rows.length - 1 ? "border-b border-neutral-100" : ""}
          >
            <td className="py-2.5 pr-4 align-top w-[200px] text-[13.5px] text-neutral-500">
              {row.label}
            </td>
            <td className="py-2.5 text-[13.5px] font-medium text-neutral-900">
              {row.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
    <div className="text-[13px] text-neutral-400 italic py-1.5">{children}</div>
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
        <div className="mt-2 border border-neutral-200 rounded-lg overflow-hidden shadow-sm">
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ background: "var(--admin-sidebar-active)" }}>
                {["Division", "Classes/wk", "Base tuition", "Discount", "Semester total",
                  ...(showInstallments ? ["Installment"] : []),
                  ...(hasNotes ? ["Notes"] : []),
                ].map((h, i) => (
                  <th
                    key={h}
                    className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-[.07em] text-white"
                    style={{ textAlign: i === 0 ? "left" : i === (hasNotes ? (showInstallments ? 6 : 5) : (showInstallments ? 5 : 4)) && hasNotes ? "left" : "right" }}
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
        <div className="mt-2 border border-neutral-200 rounded-lg overflow-hidden shadow-sm">
          <table className="w-full border-collapse">
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

export default function ReviewStep({
  state,
  onBack,
  onPublishNow,
  onSaveDraft,
  onSchedule,
  onGoToStep,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("details");
  const [scheduleDate, setScheduleDate] = useState("");

  const classes      = state.sessions?.classes ?? [];
  const groups       = state.sessionGroups?.groups ?? [];
  const payment      = state.paymentPlan;
  const feeConfig    = state.feeConfig;
  const coupons      = state.coupons ?? [];
  const formElements = state.registrationForm?.elements ?? [];
  const email        = state.confirmationEmail;
  const waitlist     = state.waitlist;

  // ── Linked discounts (read-only fetch; names not stored on the draft) ──────
  const [hydratedDiscounts, setHydratedDiscounts] = useState<HydratedDiscount[]>([]);
  useEffect(() => {
    let active = true;
    getDiscounts().then((d) => {
      if (active) setHydratedDiscounts(d ?? []);
    });
    return () => {
      active = false;
    };
  }, []);
  const appliedDiscounts = state.discounts?.appliedDiscounts ?? [];
  const linkedDiscounts = appliedDiscounts
    .map((a) => hydratedDiscounts.find((d) => d.id === a.discountId))
    .filter((d): d is HydratedDiscount => Boolean(d));

  // ── Tab validation status ──────────────────────────────────────────────────

  const tabStatus = useMemo<Record<TabKey, "ok" | "warn">>(() => {
    const classesOk = classes.length > 0 && classes.every((c) => (c.schedules ?? []).length > 0);
    return {
      details:   state.details?.name ? "ok" : "warn",
      classes:   classesOk ? "ok" : "warn",
      groups:    "ok",
      payment:   payment ? "ok" : "warn",
      discounts: "ok",
      regform:   formElements.length > 0 ? "ok" : "warn",
      email:     email?.subject && email?.htmlBody ? "ok" : "warn",
    };
  }, [state, classes, payment, formElements, email]);

  // ── Derived dates from schedules ───────────────────────────────────────────

  const allSchedules = classes.flatMap((c) => c.schedules ?? []);

  const regCloseAt = allSchedules
    .filter((s) => s.registrationCloseAt)
    .map((s) => s.registrationCloseAt!)
    .sort()
    .slice(-1)[0];

  // ── Schedule label map for groups ─────────────────────────────────────────

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

  // ── Email preview block (⚠️ DO NOT rebuild — reuses the existing desktop +
  //    mobile preview iframes; this rendering must not be overwritten) ────────
  function emailPreview(htmlBody: string, subject: string, fromName: string, fromEmail: string, token: string, idPrefix: string) {
    return (
      <div className="space-y-4 mt-4">
        <span className="text-[10.5px] font-[800] uppercase tracking-[.08em] text-neutral-400">
          Preview
        </span>
        <div className="grid grid-cols-2 gap-4 items-start">
          {/* Desktop */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Monitor size={11} className="text-neutral-400" />
              <span className="text-[11px] font-medium text-neutral-400">Desktop</span>
            </div>
            <div className="border border-neutral-200 rounded-lg overflow-hidden shadow-md" style={{ width: `${Math.round(600 * 0.575)}px` }}>
              <div className="flex items-center gap-1.5 px-3 py-2 bg-neutral-50 border-b border-neutral-200">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                <div className="flex-1 mx-2 bg-white border border-neutral-200 rounded px-2 py-0.5 text-[11px] text-neutral-400">
                  mail.google.com
                </div>
              </div>
              <div className="px-4 py-2.5 bg-neutral-50 border-b border-neutral-200">
                <p className="text-[12.5px] font-bold text-neutral-900 truncate">{subject}</p>
                <p className="text-[11.5px] text-neutral-500 mt-0.5">
                  {fromName} &lt;{fromEmail}&gt;
                </p>
              </div>
              <div style={{ height: 300, overflow: "hidden", position: "relative" }}>
                <iframe
                  srcDoc={wrapEmailLayout(htmlBody)}
                  title={`${idPrefix} desktop preview`}
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
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Smartphone size={11} className="text-neutral-400" />
              <span className="text-[11px] font-medium text-neutral-400">Mobile</span>
            </div>
            <div className="flex justify-center py-2">
              <div
                className="relative shrink-0"
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
                      srcDoc={wrapEmailLayout(htmlBody)}
                      title={`${idPrefix} mobile preview`}
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
        </div>

        <div className="flex gap-2.5 px-3.5 py-2.5 rounded-lg border border-indigo-100 bg-indigo-50">
          <Mail size={13} className="text-indigo-400 shrink-0 mt-0.5" />
          <p className="text-[12px] text-neutral-600 leading-relaxed">
            Tokens like{" "}
            <span className="bg-indigo-100 text-indigo-700 rounded px-1 py-0.5 font-mono text-[11px] font-bold">
              {token}
            </span>{" "}
            will be replaced with real values at send time.
          </p>
        </div>
      </div>
    );
  }

  // ── Panel renders ─────────────────────────────────────────────────────────

  function renderPanel() {
    switch (activeTab) {

      // ───────────────────────────────────────────────────────────── DETAILS
      case "details":
        return (
          <Card title="Semester info" onEdit={() => onGoToStep("details")}>
            <KVTable rows={[
              {
                label: "Semester name",
                value: state.details?.name
                  ?? <span className="italic text-neutral-400 font-normal">Not set</span>,
              },
              {
                label: "Attendance tracking",
                value: <Chip variant={state.details?.trackingMode ? "ok" : "neutral"}>
                  {state.details?.trackingMode ? "Enabled" : "Disabled"}
                </Chip>,
              },
              {
                label: "Capacity warning",
                value: state.details?.capacityWarningThreshold != null
                  ? `${state.details.capacityWarningThreshold}% remaining spots`
                  : <span className="italic text-neutral-400 font-normal">Not set</span>,
              },
            ]} />
          </Card>
        );

      // ───────────────────────────────────────────────────────────── CLASSES
      case "classes": {
        const zeroScheduleClasses = classes.filter((c) => (c.schedules ?? []).length === 0);
        const totalSessions = classes.reduce(
          (sum, c) => sum + countSessions(c.schedules ?? []), 0,
        );
        return (
          <div className="space-y-4">
            <Card
              title={`${classes.length} Class${classes.length !== 1 ? "es" : ""} · ${totalSessions} Total Sessions`}
              onEdit={() => onGoToStep("sessions")}
              noPad
            >
              {classes.length === 0 ? (
                <div className="p-5"><EmptyMsg>No classes added yet.</EmptyMsg></div>
              ) : (
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
                          className={`border-t border-neutral-100 transition-colors hover:bg-red-50/30 ${i % 2 === 1 ? "bg-neutral-50" : "bg-white"}`}
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
              )}
            </Card>

            {zeroScheduleClasses.length > 0 && (
              <div className="flex gap-2.5 px-3.5 py-3 rounded-lg border border-mauve bg-mauve/10">
                <AlertTriangle size={14} className="text-mauve-text shrink-0 mt-0.5" />
                <p className="text-[12.5px] text-neutral-700 leading-relaxed">
                  <strong>{zeroScheduleClasses.length} class{zeroScheduleClasses.length !== 1 ? "es" : ""} have 0 sessions.</strong>{" "}
                  {zeroScheduleClasses.map((c) => c.name).join(" and ")}{" "}
                  {zeroScheduleClasses.length === 1 ? "has" : "have"} no sessions configured.
                  Registrations will not be possible until sessions are added.
                </p>
              </div>
            )}
          </div>
        );
      }

      // ───────────────────────────────────────────────────────────── GROUPS
      case "groups":
        return (
          <Card
            title={`${groups.length} Group${groups.length !== 1 ? "s" : ""}`}
            onEdit={() => onGoToStep("sessionGroups")}
            noPad
          >
            {groups.length === 0 ? (
              <div className="p-5"><EmptyMsg>No class groups configured.</EmptyMsg></div>
            ) : (
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
            )}
          </Card>
        );

      // ───────────────────────────────────────────────────────────── PAYMENT
      case "payment": {
        const isInstallments = payment?.type === "installments";
        const isDepositFlat  = payment?.type === "deposit_flat";
        const isDepositPct   = payment?.type === "deposit_percent";
        const isDeposit      = isDepositFlat || isDepositPct;
        const tuitionBands   = state.tuitionRateBands ?? [];
        const specialPrograms = state.specialProgramTuition ?? [];
        return (
          <div className="space-y-4">

            {/* Plan */}
            <Card title="Payment plan" onEdit={() => onGoToStep("payment")}>
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
            </Card>

            {/* Fee config */}
            {feeConfig && (
              <Card title="Fee configuration" onEdit={() => onGoToStep("payment")}>
                <div className="grid grid-cols-4 gap-2.5">
                  {[
                    { label: "Registration fee",     val: feeConfig.registration_fee_per_child,      sub: "Per child",      money: true },
                    { label: "Family discount",      val: feeConfig.family_discount_amount,           sub: "2+ dancers",     money: true },
                    { label: "Junior costume",       val: feeConfig.junior_costume_fee_per_class,     sub: "Per class",      money: true },
                    { label: "Senior costume",       val: feeConfig.senior_costume_fee_per_class,     sub: "Per class",      money: true },
                    { label: "Senior video",         val: feeConfig.senior_video_fee_per_registrant,  sub: "Per registrant", money: true },
                    { label: "Auto-pay fee",         val: feeConfig.auto_pay_admin_fee_monthly,       sub: "Per month",      money: true },
                    { label: "Auto-pay installments",val: feeConfig.auto_pay_installment_count,       sub: "# payments",     money: false },
                  ].map((card) => (
                    <div key={card.label} className="border border-neutral-200 rounded-lg px-4 py-3.5 bg-neutral-50">
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
                  <div className="mt-3.5 flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-medium text-neutral-400">Costume exempt:</span>
                    {feeConfig.costume_fee_exempt_keys!.map((k) => (
                      <Chip key={k} variant="lav">{toTitle(k)}</Chip>
                    ))}
                  </div>
                )}
              </Card>
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
              <Card title="Sample installment schedule" noPad>
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
                <p className="text-[11.5px] text-neutral-400 px-3.5 py-2">
                  Sample based on one registration. Actual amounts vary by tuition band.
                </p>
              </Card>
            )}
          </div>
        );
      }

      // ─────────────────────────────────────────────────────────── DISCOUNTS
      case "discounts":
        return (
          <Card title="Discounts & coupons" onEdit={() => onGoToStep("discounts")}>
            {/* Linked discounts */}
            <div className="text-[10.5px] font-[800] uppercase tracking-[.08em] text-neutral-400 mb-1">
              Linked discounts · {linkedDiscounts.length}
            </div>
            {linkedDiscounts.length === 0 ? (
              <EmptyMsg>No discounts linked to this semester.</EmptyMsg>
            ) : (
              <div>
                {linkedDiscounts.map((d) => {
                  const rc = d.discount_rules?.length ?? 0;
                  return (
                    <div
                      key={d.id}
                      className="flex items-center gap-2.5 py-2.5 border-b border-neutral-100 last:border-0"
                    >
                      <span className="text-sm font-semibold text-neutral-900">{d.name}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${discountChipCls(d.category)}`}>
                        {discountCatLabel(d.category)}
                      </span>
                      <span className="flex-1" />
                      <span className="text-xs text-neutral-500">
                        {rc} rule{rc !== 1 ? "s" : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Coupons */}
            <div className="text-[10.5px] font-[800] uppercase tracking-[.08em] text-neutral-400 mt-5 mb-1">
              Coupons · {coupons.length}
            </div>
            {coupons.length === 0 ? (
              <EmptyMsg>No coupons configured for this semester.</EmptyMsg>
            ) : (
              <div>
                {coupons.map((c) => {
                  const valueText = c.valueType === "percent" ? `${c.value}% off` : `${fmtMoney(c.value)} off`;
                  return (
                    <div
                      key={c._clientKey}
                      className="flex items-center gap-2.5 py-2.5 border-b border-neutral-100 last:border-0"
                    >
                      <span className="text-sm font-semibold text-neutral-900">{c.name}</span>
                      {c.code ? (
                        <span className="font-mono text-xs bg-neutral-100 px-2 py-0.5 rounded font-bold text-neutral-700">
                          {c.code}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400 italic">Auto-apply</span>
                      )}
                      <span className="flex-1" />
                      <span className="text-xs text-neutral-500">
                        {valueText} · {c.usesCount ?? 0} uses
                      </span>
                      <Chip variant={c.isActive ? "ok" : "neutral"}>
                        {c.isActive ? "Active" : "Inactive"}
                      </Chip>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        );

      // ────────────────────────────────────────────────────── REGISTRATION FORM
      // ⚠️ Left unchanged per the design request — do not restyle this panel.
      case "regform": {
        // Mirror RegistrationFormStep's section grouping logic
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
              onEdit={() => onGoToStep("registrationForm")}
            />
            {formElements.length === 0 ? (
              <div className="border border-neutral-200 rounded-lg px-4 py-5 text-sm text-neutral-400 italic">
                No registration form configured.
              </div>
            ) : (
              <div className="space-y-4">
                {rSections.map((section) => (
                  <div
                    key={section.header.id}
                    className="rounded-xl border border-neutral-200 bg-white overflow-hidden"
                  >
                    {/* Section header — matches SortableSectionCard */}
                    <div className="flex items-center gap-2 px-3 py-3 border-b-2 border-primary-600">
                      <span className="flex-1 text-sm font-bold uppercase tracking-wide text-neutral-800 truncate">
                        {section.header.label}
                      </span>
                      <span className="shrink-0 text-xs px-2 py-0.5 rounded-full border border-neutral-200 text-neutral-500 font-medium">
                        {section.fields.length} {section.fields.length === 1 ? "field" : "fields"}
                      </span>
                    </div>

                    {/* Field rows — matches SortableFieldRowItem (read-only) */}
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

      // ────────────────────────────────────────────────────────────── EMAILS
      // Confirmation email + Waitlist invitation combined on one tab, as two
      // sub-cards. The preview iframes reuse the existing component (untouched).
      case "email": {
        const wl = waitlist;
        return (
          <Card title="Emails" onEdit={() => onGoToStep("emails")}>
            <div className="space-y-3">

              {/* ── Confirmation email ── */}
              <div className="border border-neutral-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[13px] font-bold text-neutral-900">Confirmation email</span>
                  <Chip variant={email?.subject ? "ok" : "neutral"}>
                    {email?.subject ? "Active" : "Not set"}
                  </Chip>
                </div>
                {email ? (
                  <>
                    <KVTable rows={[
                      {
                        label: "From",
                        value: `${email.fromName || "AYDT Studio"} <${email.fromEmail || "hello@aydt.org"}>`,
                      },
                      { label: "Subject",   value: email.subject || <span className="italic text-neutral-400 font-normal">Not set</span> },
                      { label: "Signature", value: <Chip variant="ok">Included</Chip> },
                    ]} />
                    {email.htmlBody &&
                      emailPreview(
                        email.htmlBody,
                        email.subject,
                        email.fromName || "AYDT Studio",
                        email.fromEmail || "hello@aydt.org",
                        "{{first_name}}",
                        "Email",
                      )}
                  </>
                ) : (
                  <EmptyMsg>No confirmation email configured.</EmptyMsg>
                )}
              </div>

              {/* ── Waitlist invitation ── */}
              <div className="border border-neutral-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[13px] font-bold text-neutral-900">Waitlist invitation</span>
                  <Chip variant={wl?.enabled ? "ok" : "neutral"}>
                    {wl?.enabled ? "Enabled" : "Disabled"}
                  </Chip>
                </div>
                {wl?.enabled ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {[
                        { label: "Invite expiry",  val: `${wl.inviteExpiryHours} hrs`,      sub: "After invite sent" },
                        { label: "Spot hold",      val: "30 min",                          sub: "After acceptance" },
                        { label: "Stop accepting", val: `${wl.stopDaysBeforeClose} days`,   sub: "Before close" },
                        { label: "Queue order",    val: "FIFO",                            sub: "First in, first invited" },
                      ].map((stat) => (
                        <div key={stat.label} className="border border-neutral-200 rounded-lg px-4 py-3 bg-neutral-50">
                          <div className="text-[10.5px] font-[800] uppercase tracking-[.08em] text-neutral-400 mb-1.5">
                            {stat.label}
                          </div>
                          <div className="text-lg font-[800] text-neutral-900 leading-none">{stat.val}</div>
                          <div className="text-[11.5px] text-neutral-500 mt-1">{stat.sub}</div>
                        </div>
                      ))}
                    </div>
                    {wl.stopDaysBeforeClose && regCloseAt && (
                      <p className="text-[11.5px] text-neutral-400 mt-2.5">
                        Stops accepting on{" "}
                        <span className="font-semibold text-neutral-600">
                          {fmtD(
                            new Date(
                              new Date(regCloseAt).getTime() - wl.stopDaysBeforeClose * 24 * 3600 * 1000,
                            ).toISOString(),
                          )}
                        </span>.
                      </p>
                    )}
                    {wl.invitationEmail?.htmlBody &&
                      emailPreview(
                        wl.invitationEmail.htmlBody,
                        wl.invitationEmail.subject,
                        wl.invitationEmail.fromName || "AYDT Studio",
                        wl.invitationEmail.fromEmail || "hello@aydt.org",
                        "{{participant_name}}",
                        "Waitlist email",
                      )}
                  </>
                ) : (
                  <p className="text-[12.5px] text-neutral-500">
                    Enable in the Emails step to allow families to queue for full sessions.
                  </p>
                )}
              </div>

            </div>
          </Card>
        );
      }
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Scrollable content ──────────────────────────────────────────── */}
      <div
        className="flex-1 min-h-0 overflow-y-auto px-8 pt-6 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
        style={{ background: "var(--admin-page-bg)" }}
      >
        <p
          className="text-[11px] font-[800] uppercase tracking-widest mb-2"
          style={{ color: "var(--admin-text-faint)" }}
        >
          Step 8 of 8
        </p>

        {/* Header */}
        <div className="mb-5 max-w-[1000px] mx-auto">
          <h2 className="text-[26px] font-semibold tracking-tight text-neutral-900">Review &amp; publish</h2>
          <p className="text-sm text-neutral-500 mt-0.5 leading-relaxed">
            Confirm everything before publishing. Once published, core settings are locked.
          </p>
        </div>

        <div className="max-w-[1000px] mx-auto">
          {/* Tab bar */}
          <div className="flex flex-wrap gap-x-5 border-b border-neutral-200 mb-5">
            {TABS.map((tab) => {
              const ok = tabStatus[tab.key] === "ok";
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 py-2.5 text-[13px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                    isActive ? "font-semibold" : "border-transparent text-neutral-500 hover:text-neutral-700"
                  }`}
                  style={
                    isActive
                      ? { borderBottomColor: "var(--admin-sidebar-active)", color: "var(--admin-sidebar-active)" }
                      : {}
                  }
                >
                  <span
                    className={`w-[15px] h-[15px] rounded-full flex items-center justify-center flex-shrink-0 ${
                      ok ? "bg-mint/20" : "bg-mauve/20"
                    }`}
                  >
                    {ok ? (
                      <Check size={8} className="text-mint-text" strokeWidth={3} />
                    ) : (
                      <AlertTriangle size={8} className="text-mauve-text" strokeWidth={3} />
                    )}
                  </span>
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Panel */}
          {renderPanel()}
        </div>

        <div className="h-6" />
      </div>

      {/* ── Publish footer ────────────────────────────────────────────────── */}
      <div
        className="shrink-0 px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white border-t border-neutral-200"
        style={{ boxShadow: "0 -2px 8px rgba(0,0,0,0.05)" }}
      >
        {/* Back */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 h-9 px-4 text-sm font-semibold rounded-lg border border-neutral-200 text-neutral-500 transition-colors hover:border-neutral-300 hover:text-neutral-700 self-start sm:self-auto"
        >
          <ChevronLeft size={13} />
          Back
        </button>

        {/* Schedule + Save + Publish */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] font-bold text-neutral-400 whitespace-nowrap">
              Publish on
            </span>
            <InlineDatePicker
              value={scheduleDate}
              onChange={setScheduleDate}
              placement="top"
            />
          </div>

          <button
            disabled={!scheduleDate}
            onClick={() => scheduleDate && onSchedule(new Date(scheduleDate + "T00:00:00").toISOString())}
            className="h-9 px-3.5 text-[12.5px] font-bold rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-80"
            style={{ borderColor: "var(--admin-sidebar-active)", color: "var(--admin-sidebar-active)" }}
          >
            Schedule
          </button>

          <div className="w-px h-5 bg-neutral-200 hidden sm:block" />

          <button
            onClick={onSaveDraft}
            className="h-9 px-4 text-sm font-bold rounded-lg border border-neutral-200 text-neutral-600 transition-colors hover:border-neutral-300 hover:text-neutral-800"
          >
            Save draft
          </button>

          <button
            onClick={onPublishNow}
            className="flex items-center gap-1.5 h-9 px-5 text-sm font-[800] text-white rounded-lg transition-colors hover:opacity-90"
            style={{ background: "var(--admin-sidebar-active)" }}
          >
            <Globe size={13} />
            Publish now
          </button>
        </div>
      </div>
    </div>
  );
}
