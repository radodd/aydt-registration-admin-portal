"use client";

import { useState } from "react";
import type { Dancer, User } from "@/types";
import { ParentInfoCard } from "./ParentInfoCard";
import { DancerCard } from "./DancerCard";
import AddDancerForm from "./AddDancerForm";
import { FamilyContactCard, type PrefillOption } from "./FamilyContactCard";
import { SmsOptInCard } from "./SmsOptInCard";
import { signOut } from "@/app/auth/actions";
import type { FamilyContact } from "@/types";

/* ── Data types from Supabase queries ─────────────────────── */

type RegRow = {
  id: string;
  status: string;
  dancer_id: string;
  /** Set for tiered full-term enrollments (from section_enrollments). */
  tier_name?: string | null;
  class_meetings: {
    id: string;
    day_of_week: string;
    /** Full-term enrollments meet on multiple days (from class_sections). */
    days_of_week?: string[] | null;
    start_time: string | null;
    end_time: string | null;
    location: string | null;
    instructor_name: string | null;
    classes: { id: string; name: string; discipline: string | null } | null;
  } | null;
};

type InstallmentRow = {
  id: string;
  installment_number: number;
  amount_due: number;
  due_date: string;
  status: string;
  paid_at: string | null;
};

type BatchRow = {
  id: string;
  grand_total: number | null;
  payment_plan_type: string | null;
  status: string;
  created_at: string;
  semesters: { name: string } | null;
  order_payment_installments: InstallmentRow[];
  registrations?: {
    id: string;
    dancer_id: string;
    dancers: { first_name: string; last_name: string } | null;
    class_meetings: { classes: { name: string } | null } | null;
  }[];
};

interface FamilyProfileCardProps {
  user: User;
  dancers?: Dancer[] | null;
  registrations?: RegRow[] | null;
  batches?: BatchRow[] | null;
  contacts?: FamilyContact[] | null;
  /** Tab to open on mount (from the `?tab=` query param). */
  initialTab?: string;
}

/* ── Helper functions ─────────────────────────────────────── */

function formatTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function formatDay(day: string): string {
  const map: Record<string, string> = {
    monday: "Mon", tuesday: "Tue", wednesday: "Wed",
    thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun",
  };
  return map[day.toLowerCase()] ?? day;
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });
}

function formatLongDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

function getDisciplineColor(d: string | null): string {
  const colors: Record<string, string> = {
    ballet: "#5A3A80", jazz: "#8E2A23", hip_hop: "#1D4A6A",
    contemporary: "#1D6A50", tap: "#7A5A1D", lyrical: "#3A6A6A",
    broadway: "#8E6A23", technique: "#3A3A8E", pointe: "#8E3A80", acro: "#6A1D1D",
  };
  return colors[d ?? ""] ?? "#5E3458";
}

function formatDisciplineLabel(d: string | null): string {
  const labels: Record<string, string> = {
    ballet: "Ballet", jazz: "Jazz", hip_hop: "Hip Hop",
    contemporary: "Contemporary", tap: "Tap", lyrical: "Lyrical",
    broadway: "Broadway", technique: "Technique", pointe: "Pointe", acro: "Acro",
  };
  return labels[d ?? ""] ?? (d ?? "");
}

/* ── Small SVG icons ─────────────────────────────────────── */

function CalendarIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.5, flexShrink: 0 }}>
      <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 1v3M11 1v3M2 7h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.5, flexShrink: 0 }}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 5v3.5M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M4 8l3 3 5-5" stroke="#1A5C16" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Toggle switch ───────────────────────────────────────── */

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative", width: 38, height: 22, flexShrink: 0,
        marginTop: 1, cursor: "pointer", userSelect: "none",
      }}
    >
      <div style={{
        position: "absolute", inset: 0, borderRadius: 11,
        background: checked ? "var(--plum)" : "var(--pub-border)",
        transition: "background .2s",
      }} />
      <div style={{
        position: "absolute",
        top: 3,
        left: checked ? 19 : 3,
        width: 16, height: 16, borderRadius: "50%",
        background: "#fff",
        transition: "left .2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
      }} />
    </div>
  );
}

/* ── Shared style helpers ─────────────────────────────────── */

type BadgeType = "mint" | "amber" | "lavender" | "sage" | "plum" | "gray";

