"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Dancer } from "@/types";
import { updateDancer } from "./actions/updateDancer";
import { formatPhone } from "@/utils/formatPhone";

interface DancerCardProps {
  dancer: Dancer;
  disciplines?: string[];
  onViewRegistrations?: () => void;
}

function getAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const today = new Date();
  const dob = new Date(birthDate + "T00:00:00");
  let age = today.getFullYear() - dob.getFullYear();
  if (
    today.getMonth() < dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())
  ) age--;
  return age;
}

function formatDOB(birthDate: string | null): string {
  if (!birthDate) return "";
  const d = new Date(birthDate + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

const DISCIPLINE_LABELS: Record<string, string> = {
  ballet: "Ballet", jazz: "Jazz", hip_hop: "Hip Hop",
  contemporary: "Contemporary", tap: "Tap", lyrical: "Lyrical",
  broadway: "Broadway", technique: "Technique", pointe: "Pointe", acro: "Acro",
};

/* ── Toggle switch ───────────────────────────────────────────── */

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
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

/* ── Shared input styles ─────────────────────────────────────── */

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  border: "1.5px solid var(--pub-border)",
  borderRadius: 7,
  fontFamily: "inherit",
  fontSize: 13,
  color: "var(--pub-text-primary)",
  background: "var(--pub-surface)",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600,
  color: "var(--pub-text-primary)",
  marginBottom: 4, display: "block",
};

const optionalLabel: React.CSSProperties = {
  color: "var(--pub-text-faint)",
  fontWeight: 400,
};

const sectionDivider: React.CSSProperties = {
  borderTop: "1px solid var(--pub-border-subtle)",
  margin: "14px 0 12px",
  paddingTop: 12,
};

const sectionHeading: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.6px", color: "var(--pub-text-faint)", marginBottom: 10,
};

