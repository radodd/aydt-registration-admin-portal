"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@/types";
import {
  updateUserProfile,
  type UpdateUserProfileInput,
} from "./actions/updateUserProfile";
import { formatPhone } from "@/utils/formatPhone";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

interface ParentInfoCardProps {
  user: User;
}

export function ParentInfoCard({ user }: ParentInfoCardProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<UpdateUserProfileInput>({
    first_name: user.first_name ?? "",
    last_name: user.last_name ?? "",
    phone_number: user.phone_number ?? "",
    address_line1: user.address_line1 ?? "",
    address_line2: user.address_line2 ?? "",
    city: user.city ?? "",
    state: user.state ?? "",
    zipcode: user.zipcode ?? "",
  });

  function set(field: keyof UpdateUserProfileInput, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setError(null);
    // Required field validation
    if (!form.first_name.trim()) return setError("First name is required.");
    if (!form.last_name.trim()) return setError("Last name is required.");
    if (!form.address_line1.trim()) return setError("Street address is required.");
    if (!form.city.trim()) return setError("City is required.");
    if (!form.state.trim()) return setError("State is required.");
    if (!form.zipcode.trim()) return setError("ZIP code is required.");

    setSaving(true);
    try {
      await updateUserProfile(form);
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
      first_name: user.first_name ?? "",
      last_name: user.last_name ?? "",
      phone_number: user.phone_number ?? "",
      address_line1: user.address_line1 ?? "",
      address_line2: user.address_line2 ?? "",
      city: user.city ?? "",
      state: user.state ?? "",
      zipcode: user.zipcode ?? "",
    });
    setError(null);
    setEditing(false);
  }

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
  const readonlyStyle: React.CSSProperties = {
    ...inputStyle,
    background: "var(--pub-surface-warm)",
    color: "var(--pub-text-muted)",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600,
    color: "var(--pub-text-primary)",
    marginBottom: 4, display: "block",
  };

  return (
    <>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "system-ui" }}>Parent / Guardian Info</div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={{
              fontSize: 12, fontWeight: 600, color: "var(--wine)",
              background: "none", border: "none", cursor: "pointer",
              fontFamily: "inherit", padding: "6px 10px",
            }}
          >
            Edit
          </button>
        )}
      </div>
      <div style={{ fontSize: 12, color: "var(--pub-text-muted)", marginBottom: 16 }}>
        Used to pre-fill registration forms.{" "}
        <span style={{ color: "var(--pub-text-faint)", fontSize: 12 }}>Email cannot be changed here.</span>
      </div>

      {/* Card */}
      <div style={{
        background: "var(--pub-surface)",
        border: "1px solid var(--pub-border)",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "var(--pub-shadow-card)",
        marginBottom: 0,
      }}>
        <div style={{ padding: 20 }}>
          {error && (
            <div style={{
              marginBottom: 14, background: "#FFF0EE", border: "1px solid #F0D0CE",
              color: "var(--wine)", fontSize: 12, borderRadius: 7, padding: "10px 14px",
            }}>
              {error}
            </div>
          )}

          {/* First / Last */}
          <div className="profile-grid-2" style={{ marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>First Name</label>
              <input
                type="text"
                value={form.first_name}
                onChange={(e) => set("first_name", e.target.value)}
                readOnly={!editing}
                style={editing ? inputStyle : readonlyStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Last Name</label>
              <input
                type="text"
                value={form.last_name}
                onChange={(e) => set("last_name", e.target.value)}
                readOnly={!editing}
                style={editing ? inputStyle : readonlyStyle}
              />
            </div>
          </div>

          {/* Email */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Email Address</label>
            <input type="email" value={user.email} readOnly style={readonlyStyle} />
            <span style={{ fontSize: 11, color: "var(--pub-text-faint)" }}>Email cannot be changed here.</span>
          </div>

          {/* Phone */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Phone Number</label>
            <input
              type="tel"
              value={form.phone_number}
              onChange={(e) => set("phone_number", formatPhone(e.target.value))}
              readOnly={!editing}
              placeholder="(555) 555-5555"
              style={editing ? inputStyle : readonlyStyle}
            />
          </div>

          {/* Street Address */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Street Address {editing && <span style={{ color: "var(--wine)" }}>*</span>}</label>
            <input
              type="text"
              value={form.address_line1}
              onChange={(e) => set("address_line1", e.target.value)}
              readOnly={!editing}
              placeholder="123 Main St"
              style={editing ? inputStyle : readonlyStyle}
            />
          </div>

          {/* Apt/Unit (only in edit mode) */}
          {editing && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>
                Apt / Suite / Unit <span style={{ color: "var(--pub-text-faint)", fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                type="text"
                value={form.address_line2}
                onChange={(e) => set("address_line2", e.target.value)}
                placeholder="Apt 4B"
                style={inputStyle}
              />
            </div>
          )}

          {/* City / State / ZIP */}
          <div className="profile-grid-3" style={{ marginBottom: editing ? 14 : 0 }}>
            <div>
              <label style={labelStyle}>City {editing && <span style={{ color: "var(--wine)" }}>*</span>}</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                readOnly={!editing}
                style={editing ? inputStyle : readonlyStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>State {editing && <span style={{ color: "var(--wine)" }}>*</span>}</label>
              {editing ? (
                <select
                  value={form.state}
                  onChange={(e) => set("state", e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="">— Select —</option>
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <input type="text" value={form.state} readOnly style={readonlyStyle} />
              )}
            </div>
            <div>
              <label style={labelStyle}>ZIP Code {editing && <span style={{ color: "var(--wine)" }}>*</span>}</label>
              <input
                type="text"
                value={form.zipcode}
                onChange={(e) => set("zipcode", e.target.value)}
                readOnly={!editing}
                maxLength={10}
                style={editing ? inputStyle : readonlyStyle}
              />
            </div>
          </div>

          {/* Save / Cancel buttons */}
          {editing && (
            <div style={{ display: "flex", gap: 8, paddingTop: 6 }}>
              <button
                type="button"
                onClick={handleCancel}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 7,
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
                  flex: 1, padding: "8px 0", borderRadius: 7,
                  border: "1.5px solid var(--plum)",
                  background: "var(--plum)", color: "#fff",
                  fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
