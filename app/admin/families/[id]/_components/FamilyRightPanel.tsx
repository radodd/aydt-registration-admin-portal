"use client";

import { useState } from "react";
import Link from "next/link";
import { Users, CreditCard, CalendarDays } from "lucide-react";
import type { FamilyDetail } from "@/types";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function fmt$(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function dayAbbr(d: string): string {
  return d.charAt(0).toUpperCase() + d.slice(1, 3);
}

/* -------------------------------------------------------------------------- */
/* Panel section wrapper                                                       */
/* -------------------------------------------------------------------------- */

function PanelSection({
  label,
  children,
  border = true,
}: {
  label: string;
  children: React.ReactNode;
  border?: boolean;
}) {
  return (
    <div
      className={`px-4 py-3 ${border ? "border-b" : ""}`}
      style={{ borderColor: "var(--admin-border-sub)" }}
    >
      <p
        className="text-[9.5px] font-semibold uppercase tracking-widest mb-2.5"
        style={{ color: "var(--admin-text-faint)" }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

function PanelLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 py-1.5 text-[12.5px] transition-colors"
      style={{ color: "var(--admin-text)", fontFamily: "var(--font-outfit)", whiteSpace: "nowrap" }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--admin-sidebar-active)")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--admin-text)")}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: "var(--admin-sidebar-active)" }}
      />
      {children}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* FamilyRightPanel                                                            */
/* -------------------------------------------------------------------------- */

