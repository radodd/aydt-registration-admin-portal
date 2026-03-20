"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  UserPlus,
  Settings,
  BarChart2,
  CreditCard,
  Mail,
  Link2,
  ExternalLink,
  ChevronRight,
  AlertTriangle,
  CircleAlert,
} from "lucide-react";
import CopyLinkButton from "./CopyLinkButton";

const RegistrationTrendChart = dynamic(
  () => import("./RegistrationTrendChart"),
  { ssr: false }
);

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

type RecentReg = {
  id: string;
  created_at: string;
  dancers:
    | { id: string; first_name: string; last_name: string; birth_date: string | null; gender: string | null }
    | { id: string; first_name: string; last_name: string; birth_date: string | null; gender: string | null }[]
    | null;
  class_sessions:
    | { classes: { name: string } | null }
    | { classes: { name: string } | null }[]
    | null;
};

type TrendPoint = { month: string; count: number };
type CapacityRow = { name: string; enrolled: number; capacity: number };

type Props = {
  semesterId: string;
  recentRegistrations: RecentReg[];
  participantCount: number;
  spotsFilledCount: number;
  waitlistCount: number;
  collected: number;
  outstanding: number;
  totalRevenue: number;
  trendData: TrendPoint[];
  sessionCapacity: CapacityRow[];
};

/* -------------------------------------------------------------------------- */
/* Design token constants (from globals.css :root)                            */
/* -------------------------------------------------------------------------- */

const C = {
  wine:     "#8E2A23",
  okText:   "#0A5A50",
  warnText: "#7A4E08",
  infoText: "#3A3080",
  errText:  "#7A2018",
  warnBg:   "#FAECD0",
  warnBdr:  "rgba(122,78,8,0.25)",
  errBg:    "#F4D4CE",
  errBdr:   "rgba(122,32,24,0.25)",
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function fmt$$(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function calcAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function single<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function capPct(enrolled: number, capacity: number) {
  if (!capacity) return 0;
  return Math.min(100, Math.round((enrolled / capacity) * 100));
}

function capFillColor(pct: number) {
  if (pct >= 100) return C.errText;
  if (pct >= 85)  return C.warnText;
  return C.wine;
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

function StatCard({
  label,
  value,
  sub,
  accentColor,
  valueColor,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accentColor: string;
  valueColor?: string;
}) {
  return (
    <div className="admin-card-stat" style={{ borderTopColor: accentColor }}>
      <div className="admin-stat-label">{label}</div>
      <div
        className="admin-stat-value"
        style={{ fontSize: 26, color: valueColor ?? accentColor }}
      >
        {value}
      </div>
      {sub && <div className="admin-stat-sub">{sub}</div>}
    </div>
  );
}

function CapBar({ name, enrolled, capacity }: CapacityRow) {
  const pct = capPct(enrolled, capacity);
  const fillColor = capFillColor(pct);
  const isFull = pct >= 100;

  return (
    <div className="flex items-center gap-3">
      <div
        className="text-sm font-medium shrink-0 overflow-hidden text-ellipsis whitespace-nowrap"
        style={{ width: 100, color: "var(--admin-text)" }}
        title={name}
      >
        {name}
      </div>
      <div
        className="flex-1 rounded-full overflow-hidden"
        style={{
          height: 8,
          background: "var(--admin-border-sub)",
          border: "0.5px solid var(--admin-border)",
        }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: fillColor }}
        />
      </div>
      <div
        className="text-xs font-semibold shrink-0 text-right"
        style={{ width: 36, color: isFull ? C.errText : "var(--admin-text-muted)" }}
      >
        {isFull ? "Full" : `${pct}%`}
      </div>
    </div>
  );
}

function SectionCardLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-0.5 text-xs font-bold transition-opacity hover:opacity-60"
      style={{ color: C.wine }}
    >
      {children}
      <ChevronRight style={{ width: 11, height: 11 }} />
    </Link>
  );
}

function RpSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.09em",
        textTransform: "uppercase",
        color: "var(--admin-text-faint)",
        marginBottom: 10,
      }}
    >
      {children}
    </p>
  );
}

function RpAction({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-primary-50 hover:text-primary-700"
      style={{ color: "var(--admin-text)" }}
    >
      <Icon
        className="shrink-0"
        style={{ width: 14, height: 14, color: C.wine }}
      />
      {children}
    </Link>
  );
}

