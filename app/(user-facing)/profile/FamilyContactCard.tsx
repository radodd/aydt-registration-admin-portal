"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FamilyContact, FamilyContactType } from "@/types";
import {
  upsertFamilyContact,
  deleteFamilyContact,
  type UpsertFamilyContactInput,
} from "./actions/upsertFamilyContact";
import { formatPhone } from "@/utils/formatPhone";

/* ── Config per contact type ─────────────────────────────────── */

const TYPE_META: Record<
  FamilyContactType,
  { label: string; description: string; showPickup: boolean }
> = {
  emergency_contact: {
    label: "Emergency Contact",
    description: "Person to reach if you can't be contacted.",
    showPickup: false,
  },
  alternate_parent: {
    label: "Alternate Parent / Guardian",
    description: "Spouse, co-parent, or second guardian on the account.",
    showPickup: false,
  },
  caregiver: {
    label: "Caregiver",
    description: "Nanny, grandparent, or other regular caregiver.",
    showPickup: true,
  },
};

/* ── Shared styles ───────────────────────────────────────────── */

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
  fontSize: 12,
  fontWeight: 600,
  color: "var(--pub-text-primary)",
  marginBottom: 4,
  display: "block",
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
        position: "relative",
        width: 38,
        height: 22,
        flexShrink: 0,
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <div style={{
        position: "absolute",
        inset: 0,
        borderRadius: 11,
        background: checked ? "var(--plum)" : "var(--pub-border)",
        transition: "background .2s",
      }} />
      <div style={{
        position: "absolute",
        top: 3,
        left: checked ? 19 : 3,
        width: 16,
        height: 16,
        borderRadius: "50%",
        background: "#fff",
        transition: "left .2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
      }} />
    </div>
  );
}

/* ── Read-only field display ─────────────────────────────────── */

function InfoRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--pub-text-faint)", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: "var(--pub-text-primary)" }}>{value}</div>
    </div>
  );
}

/* ── Types ───────────────────────────────────────────────────── */

export type PrefillOption = {
  label: string;
  data: {
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    email?: string | null;
    relationship?: string | null;
  };
};

type FormState = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  relationship: string;
  is_authorized_pickup: boolean;
  notes: string;
};

function makeForm(contact?: FamilyContact | null): FormState {
  return {
    first_name: contact?.first_name ?? "",
    last_name: contact?.last_name ?? "",
    phone: contact?.phone ?? "",
    email: contact?.email ?? "",
    relationship: contact?.relationship ?? "",
    is_authorized_pickup: contact?.is_authorized_pickup ?? false,
    notes: contact?.notes ?? "",
  };
}

/* ── Main component ──────────────────────────────────────────── */

interface FamilyContactCardProps {
  type: FamilyContactType;
  contact?: FamilyContact | null;
  /** Pre-fill chips shown at the top of the edit form */
  prefillOptions?: PrefillOption[];
  /** Start the card in edit mode (for new blank cards) */
  defaultEditing?: boolean;
  /** Called after a successful save when defaultEditing is true */
  onSaved?: () => void;
  /** Called when user cancels a new blank card */
  onCancelNew?: () => void;
}