const BADGE_BG: Record<BadgeType, string> = {
  mint: "var(--pub-badge-mint-bg)",
  amber: "var(--pub-badge-amber-bg)",
  lavender: "var(--pub-badge-lavender-bg)",
  sage: "var(--pub-badge-sage-bg)",
  plum: "var(--plum-50)",
  gray: "#EDEAE6",
};
const BADGE_TEXT: Record<BadgeType, string> = {
  mint: "var(--pub-badge-mint-text)",
  amber: "var(--pub-badge-amber-text)",
  lavender: "var(--pub-badge-lavender-text)",
  sage: "var(--pub-badge-sage-text)",
  plum: "var(--plum-700)",
  gray: "#4A4540",
};

function Badge({ type, dot, children }: { type: BadgeType; dot?: boolean; children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 99,
      fontSize: 10, fontWeight: 700, letterSpacing: "0.3px",
      whiteSpace: "nowrap",
      background: BADGE_BG[type], color: BADGE_TEXT[type],
    }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", opacity: 0.75 }} />}
      {children}
    </span>
  );
}

const CARD_STYLE: React.CSSProperties = {
  background: "var(--pub-surface)",
  border: "1px solid var(--pub-border)",
  borderRadius: 12,
  overflow: "hidden",
  boxShadow: "var(--pub-shadow-card)",
  marginBottom: 16,
};

const CHIP_STYLE: React.CSSProperties = {
  padding: "3px 9px", borderRadius: 999,
  fontSize: 11, fontWeight: 600,
  background: "var(--plum-50)", color: "var(--plum-700)",
  border: "1px solid var(--plum-100)",
};

/* ── Main component ──────────────────────────────────────── */