function RpAlert({
  type,
  title,
  sub,
}: {
  type: "err" | "warn";
  title: string;
  sub: string;
}) {
  const isErr = type === "err";
  const Icon = isErr ? AlertTriangle : CircleAlert;
  return (
    <div
      className="flex items-start gap-2 rounded-lg mb-1.5 last:mb-0"
      style={{
        background: isErr ? C.errBg : C.warnBg,
        border: `1px solid ${isErr ? C.errBdr : C.warnBdr}`,
        padding: "8px 10px",
      }}
    >
      <Icon
        style={{
          width: 12,
          height: 12,
          color: isErr ? C.errText : C.warnText,
          marginTop: 1,
          flexShrink: 0,
        }}
      />
      <div>
        <div
          className="text-xs font-semibold leading-none mb-0.5"
          style={{ color: "var(--admin-text)" }}
        >
          {title}
        </div>
        <div
          className="text-xs leading-snug"
          style={{ color: "var(--admin-text-muted)" }}
        >
          {sub}
        </div>
      </div>
    </div>
  );
}

function RevRow({
  dot,
  label,
  value,
  valueColor,
  border,
}: {
  dot: string;
  label: string;
  value: string;
  valueColor: string;
  border?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between py-1.5"
      style={border ? { borderBottom: "0.5px solid var(--admin-border)" } : {}}
    >
      <div className="flex items-center gap-1.5">
        <div
          className="rounded-full shrink-0"
          style={{ width: 7, height: 7, background: dot }}
        />
        <span
          className="text-xs font-medium"
          style={{ color: "var(--admin-text-muted)" }}
        >
          {label}
        </span>
      </div>
      <span className="text-sm font-bold" style={{ color: valueColor }}>
        {value}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main component                                                              */
/* -------------------------------------------------------------------------- */

export default function SemesterDashboard({
  semesterId,
  recentRegistrations,
  participantCount,
  spotsFilledCount,
  waitlistCount,
  collected,
  outstanding,
  totalRevenue,
  trendData,
  sessionCapacity,
}: Props) {
  // Build alerts from capacity + revenue data
  const alerts: { type: "err" | "warn"; title: string; sub: string }[] = [];
  for (const s of sessionCapacity) {
    const pct = capPct(s.enrolled, s.capacity);
    if (pct >= 100) {
      alerts.push({ type: "err", title: `${s.name} is full`, sub: `${s.capacity} / ${s.capacity} spots taken` });
    } else if (pct >= 85) {
      const rem = s.capacity - s.enrolled;
      alerts.push({ type: "warn", title: `${s.name} at ${pct}%`, sub: `${rem} spot${rem !== 1 ? "s" : ""} remaining` });
    }
  }
  if (outstanding > 0) {
    alerts.push({ type: "warn", title: `${fmt$$(outstanding)} outstanding`, sub: "Balance due from families" });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4 items-start">

      {/* ━━━━━━━━━━━━━━━━ Main column ━━━━━━━━━━━━━━━━ */}
      <div className="space-y-4">

        {/* Stat row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Participants"
            value={participantCount}
            sub="unique dancers"
            accentColor={C.wine}
            valueColor="var(--admin-text)"
          />
          <StatCard
            label="Spots Filled"
            value={spotsFilledCount}
            sub="total enrollments"
            accentColor={C.okText}
          />
          <StatCard
            label="Waitlist"
            value={waitlistCount}
            sub="pending spots"
            accentColor={C.warnText}
          />
          <StatCard
            label="Total Revenue"
            value={fmt$$(totalRevenue)}
            sub={outstanding > 0 ? `${fmt$$(outstanding)} outstanding` : "all collected"}
            accentColor={C.infoText}
          />
        </div>

        {/* Revenue */}
        <div className="admin-section-card">
          <div className="admin-section-card-header">
            <span className="admin-section-card-title">Revenue</span>
            <SectionCardLink href="/admin/payments">
              Payment dashboard
            </SectionCardLink>
          </div>
          <div
            className="grid grid-cols-3"
            style={{ borderTop: "none" }}
          >
            {[
              { label: "Collected",    value: fmt$$(collected),    color: C.okText,          border: true },
              { label: "Outstanding",  value: fmt$$(outstanding),  color: C.warnText,        border: true },
              { label: "Total",        value: fmt$$(totalRevenue), color: "var(--admin-text)", border: false },
            ].map(({ label, value, color, border }) => (
              <div
                key={label}
                className="py-4 px-5 text-center"
                style={border ? { borderRight: "0.5px solid var(--admin-border)" } : {}}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    color: "var(--admin-text-faint)",
                    marginBottom: 7,
                  }}
                >
                  {label}
                </div>
                <div className="text-xl font-bold" style={{ color }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Session Capacity */}
        {sessionCapacity.length > 0 && (
          <div className="admin-section-card">
            <div className="admin-section-card-header">
              <span className="admin-section-card-title">Session Capacity</span>
              <SectionCardLink href="/admin/sessions">
                All sessions
              </SectionCardLink>
            </div>
            <div className="p-4 space-y-3">
              {sessionCapacity.slice(0, 8).map((s) => (
                <CapBar key={s.name} {...s} />
              ))}
            </div>
          </div>
        )}

        {/* Recent Registrations */}
        <div className="admin-section-card">
          <div className="admin-section-card-header">
            <span className="admin-section-card-title">Recent Registrations</span>
            <SectionCardLink href={`/admin/semesters/${semesterId}`}>
              View all
            </SectionCardLink>
          </div>
          {recentRegistrations.length === 0 ? (
            <p
              className="px-5 py-8 text-sm text-center"
              style={{ color: "var(--admin-text-faint)" }}
            >
              No registrations yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Participant</th>
                    <th>Age</th>
                    <th>Gender</th>
                    <th>Class</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRegistrations.map((reg) => {
                    const dancer = single(reg.dancers);
                    const cs = single(reg.class_sessions);
                    const cls = cs ? single((cs as any).classes) : null;
                    const age = dancer ? calcAge(dancer.birth_date) : null;

                    return (
                      <tr key={reg.id}>
                        <td style={{ color: "var(--admin-text-muted)" }}>
                          {fmtDate(reg.created_at)}
                        </td>
                        <td>
                          {dancer ? (
                            <Link
                              href={`/admin/dancers/${dancer.id}`}
                              className="font-semibold hover:underline"
                              style={{ color: C.wine }}
                            >
                              {dancer.first_name} {dancer.last_name}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td style={{ color: "var(--admin-text-muted)" }}>
                          {age ?? "—"}
                        </td>
                        <td
                          className="capitalize"
                          style={{ color: "var(--admin-text-muted)" }}
                        >
                          {dancer?.gender ?? "—"}
                        </td>
                        <td style={{ color: "var(--admin-text-muted)" }}>
                          {(cls as any)?.name ?? "—"}
                        </td>
                        <td>
                          <span className="badge badge-success">Confirmed</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Registrations Over Time */}
        <div className="admin-section-card">
          <div className="admin-section-card-header">
            <span className="admin-section-card-title">Registrations Over Time</span>
          </div>
          <div className="p-4">
            <RegistrationTrendChart data={trendData} />
          </div>
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━ Right panel ━━━━━━━━━━━━━━━━ */}
      <div className="admin-section-card overflow-hidden">

        {/* Quick Actions */}
        <div className="p-4" style={{ borderBottom: "0.5px solid var(--admin-border)" }}>
          <RpSectionLabel>Quick Actions</RpSectionLabel>
          <RpAction href={`/admin/register?semester=${semesterId}`} icon={UserPlus}>
            Register someone
          </RpAction>
          <RpAction href={`/admin/semesters/${semesterId}/edit`} icon={Settings}>
            Edit semester setup
          </RpAction>
          <RpAction href="/admin/sessions" icon={BarChart2}>
            Session capacity view
          </RpAction>
          <RpAction href="/admin/payments" icon={CreditCard}>
            Payment dashboard
          </RpAction>
          <RpAction href="/admin/emails" icon={Mail}>
            Send email blast
          </RpAction>
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="p-4" style={{ borderBottom: "0.5px solid var(--admin-border)" }}>
            <RpSectionLabel>Alerts</RpSectionLabel>
            {alerts.slice(0, 4).map((a, i) => (
              <RpAlert key={i} {...a} />
            ))}
          </div>
        )}

        {/* Revenue Summary */}
        <div className="p-4" style={{ borderBottom: "0.5px solid var(--admin-border)" }}>
          <RpSectionLabel>Revenue Summary</RpSectionLabel>
          <RevRow dot={C.okText}           label="Collected"   value={fmt$$(collected)}    valueColor={C.okText}            border />
          <RevRow dot={C.warnText}          label="Outstanding" value={fmt$$(outstanding)}  valueColor={C.warnText}          border />
          <RevRow dot="var(--admin-text)"  label="Total"       value={fmt$$(totalRevenue)} valueColor="var(--admin-text)"  />
        </div>

        {/* Portal Links */}
        <div className="p-4">
          <RpSectionLabel>Portal Links</RpSectionLabel>
          <CopyLinkButton semesterId={semesterId} />
          <Link
            href={`/preview/semester/${semesterId}`}
            target="_blank"
            className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-sm font-medium border transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 mt-1.5"
            style={{
              borderColor: "var(--admin-border)",
              color: "var(--admin-text-muted)",
              background: "var(--admin-page-bg)",
            }}
          >
            <ExternalLink style={{ width: 13, height: 13, flexShrink: 0 }} />
            Open public semester page
          </Link>
        </div>
      </div>
    </div>
  );
}