export function FamilyRightPanel({ family }: { family: FamilyDetail }) {
  const [expanded, setExpanded] = useState(false);

  // Derived financials
  const billed = family.registration_orders.reduce(
    (s, b) => s + Number(b.grand_total ?? 0),
    0
  );
  const paid = family.registration_orders.reduce((s, b) => s + b.amountPaid, 0);
  const balance = billed - paid;

  // Upcoming sessions: all active registrations across all dancers
  type SessionItem = {
    key: string;
    className: string;
    dancerName: string;
    day: string;
    startTime: string | null;
  };

  const upcomingSessions: SessionItem[] = family.dancers.flatMap((dancer) =>
    dancer.registrations
      .filter((r) => r.status !== "cancelled" && r.class_meetings)
      .map((r) => ({
        key: `${dancer.id}-${r.class_meetings!.id}`,
        className: r.class_meetings!.classes?.name ?? "Class",
        dancerName: dancer.first_name,
        day: r.class_meetings!.day_of_week,
        startTime: r.class_meetings!.start_time,
      }))
  );

  const uniqueSessions = upcomingSessions;

  const primaryParent = family.users.find((u) => u.is_primary_parent);

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className="shrink-0 relative"
      style={{
        width: expanded ? "222px" : "44px",
        minWidth: expanded ? "222px" : "44px",
        transition: "width 200ms ease, min-width 200ms ease",
        background: "var(--admin-surface)",
        borderLeft: "1px solid var(--admin-border)",
        overflow: "hidden",
      }}
    >
      {/* Collapsed icon strip */}
      <div
        className="absolute inset-0 flex flex-col items-center gap-6 py-5"
        style={{
          opacity: expanded ? 0 : 1,
          transition: "opacity 80ms ease",
          pointerEvents: expanded ? "none" : "auto",
        }}
      >
        <Users size={14} style={{ color: "var(--admin-text-muted)" }} />
        <CreditCard size={14} style={{ color: "var(--admin-text-muted)" }} />
        <CalendarDays size={14} style={{ color: "var(--admin-text-muted)" }} />
      </div>

      {/* Expanded content */}
      <div
        style={{
          width: "222px",
          opacity: expanded ? 1 : 0,
          transition: "opacity 150ms ease",
          pointerEvents: expanded ? "auto" : "none",
          overflowY: "auto",
          maxHeight: "calc(100vh - 52px)",
        }}
      >
        {/* Family Actions */}
        <PanelSection label="Family Actions">
          <div className="flex flex-col gap-0.5">
            <PanelLink href={`/admin/register?family=${family.id}`}>
              Register a dancer
            </PanelLink>
            <PanelLink href={`/admin/payments?family=${family.id}`}>
              Make payment
            </PanelLink>
            <PanelLink href={`/admin/emails?family=${family.id}`}>
              Send email
            </PanelLink>
          </div>
        </PanelSection>

        {/* Family Balance — two column: BILLED | BALANCE */}
        <PanelSection label="Family Balance">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p
                className="text-[9.5px] font-semibold uppercase tracking-widest mb-1"
                style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)" }}
              >
                Billed
              </p>
              <p
                className="text-[13px] font-semibold"
                style={{ color: "var(--admin-text)", fontFamily: "var(--font-outfit)" }}
              >
                {fmt$(billed)}
              </p>
            </div>
            <div>
              <p
                className="text-[9.5px] font-semibold uppercase tracking-widest mb-1"
                style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)" }}
              >
                Balance
              </p>
              <p
                className={`text-[13px] font-semibold ${balance > 0 ? "text-red-500" : ""}`}
                style={balance <= 0 ? { color: "var(--admin-text)", fontFamily: "var(--font-outfit)" } : { fontFamily: "var(--font-outfit)" }}
              >
                {fmt$(balance)}
              </p>
            </div>
          </div>
        </PanelSection>

        {/* Credits Available */}
        <PanelSection label="Credits Available">
          <p
            className="text-[14px] font-semibold"
            style={{ color: "var(--admin-sidebar-active)", fontFamily: "var(--font-outfit)" }}
          >
            {fmt$(family.creditBalance)}
          </p>
        </PanelSection>

        {/* Upcoming Sessions */}
        <PanelSection label="Upcoming Sessions">
          {uniqueSessions.length === 0 ? (
            <p
              className="text-[11px]"
              style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)" }}
            >
              No active enrollments
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {uniqueSessions.map((s) => (
                <div key={s.key}>
                  <p
                    className="text-[11.5px] font-medium leading-tight truncate"
                    style={{ color: "var(--admin-text)", fontFamily: "var(--font-outfit)" }}
                  >
                    {s.className}
                  </p>
                  <p
                    className="text-[10.5px] mt-0.5"
                    style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)" }}
                  >
                    {s.dancerName} · {dayAbbr(s.day)}
                    {s.startTime && ` ${fmtTime(s.startTime)}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </PanelSection>

        {/* Online Account */}
        <PanelSection label="Online Account">
          {primaryParent ? (
            <div className="space-y-1.5">
              <p
                className="text-[11.5px] truncate"
                style={{ color: "var(--admin-text-muted)", fontFamily: "var(--font-outfit)" }}
              >
                {primaryParent.email}
              </p>
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    primaryParent.status === "active" ? "bg-green-500" : "bg-neutral-400"
                  }`}
                />
                <span
                  className="text-[11px]"
                  style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)" }}
                >
                  {primaryParent.status === "active" ? "Active" : "Inactive"}
                </span>
              </div>
              {primaryParent.status === "active" && (
                <button
                  className="mt-1 text-[11px] text-red-400 hover:text-red-600 transition-colors"
                  style={{ fontFamily: "var(--font-outfit)" }}
                  title="Coming soon"
                  disabled
                >
                  Remove account access
                </button>
              )}
            </div>
          ) : (
            <p
              className="text-[11px]"
              style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)" }}
            >
              No primary parent
            </p>
          )}
        </PanelSection>

        {/* Authorized Pickup */}
        {/* TODO: Implement after authorized_pickup_persons DB table is added */}
        <PanelSection label="Authorized Pickup" border={false}>
          <p
            className="text-[11px]"
            style={{ color: "var(--admin-text-faint)", fontFamily: "var(--font-outfit)" }}
          >
            No persons on file.
          </p>
          <button
            className="mt-2 text-[11.5px] transition-colors"
            style={{ color: "var(--admin-sidebar-active)", fontFamily: "var(--font-outfit)" }}
            disabled
            title="Coming soon"
          >
            + Add person
          </button>
        </PanelSection>
      </div>
    </aside>
  );
}