export const FamilyProfileCard = ({
  user, dancers, registrations, batches, contacts, initialTab,
}: FamilyProfileCardProps) => {
  type Tab = "profile" | "dancers" | "registrations" | "payments" | "notifications";
  const TAB_IDS: Tab[] = ["profile", "dancers", "registrations", "payments", "notifications"];
  const [activeTab, setActiveTab] = useState<Tab>(
    TAB_IDS.includes(initialTab as Tab) ? (initialTab as Tab) : "profile",
  );
  const [showAddDancer, setShowAddDancer] = useState(false);
  const [showAddEmergency, setShowAddEmergency] = useState(false);
  const [newsletter, setNewsletter] = useState(false);

  /* ── Derived stats ─────────────────────────────────────── */
  const initials = `${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}`.toUpperCase();
  const memberYear = new Date(user.created_at).getFullYear();
  const activeDancerCount = dancers?.length ?? 0;
  const activeRegCount = (registrations ?? []).filter(r => r.status === "confirmed").length;

  const validBatches = (batches ?? []).filter(b => b.status !== "failed" && b.status !== "refunded");
  const allInstallments = validBatches.flatMap(b => b.order_payment_installments ?? []);
  const pendingInstallments = allInstallments.filter(i => i.status === "pending" || i.status === "due");
  const paidInstallments = [...allInstallments]
    .filter(i => i.status === "paid")
    .sort((a, b) => new Date(b.paid_at ?? "").getTime() - new Date(a.paid_at ?? "").getTime());

  const totalOutstanding = pendingInstallments.reduce((s, i) => s + Number(i.amount_due ?? 0), 0);
  const nextDueInstallment = pendingInstallments.length > 0
    ? [...pendingInstallments].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0]
    : null;
  const hasPendingPayment = pendingInstallments.length > 0;
  const hasActivePlan = validBatches.some(b =>
    (b.order_payment_installments ?? []).some(i => i.status === "pending" || i.status === "due")
  );
  const daysUntilDue = nextDueInstallment
    ? Math.ceil((new Date(nextDueInstallment.due_date + "T00:00:00").getTime() - Date.now()) / 86400000)
    : null;

  /* ── Contact lookups ───────────────────────────────────── */
  const emergencyContacts = (contacts ?? []).filter(c => c.type === "emergency_contact");
  const alternateParent = (contacts ?? []).find(c => c.type === "alternate_parent") ?? null;
  const caregiver = (contacts ?? []).find(c => c.type === "caregiver") ?? null;

  /* Build prefill options for emergency contact from filled-in alt parent / caregiver */
  const emergencyPrefillOptions: PrefillOption[] = [];
  if (alternateParent && (alternateParent.first_name || alternateParent.last_name)) {
    emergencyPrefillOptions.push({
      label: [alternateParent.first_name, alternateParent.last_name].filter(Boolean).join(" "),
      data: {
        first_name: alternateParent.first_name,
        last_name: alternateParent.last_name,
        phone: alternateParent.phone,
        email: alternateParent.email,
        relationship: alternateParent.relationship,
      },
    });
  }
  if (caregiver && (caregiver.first_name || caregiver.last_name)) {
    emergencyPrefillOptions.push({
      label: [caregiver.first_name, caregiver.last_name].filter(Boolean).join(" "),
      data: {
        first_name: caregiver.first_name,
        last_name: caregiver.last_name,
        phone: caregiver.phone,
        email: caregiver.email,
        relationship: caregiver.relationship,
      },
    });
  }

  /* ── Disciplines per dancer (for profile tab chips) ─────── */
  const disciplinesByDancer = new Map<string, string[]>();
  for (const r of (registrations ?? [])) {
    if (r.status === "confirmed") {
      const disc = r.class_meetings?.classes?.discipline;
      if (disc) {
        const arr = disciplinesByDancer.get(r.dancer_id) ?? [];
        if (!arr.includes(disc)) arr.push(disc);
        disciplinesByDancer.set(r.dancer_id, arr);
      }
    }
  }

  /* ── Regs grouped by dancer ────────────────────────────── */
  const regsByDancer = (dancers ?? []).map(d => ({
    dancer: d,
    regs: (registrations ?? []).filter(r => r.dancer_id === d.id),
  }));

  const tabs: { id: Tab; label: string }[] = [
    { id: "profile", label: "Profile" },
    { id: "dancers", label: "Dancers" },
    { id: "registrations", label: "Registrations" },
    { id: "payments", label: "Payments" },
    { id: "notifications", label: "Notifications" },
  ];

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>

      {/* ── Account Card ────────────────────────────────────── */}
      <div className="profile-outer-pad">
        <div style={{
          background: "var(--pub-surface)",
          border: "1px solid var(--pub-border)",
          borderRadius: 14, padding: "20px 24px",
          display: "flex", alignItems: "center", gap: 18,
          boxShadow: "var(--pub-shadow-card)", marginBottom: 24,
          flexWrap: "wrap",
        }}>
          {/* Avatar */}
          <div style={{
            width: 52, height: 52, borderRadius: 12, flexShrink: 0,
            background: "linear-gradient(135deg,var(--plum),var(--plum-700))",
            color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 700,
          }}>{initials}</div>

          {/* Name + meta + chips */}
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{user.first_name} {user.last_name}</div>
            <div style={{ fontSize: 12, color: "var(--pub-text-muted)", marginTop: 2 }}>
              {user.email} · Member since {memberYear}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {activeRegCount > 0 && <span style={CHIP_STYLE}>Spring 2026 Enrolled</span>}
              {hasActivePlan && <span style={CHIP_STYLE}>Payment Plan Active</span>}
            </div>
          </div>

          {/* Stats + Logout */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 24 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--plum)" }}>{activeDancerCount}</div>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--pub-text-faint)", fontWeight: 600, marginTop: 1 }}>Dancers</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--plum)" }}>{activeRegCount}</div>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--pub-text-faint)", fontWeight: 600, marginTop: 1 }}>Active Classes</div>
            </div>
            {totalOutstanding > 0 && nextDueInstallment && (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--pub-badge-amber-text)" }}>${totalOutstanding.toFixed(0)}</div>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--pub-text-faint)", fontWeight: 600, marginTop: 1 }}>
                  Due {formatShortDate(nextDueInstallment.due_date)}
                </div>
              </div>
            )}
            <div style={{ width: 1, height: 32, background: "var(--pub-border)", flexShrink: 0 }} />
            <form action={signOut}>
              <button
                type="submit"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontSize: 12, fontWeight: 600, borderRadius: 8,
                  border: "1.5px solid var(--pub-border)", cursor: "pointer",
                  padding: "7px 13px", background: "transparent",
                  color: "var(--pub-text-muted)", fontFamily: "inherit",
                  transition: "border-color .12s, color .12s",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M11 11l3-3-3-3M14 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* ── Tab Bar ─────────────────────────────────────────── */}
      <div className="profile-tab-bar">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`profile-tab-btn${activeTab === tab.id ? " active" : ""}`}
          >
            {tab.label}
            {tab.id === "payments" && hasPendingPayment && (
              <span style={{
                width: 18, height: 18, borderRadius: "50%",
                background: "var(--pub-badge-amber-bg)",
                color: "var(--pub-badge-amber-text)",
                fontSize: 10, fontWeight: 700,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}>{pendingInstallments.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════
          PROFILE TAB
      ══════════════════════════════════════════════════════ */}
      {activeTab === "profile" && (
        <div className="profile-tab-content">
          <ParentInfoCard user={user} />

          {/* ── Alternate Parent / Guardian ── */}
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "system-ui", marginBottom: 4 }}>Alternate Parent / Guardian</div>
            <div style={{ fontSize: 12, color: "var(--pub-text-muted)", marginBottom: 16 }}>
              Spouse, co-parent, or second guardian — additional email and contact info stored here.
            </div>
            <FamilyContactCard type="alternate_parent" contact={alternateParent} />
          </div>

          {/* ── Caregiver ── */}
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "system-ui", marginBottom: 4 }}>Caregiver</div>
            <div style={{ fontSize: 12, color: "var(--pub-text-muted)", marginBottom: 16 }}>
              Nanny, grandparent, or other regular caregiver. Can be designated as an authorized pickup person.
            </div>
            <FamilyContactCard type="caregiver" contact={caregiver} />
          </div>

          {/* ── Emergency Contacts ── */}
          <div style={{ marginTop: 28 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "system-ui" }}>Emergency Contacts</div>
              {!showAddEmergency && (
                <button
                  type="button"
                  onClick={() => setShowAddEmergency(true)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    fontSize: 11, fontWeight: 600, borderRadius: 7,
                    border: "1.5px solid var(--plum)", cursor: "pointer",
                    padding: "5px 11px", color: "var(--plum)",
                    background: "transparent", fontFamily: "inherit",
                  }}
                >
                  + Add Another
                </button>
              )}
            </div>
            <div style={{ fontSize: 12, color: "var(--pub-text-muted)", marginBottom: 16 }}>
              People to reach if you can&apos;t be contacted in an emergency.
            </div>

            {emergencyContacts.length === 0 && !showAddEmergency && (
              <FamilyContactCard
                type="emergency_contact"
                contact={null}
                prefillOptions={emergencyPrefillOptions}
              />
            )}

            {emergencyContacts.map((ec) => (
              <FamilyContactCard
                key={ec.id}
                type="emergency_contact"
                contact={ec}
                prefillOptions={emergencyPrefillOptions}
              />
            ))}

            {showAddEmergency && (
              <FamilyContactCard
                type="emergency_contact"
                contact={null}
                prefillOptions={emergencyPrefillOptions}
                defaultEditing
                onSaved={() => setShowAddEmergency(false)}
                onCancelNew={() => setShowAddEmergency(false)}
              />
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          DANCERS TAB
      ══════════════════════════════════════════════════════ */}
      {activeTab === "dancers" && (
        <div className="profile-tab-content">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "system-ui" }}>Dancers</div>
            <button
              onClick={() => setShowAddDancer(v => !v)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 11, fontWeight: 600, borderRadius: 7,
                border: "1.5px solid var(--plum)", cursor: "pointer",
                padding: "5px 11px", color: "var(--plum)",
                background: "transparent", fontFamily: "inherit",
                transition: "background .12s",
              }}
            >
              {showAddDancer ? "Cancel" : "+ Add Dancer"}
            </button>
          </div>
          <div style={{ fontSize: 12, color: "var(--pub-text-muted)", marginBottom: 16 }}>
            Dancer info is used to pre-fill registration forms and track enrollments.
          </div>

          {(dancers ?? []).length === 0 && !showAddDancer && (
            <div style={{
              background: "var(--pub-surface-warm)", border: "1px solid var(--pub-border)",
              borderRadius: 12, padding: 24, textAlign: "center",
              color: "var(--pub-text-faint)", fontSize: 14,
            }}>
              No dancers added yet.
            </div>
          )}

          {(dancers ?? []).map(dancer => (
            <DancerCard
              key={dancer.id}
              dancer={dancer}
              disciplines={disciplinesByDancer.get(dancer.id) ?? []}
              onViewRegistrations={() => setActiveTab("registrations")}
            />
          ))}

          {showAddDancer && (
            <div style={CARD_STYLE}>
              <div style={{
                padding: "14px 20px", background: "var(--pub-surface-warm)",
                borderBottom: "1px solid var(--pub-border-subtle)",
              }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Add a Dancer</div>
              </div>
              <div style={{ padding: 20 }}>
                <AddDancerForm
                  onSuccess={() => setShowAddDancer(false)}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          REGISTRATIONS TAB
      ══════════════════════════════════════════════════════ */}
      {activeTab === "registrations" && (
        <div className="profile-tab-content">
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, fontFamily: "system-ui" }}>My Registrations</div>
          <div style={{ fontSize: 12, color: "var(--pub-text-muted)", marginBottom: 20 }}>
            Current semester enrollments and waitlists.
          </div>

          {regsByDancer.every(({ regs }) => regs.length === 0) ? (
            <div style={{
              textAlign: "center", padding: "40px 24px",
              background: "var(--pub-surface)", border: "1px solid var(--pub-border)", borderRadius: 12,
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>No registrations yet</div>
              <div style={{ fontSize: 13, color: "var(--pub-text-muted)" }}>Your active class enrollments will appear here.</div>
            </div>
          ) : (
            regsByDancer.map(({ dancer, regs }) =>
              regs.length === 0 ? null : (
                <div key={dancer.id} style={{ marginBottom: 20 }}>
                  {/* Dancer section header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: "50%",
                      background: "var(--plum-50)", color: "var(--plum)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 700, flexShrink: 0,
                    }}>
                      {(dancer.first_name?.[0] ?? "").toUpperCase()}{(dancer.last_name?.[0] ?? "").toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{dancer.first_name} {dancer.last_name}</div>
                      <div style={{ fontSize: 11, color: "var(--pub-text-muted)" }}>
                        {regs.filter(r => r.status === "confirmed").length} active enrollment{regs.filter(r => r.status === "confirmed").length !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>

                  <div style={CARD_STYLE}>
                    <div style={{ padding: "14px 20px" }}>
                      {regs.map((reg, idx) => {
                        const cs = reg.class_meetings;
                        const cls = cs?.classes;
                        const isWaitlisted = reg.status === "waitlisted";
                        return (
                          <div key={reg.id} style={{
                            display: "flex", alignItems: "flex-start", gap: 14,
                            padding: "14px 0",
                            borderBottom: idx < regs.length - 1 ? "1px solid var(--pub-border-subtle)" : "none",
                            paddingTop: idx === 0 ? 0 : 14,
                          }}>
                            {/* Discipline color bar */}
                            <div style={{
                              width: 4, borderRadius: 2, flexShrink: 0,
                              alignSelf: "stretch", minHeight: 48,
                              background: getDisciplineColor(cls?.discipline ?? null),
                            }} />

                            {/* Info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                {cls?.name ?? "Class"}
                                {reg.tier_name && (
                                  <span style={{
                                    fontSize: 10, fontWeight: 700, letterSpacing: "0.3px",
                                    padding: "1px 7px", borderRadius: 99,
                                    background: "var(--plum-50)", color: "var(--plum-700)",
                                  }}>{reg.tier_name}</span>
                                )}
                              </div>
                              <div style={{
                                fontSize: 11, color: "var(--pub-text-muted)", marginTop: 3,
                                display: "flex", flexWrap: "wrap", gap: 8,
                              }}>
                                {cs && (
                                  <>
                                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                      <CalendarIcon />
                                      {(cs.days_of_week && cs.days_of_week.length > 0
                                        ? cs.days_of_week.map(formatDay).join(", ")
                                        : formatDay(cs.day_of_week))}{cs.start_time && cs.end_time ? ` · ${formatTime(cs.start_time)} – ${formatTime(cs.end_time)}` : ""}
                                    </span>
                                    {cs.location && (
                                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                        <LocationIcon />
                                        {cs.location}
                                      </span>
                                    )}
                                    {cs.instructor_name && <span>{cs.instructor_name}</span>}
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Status */}
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              {isWaitlisted
                                ? <Badge type="lavender" dot>Waitlisted</Badge>
                                : <Badge type="mint" dot>Active</Badge>
                              }
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )
            )
          )}

          <div style={{ textAlign: "center", paddingTop: 4, paddingBottom: 8 }}>
            <button style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 12, fontWeight: 600, borderRadius: 7,
              border: "1.5px solid var(--pub-border)", cursor: "pointer",
              padding: "7px 14px", background: "var(--pub-surface)",
              color: "var(--pub-text-primary)", fontFamily: "inherit",
            }}>
              View Past Semesters
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          PAYMENTS TAB
      ══════════════════════════════════════════════════════ */}
      {activeTab === "payments" && (
        <div className="profile-tab-content">
          {/* Outstanding balance card */}
          {totalOutstanding > 0 && (
            <>
              <div style={{
                background: "linear-gradient(135deg,var(--plum),var(--plum-700))",
                borderRadius: 12, padding: "20px 24px",
                color: "#fff", marginBottom: 16,
                display: "flex", alignItems: "center", gap: 20,
              }}>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.7px" }}>Outstanding Balance</div>
                  <div style={{ fontSize: 32, fontWeight: 700, fontFamily: "system-ui" }}>${totalOutstanding.toFixed(2)}</div>
                  {nextDueInstallment && (
                    <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                      Next installment due {formatLongDate(nextDueInstallment.due_date)}
                    </div>
                  )}
                </div>
              </div>

              {daysUntilDue !== null && daysUntilDue <= 14 && (
                <div style={{
                  display: "flex", gap: 10, alignItems: "flex-start",
                  padding: "12px 14px", borderRadius: 8,
                  border: "1px solid #F0CE8A",
                  background: "var(--pub-badge-amber-bg)",
                  color: "var(--pub-badge-amber-text)",
                  fontSize: 12, marginBottom: 16,
                }}>
                  <AlertIcon />
                  <div>
                    <strong>Payment due in {daysUntilDue} day{daysUntilDue !== 1 ? "s" : ""}.</strong>
                    {" "}Your {formatLongDate(nextDueInstallment!.due_date)} installment of ${Number(nextDueInstallment!.amount_due).toFixed(0)} is due soon.
                  </div>
                </div>
              )}
            </>
          )}

          {/* Batch cards */}
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, fontFamily: "system-ui" }}>
            Spring 2026 — Payment Plans
          </div>

          {validBatches.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "40px 24px",
              background: "var(--pub-surface)", border: "1px solid var(--pub-border)", borderRadius: 12,
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>No payment records</div>
              <div style={{ fontSize: 13, color: "var(--pub-text-muted)" }}>Your tuition payments will appear here after registration.</div>
            </div>
          ) : (
            validBatches.map(batch => {
              const installments = batch.order_payment_installments ?? [];
              const isPaidFull = installments.length > 0 && installments.every(i => i.status === "paid");
              const batchLabel = isPaidFull ? "Paid in Full" : (batch.payment_plan_type === "installments" ? "Installment Plan" : "Paid in Full");
              const batchBadgeType: BadgeType = isPaidFull ? "sage" : "plum";

              // Build descriptive title from registrations
              const batchRegs = batch.registrations ?? [];
              const classesByDancer = new Map<string, string[]>();
              for (const r of batchRegs) {
                const dn = r.dancers ? `${r.dancers.first_name} ${r.dancers.last_name}` : "Dancer";
                const cn = r.class_meetings?.classes?.name ?? "";
                if (!classesByDancer.has(dn)) classesByDancer.set(dn, []);
                if (cn && !classesByDancer.get(dn)!.includes(cn)) classesByDancer.get(dn)!.push(cn);
              }
              const titleParts = Array.from(classesByDancer.entries()).map(
                ([dn, cls]) => `${dn}${cls.length > 0 ? " — " + cls.join(" & ") : ""}`
              );
              const batchTitle = titleParts.length > 0
                ? titleParts.join(" · ")
                : (batch.semesters?.name ?? "Registration");

              return (
                <div key={batch.id} style={{ ...CARD_STYLE, marginBottom: 14 }}>
                  <div style={{
                    padding: "14px 20px", background: "var(--pub-surface-warm)",
                    borderBottom: "1px solid var(--pub-border-subtle)",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{batchTitle}</div>
                      <div style={{ fontSize: 12, color: "var(--pub-text-muted)", marginTop: 1 }}>
                        {installments.length > 1 ? `${installments.length}-installment plan` : "Full payment"} · ${Number(batch.grand_total ?? 0).toFixed(0)} total
                      </div>
                    </div>
                    <Badge type={batchBadgeType}>{batchLabel}</Badge>
                  </div>
                  <div style={{ padding: 20 }}>
                    {installments.map(inst => {
                      const isPaid = inst.status === "paid";
                      const isDue = inst.status === "pending" || inst.status === "due";
                      return (
                        <div key={inst.id} style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "10px 14px",
                          border: isDue ? "1.5px solid var(--pub-badge-amber-text)" : "1px solid var(--pub-border-subtle)",
                          borderRadius: 8,
                          background: isDue ? "var(--pub-badge-amber-bg)" : "var(--pub-surface)",
                          marginBottom: 6,
                        }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: "50%",
                            border: "2px solid var(--pub-border)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, fontWeight: 700, flexShrink: 0,
                            ...(isPaid ? { background: "var(--plum-50)", borderColor: "var(--plum-200)", color: "var(--plum)" } : {}),
                            ...(isDue ? { background: "var(--pub-badge-amber-bg)", borderColor: "var(--pub-badge-amber-text)", color: "var(--pub-badge-amber-text)" } : {}),
                          }}>
                            {isPaid ? "✓" : inst.installment_number}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: isDue ? 700 : 500 }}>
                              {installments.length === 1
                                ? "Full Payment"
                                : `Installment ${inst.installment_number}${isDue ? " — Due" : ""}`}
                            </div>
                            <div style={{
                              fontSize: 11,
                              color: isDue ? "var(--pub-badge-amber-text)" : "var(--pub-text-muted)",
                              fontWeight: isDue ? 600 : 400,
                            }}>
                              {isPaid && inst.paid_at
                                ? `Paid ${formatLongDate(inst.paid_at)}`
                                : `Due ${formatLongDate(inst.due_date)}`}
                            </div>
                          </div>
                          <div style={{
                            fontSize: 14, fontWeight: 700, fontFamily: "system-ui",
                            color: isPaid ? "var(--pub-badge-sage-text)" : undefined,
                          }}>
                            ${Number(inst.amount_due).toFixed(2)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}

          {/* Payment history */}
          {paidInstallments.length > 0 && (
            <>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, fontFamily: "system-ui" }}>Payment History</div>
              <div style={CARD_STYLE}>
                <div style={{ padding: 20 }}>
                  {paidInstallments.slice(0, 5).map((inst, idx) => (
                    <div key={inst.id} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "10px 0",
                      borderBottom: idx < Math.min(paidInstallments.length, 5) - 1 ? "1px solid var(--pub-border-subtle)" : "none",
                    }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: 7,
                        background: "var(--pub-badge-sage-bg)",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}>
                        <CheckIcon />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>Payment</div>
                        <div style={{ fontSize: 11, color: "var(--pub-text-muted)" }}>
                          {inst.paid_at ? formatLongDate(inst.paid_at) : ""}
                        </div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--pub-badge-sage-text)" }}>
                        −${Number(inst.amount_due).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
                {paidInstallments.length > 5 && (
                  <div style={{ padding: "10px 20px", borderTop: "1px solid var(--pub-border-subtle)", background: "var(--pub-surface-warm)", textAlign: "center" }}>
                    <button style={{ fontSize: 12, color: "var(--pub-text-muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                      View All Transactions
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          NOTIFICATIONS TAB
      ══════════════════════════════════════════════════════ */}
      {activeTab === "notifications" && (
        <div className="profile-tab-content">
          {/* SMS section */}
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, fontFamily: "system-ui" }}>SMS Notifications</div>
          <div style={{ marginBottom: 20 }}>
            <SmsOptInCard user={user} />
          </div>
        </div>
      )}

    </div>
  );
};

/* ── keep helper exports accessible if needed elsewhere ──── */
export { formatDisciplineLabel };
