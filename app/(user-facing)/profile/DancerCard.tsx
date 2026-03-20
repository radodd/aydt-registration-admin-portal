"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Dancer } from "@/types";
import { updateDancer } from "./actions/updateDancer";

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
  });

  function set(field: keyof typeof form, value: string) {
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
    });
    setError(null);
    setEditing(false);
  }

  const initials = `${dancer.first_name?.[0] ?? ""}${dancer.last_name?.[0] ?? ""}`.toUpperCase();
  const age = getAge(dancer.birth_date);

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

  return (
    <div style={{
      background: "var(--pub-surface)",
      border: "1px solid var(--pub-border)",
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: "var(--pub-shadow-card)",
      marginBottom: 10,
    }}>
      <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
        {/* Avatar */}
        <div style={{
          width: 46, height: 46, borderRadius: "50%", flexShrink: 0,
          background: "var(--plum-50)", color: "var(--plum)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, fontWeight: 700,
        }}>
          {initials}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {dancer.first_name} {dancer.last_name}
          </div>
          <div style={{ fontSize: 12, color: "var(--pub-text-muted)", marginTop: 2 }}>
            {[
              age !== null ? `Age ${age}` : null,
              dancer.grade ? `Grade ${dancer.grade}` : null,
              dancer.birth_date ? `DOB ${formatDOB(dancer.birth_date)}` : null,
            ].filter(Boolean).join(" · ")}
          </div>
          {disciplines.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {disciplines.map(d => (
                <span key={d} style={{
                  padding: "3px 9px", borderRadius: 999,
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

        {/* Actions */}
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {!editing && (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                style={{
                  padding: "8px 16px", borderRadius: 9, fontSize: 12, fontWeight: 600,
                  border: "none", background: "transparent",
                  color: "var(--pub-text-muted)", cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Edit
              </button>
              {onViewRegistrations && (
                <button
                  type="button"
                  onClick={onViewRegistrations}
                  style={{
                    padding: "8px 16px", borderRadius: 9, fontSize: 12, fontWeight: 600,
                    border: "1.5px solid var(--pub-border)",
                    background: "var(--pub-surface)", color: "var(--pub-text-primary)",
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  View Classes
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Inline edit form */}
      {editing && (
        <div style={{
          padding: "16px 20px",
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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>First Name</label>
              <input
                type="text"
                value={form.first_name}
                onChange={(e) => set("first_name", e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Last Name</label>
              <input
                type="text"
                value={form.last_name}
                onChange={(e) => set("last_name", e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Date of Birth</label>
              <input
                type="date"
                value={form.birth_date}
                onChange={(e) => set("birth_date", e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Grade</label>
              <input
                type="text"
                placeholder="e.g. 5 or K"
                value={form.grade}
                onChange={(e) => set("grade", e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
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