export function FamilyContactCard({
  type,
  contact,
  prefillOptions,
  defaultEditing = false,
  onSaved,
  onCancelNew,
}: FamilyContactCardProps) {
  const router = useRouter();
  const meta = TYPE_META[type];

  const [editing, setEditing] = useState(defaultEditing);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => makeForm(contact));

  function set(field: keyof FormState, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handlePrefill(option: PrefillOption) {
    setForm((prev) => ({
      ...prev,
      first_name: option.data.first_name ?? prev.first_name,
      last_name: option.data.last_name ?? prev.last_name,
      phone: option.data.phone ?? prev.phone,
      email: option.data.email ?? prev.email,
      relationship: option.data.relationship ?? prev.relationship,
    }));
  }

  function handleEdit() {
    setForm(makeForm(contact));
    setError(null);
    setEditing(true);
  }

  function handleCancel() {
    if (defaultEditing && onCancelNew) {
      onCancelNew();
      return;
    }
    setForm(makeForm(contact));
    setError(null);
    setEditing(false);
  }

  async function handleSave() {
    setError(null);
    if (!form.first_name.trim() && !form.last_name.trim()) {
      setError("Please enter at least a first or last name.");
      return;
    }

    setSaving(true);
    const input: UpsertFamilyContactInput = {
      id: contact?.id,
      type,
      first_name: form.first_name,
      last_name: form.last_name,
      phone: form.phone,
      email: form.email,
      relationship: form.relationship,
      is_authorized_pickup: form.is_authorized_pickup,
      notes: form.notes,
    };

    const result = await upsertFamilyContact(input);
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setEditing(false);
    router.refresh();
    onSaved?.();
  }

  async function handleDelete() {
    if (!contact?.id) return;
    if (!confirm(`Remove this ${meta.label.toLowerCase()}?`)) return;

    setDeleting(true);
    const result = await deleteFamilyContact(contact.id);
    setDeleting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.refresh();
  }

  const hasContact = !!contact;
  const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ");

  return (
    <div style={{
      background: "var(--pub-surface)",
      border: "1px solid var(--pub-border)",
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: "var(--pub-shadow-card)",
      marginBottom: 10,
    }}>
      {/* ── Card header ── */}
      <div style={{
        padding: "14px 16px",
        background: "var(--pub-surface-warm)",
        borderBottom: "1px solid var(--pub-border-subtle)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{meta.label}</div>
          {!hasContact && !editing && (
            <div style={{ fontSize: 12, color: "var(--pub-text-muted)", marginTop: 2 }}>
              {meta.description}
            </div>
          )}
          {hasContact && !editing && (
            <div style={{ fontSize: 12, color: "var(--pub-text-muted)", marginTop: 2 }}>
              {contactName || "—"}
              {contact?.relationship ? ` · ${contact.relationship}` : ""}
            </div>
          )}
        </div>

        {/* Action buttons */}
        {!editing && (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {hasContact && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                title="Remove"
                style={{
                  width: 28, height: 28, borderRadius: 7,
                  border: "1.5px solid var(--pub-border)",
                  background: "var(--pub-surface)", color: "var(--pub-text-faint)",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  opacity: deleting ? 0.5 : 1,
                }}
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={handleEdit}
              style={{
                padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600,
                border: "1.5px solid var(--plum)",
                background: hasContact ? "transparent" : "var(--plum)",
                color: hasContact ? "var(--plum)" : "#fff",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {hasContact ? "Edit" : "+ Add"}
            </button>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ padding: "16px" }}>
        {/* Error */}
        {error && (
          <div style={{
            marginBottom: 12, background: "#FFF0EE", border: "1px solid #F0D0CE",
            color: "var(--wine)", fontSize: 12, borderRadius: 7, padding: "8px 12px",
          }}>
            {error}
          </div>
        )}

        {/* Empty state */}
        {!hasContact && !editing && (
          <div style={{ fontSize: 13, color: "var(--pub-text-faint)", textAlign: "center", padding: "8px 0" }}>
            No {meta.label.toLowerCase()} added yet.
          </div>
        )}

        {/* Read view */}
        {hasContact && !editing && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
            <InfoRow label="Name" value={contactName || null} />
            <InfoRow label="Relationship" value={contact?.relationship ?? null} />
            <InfoRow label="Phone" value={contact?.phone ?? null} />
            <InfoRow label="Email" value={contact?.email ?? null} />
            {contact?.notes && (
              <div style={{ gridColumn: "span 2" }}>
                <InfoRow label="Notes" value={contact.notes} />
              </div>
            )}
            {meta.showPickup && (
              <div style={{ gridColumn: "span 2", display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: contact?.is_authorized_pickup ? "#1A5C16" : "var(--pub-text-faint)",
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 12, color: contact?.is_authorized_pickup ? "#1A5C16" : "var(--pub-text-faint)" }}>
                  {contact?.is_authorized_pickup ? "Authorized for pickup" : "Not authorized for pickup"}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Edit form */}
        {editing && (
          <>
            {/* Quick-fill chips */}
            {prefillOptions && prefillOptions.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: "var(--pub-text-faint)",
                  textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6,
                }}>
                  Quick fill from
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {prefillOptions.map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => handlePrefill(opt)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "5px 11px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                        border: "1.5px solid var(--plum-200)",
                        background: "var(--plum-50)", color: "var(--plum-700)",
                        cursor: "pointer", fontFamily: "inherit",
                        transition: "background .12s, border-color .12s",
                      }}
                    >
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                        <path d="M8 1v14M1 8h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Name */}
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

            {/* Relationship */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>
                Relationship{" "}
                <span style={{ color: "var(--pub-text-faint)", fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                type="text"
                placeholder={
                  type === "emergency_contact"
                    ? "e.g. Grandmother, Family Friend"
                    : type === "alternate_parent"
                    ? "e.g. Father, Stepmother"
                    : "e.g. Nanny, Grandparent"
                }
                value={form.relationship}
                onChange={(e) => set("relationship", e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* Phone + Email */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Phone</label>
                <input
                  type="tel"
                  placeholder="(555) 555-5555"
                  value={form.phone}
                  onChange={(e) => set("phone", formatPhone(e.target.value))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>
                  Email{" "}
                  <span style={{ color: "var(--pub-text-faint)", fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  type="email"
                  placeholder="contact@example.com"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Authorized pickup toggle (caregivers only) */}
            {meta.showPickup && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                padding: "12px 14px",
                background: "var(--plum-50)",
                border: "1px solid var(--plum-100)",
                borderRadius: 8,
                marginBottom: 12,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pub-text-primary)" }}>
                    Authorized for pickup
                  </div>
                  <div style={{ fontSize: 12, color: "var(--pub-text-muted)", marginTop: 2, lineHeight: 1.5 }}>
                    This caregiver may pick up the dancer from class.
                  </div>
                </div>
                <ToggleSwitch
                  checked={form.is_authorized_pickup}
                  onChange={(v) => set("is_authorized_pickup", v)}
                />
              </div>
            )}

            {/* Notes */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>
                Notes{" "}
                <span style={{ color: "var(--pub-text-faint)", fontWeight: 400 }}>(optional)</span>
              </label>
              <textarea
                rows={2}
                placeholder="Any additional info…"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
              />
            </div>

            {/* Save / Cancel */}
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
          </>
        )}
      </div>
    </div>
  );
}