export function DancerCard({ dancer, disciplines = [], onViewRegistrations }: DancerCardProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    first_name: dancer.first_name ?? "",
    last_name: dancer.last_name ?? "",
    birth_date: dancer.birth_date ?? "",
    grade: dancer.grade ?? "",
    school: dancer.school ?? "",
    secondary_email: dancer.secondary_email ?? "",
    phone_number: dancer.phone_number ?? "",
    is_student_contact_priority: dancer.is_student_contact_priority ?? false,
  });

  function set(field: keyof typeof form, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateDancer({ id: dancer.id, ...form });
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setForm({
      first_name: dancer.first_name ?? "",
      last_name: dancer.last_name ?? "",
      birth_date: dancer.birth_date ?? "",
      grade: dancer.grade ?? "",
      school: dancer.school ?? "",
      secondary_email: dancer.secondary_email ?? "",
      phone_number: dancer.phone_number ?? "",
      is_student_contact_priority: dancer.is_student_contact_priority ?? false,
    });
    setError(null);
    setEditing(false);
  }

  const initials = `${dancer.first_name?.[0] ?? ""}${dancer.last_name?.[0] ?? ""}`.toUpperCase();
  const age = getAge(dancer.birth_date);

  /* ── Metadata pills for view mode ── */
  const metaPills = [
    age !== null ? `Age ${age}` : null,
    dancer.grade ? `Grade ${dancer.grade}` : null,
    dancer.school ?? null,
  ].filter(Boolean) as string[];

  /* ── Student contact info for view mode ── */
  const hasStudentContact = !!(dancer.secondary_email || dancer.phone_number);

  return (
    <div style={{
      background: "var(--pub-surface)",
      border: "1px solid var(--pub-border)",
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: "var(--pub-shadow-card)",
      marginBottom: 10,
    }}>
      {/* ── Card header row ── */}
      <div style={{ padding: "14px 16px 12px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          {/* Avatar */}
          <div style={{
            width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
            background: "var(--plum-50)", color: "var(--plum)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700, marginTop: 1,
          }}>
            {initials}
          </div>

          {/* Name + meta */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>
                {dancer.first_name} {dancer.last_name}
              </div>
              {dancer.is_student_contact_priority && (
                <span style={{
                  padding: "2px 7px", borderRadius: 999, fontSize: 10, fontWeight: 700,
                  background: "var(--plum-50)", color: "var(--plum-700)",
                  border: "1px solid var(--plum-100)",
                }}>
                  Student Contact
                </span>
              )}
            </div>

            {/* Metadata pills */}
            {metaPills.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: dancer.birth_date ? 4 : 0 }}>
                {metaPills.map((pill) => (
                  <span key={pill} style={{
                    padding: "2px 8px", borderRadius: 999,
                    fontSize: 11, fontWeight: 600,
                    background: "var(--pub-surface-warm)",
                    color: "var(--pub-text-muted)",
                    border: "1px solid var(--pub-border-subtle)",
                  }}>
                    {pill}
                  </span>
                ))}
              </div>
            )}

            {/* DOB */}
            {dancer.birth_date && (
              <div style={{ fontSize: 11, color: "var(--pub-text-faint)", marginTop: 2 }}>
                DOB {formatDOB(dancer.birth_date)}
              </div>
            )}

            {/* Discipline chips */}
            {disciplines.length > 0 && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                {disciplines.map(d => (
                  <span key={d} style={{
                    padding: "2px 8px", borderRadius: 999,
                    fontSize: 11, fontWeight: 600,
                    background: "var(--plum-50)", color: "var(--plum-700)",
                    border: "1px solid var(--plum-100)",
                  }}>
                    {DISCIPLINE_LABELS[d] ?? d}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Action buttons */}
          {!editing && (
            <div style={{ display: "flex", gap: 5, flexShrink: 0, marginTop: 1 }}>
              {onViewRegistrations && (
                <button
                  type="button"
                  onClick={onViewRegistrations}
                  title="View Classes"
                  style={{
                    width: 30, height: 30, borderRadius: 8, fontSize: 11, fontWeight: 600,
                    border: "1.5px solid var(--pub-border)",
                    background: "var(--pub-surface)", color: "var(--pub-text-muted)",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "border-color .12s, color .12s",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--plum-200)";
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--plum)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--pub-border)";
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--pub-text-muted)";
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="4" width="18" height="18" rx="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditing(true)}
                title="Edit dancer"
                style={{
                  width: 30, height: 30, borderRadius: 8, fontSize: 11, fontWeight: 600,
                  border: "1.5px solid var(--pub-border)",
                  background: "var(--pub-surface)", color: "var(--pub-text-muted)",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "border-color .12s, color .12s",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--plum-200)";
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--plum)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--pub-border)";
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--pub-text-muted)";
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Student contact info row (view mode, only when not editing) */}
        {hasStudentContact && !editing && (
          <div style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: "1px solid var(--pub-border-subtle)",
            display: "flex", flexWrap: "wrap", gap: "4px 16px",
          }}>
            {dancer.secondary_email && (
              <span style={{ fontSize: 11, color: "var(--pub-text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.6 }}>
                  <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M1 5l7 5 7-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                {dancer.secondary_email}
              </span>
            )}
            {dancer.phone_number && (
              <span style={{ fontSize: 11, color: "var(--pub-text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.6 }}>
                  <path d="M3 2h3l1.5 3.5L6 7s1 2 3 3l1.5-1.5L14 10v3c0 .5-.5 1-1 1C5 13.5 2 6.5 2 3c0-.5.5-1 1-1z" stroke="currentColor" strokeWidth="1.4"/>
                </svg>
                {dancer.phone_number}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Inline edit form ── */}
      {editing && (
        <div style={{
          padding: "16px",
          borderTop: "1px solid var(--pub-border-subtle)",
          background: "var(--pub-surface-warm)",
        }}>
          {error && (
            <div style={{
              marginBottom: 12, background: "#FFF0EE", border: "1px solid #F0D0CE",
              color: "var(--wine)", fontSize: 12, borderRadius: 7, padding: "8px 12px",
            }}>
              {error}
            </div>
          )}

          {/* — Basic Info — */}
          <div style={sectionHeading}>Basic Info</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>First Name</label>
              <input type="text" value={form.first_name} onChange={(e) => set("first_name", e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Last Name</label>
              <input type="text" value={form.last_name} onChange={(e) => set("last_name", e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Date of Birth</label>
              <input type="date" value={form.birth_date} onChange={(e) => set("birth_date", e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Grade <span style={optionalLabel}>(optional)</span></label>
              <input type="text" placeholder="e.g. 5 or K" value={form.grade} onChange={(e) => set("grade", e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: 0 }}>
            <label style={labelStyle}>School <span style={optionalLabel}>(optional)</span></label>
            <input type="text" placeholder="Lincoln Elementary" value={form.school} onChange={(e) => set("school", e.target.value)} style={inputStyle} />
          </div>

          {/* — Student Account — */}
          <div style={sectionDivider}>
            <div style={sectionHeading}>Student Account</div>
            <div style={{ fontSize: 12, color: "var(--pub-text-muted)", marginBottom: 12 }}>
              For older students who manage their own communications.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Student Email <span style={optionalLabel}>(optional)</span></label>
                <input
                  type="email"
                  placeholder="student@example.com"
                  value={form.secondary_email}
                  onChange={(e) => set("secondary_email", e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Student Phone <span style={optionalLabel}>(optional)</span></label>
                <input
                  type="tel"
                  placeholder="(555) 555-5555"
                  value={form.phone_number}
                  onChange={(e) => set("phone_number", formatPhone(e.target.value))}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "12px 14px",
              background: "var(--plum-50)",
              border: "1px solid var(--plum-100)",
              borderRadius: 8,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pub-text-primary)" }}>
                  Student is primary contact
                </div>
                <div style={{ fontSize: 12, color: "var(--pub-text-muted)", marginTop: 2, lineHeight: 1.5 }}>
                  When enabled, the student&#39;s email and phone are prioritized over the parent&#39;s for non-emergency communications.
                </div>
              </div>
              <ToggleSwitch
                checked={form.is_student_contact_priority}
                onChange={(v) => set("is_student_contact_priority", v)}
              />
            </div>
          </div>

          {/* Save / Cancel */}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button
              type="button"
              onClick={handleCancel}
              style={{
                flex: 1, padding: "7px 0", borderRadius: 7,
                border: "1.5px solid var(--pub-border)",
                background: "var(--pub-surface)", color: "var(--pub-text-muted)",
                fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                flex: 1, padding: "7px 0", borderRadius: 7,
                border: "1.5px solid var(--plum)",
                background: "var(--plum)", color: "#fff",
                fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
