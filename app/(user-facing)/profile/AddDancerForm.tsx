"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addDancer } from "./actions/addDancer";
import { formatPhone } from "@/utils/formatPhone";

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

const optionalLabel: React.CSSProperties = {
  color: "var(--pub-text-faint)",
  fontWeight: 400,
};

export default function AddDancerForm({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [grade, setGrade] = useState("");
  const [secondaryEmail, setSecondaryEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [school, setSchool] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;

    setIsSubmitting(true);
    setErrorMsg("");

    const result = await addDancer({
      first_name: firstName,
      last_name: lastName,
      birth_date: birthDate || undefined,
      grade: grade || undefined,
      secondary_email: secondaryEmail || undefined,
      phone_number: phone || undefined,
      school: school || undefined,
    });

    setIsSubmitting(false);

    if (result.error) {
      setErrorMsg(result.error);
      return;
    }

    router.refresh();
    onSuccess?.();
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Error */}
      {errorMsg && (
        <div style={{
          marginBottom: 14, background: "#FFF0EE", border: "1px solid #F0D0CE",
          color: "var(--wine)", fontSize: 12, borderRadius: 7, padding: "10px 14px",
        }}>
          {errorMsg}
        </div>
      )}

      {/* Name */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>
            First Name <span style={{ color: "var(--wine)" }}>*</span>
          </label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>
            Last Name <span style={{ color: "var(--wine)" }}>*</span>
          </label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            style={inputStyle}
          />
        </div>
      </div>

      {/* Birth date + Grade */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Date of Birth</label>
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>
            Grade <span style={optionalLabel}>(optional)</span>
          </label>
          <input
            type="text"
            placeholder="e.g. 5 or K"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      {/* School */}
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>
          School <span style={optionalLabel}>(optional)</span>
        </label>
        <input
          type="text"
          placeholder="Lincoln Elementary"
          value={school}
          onChange={(e) => setSchool(e.target.value)}
          style={inputStyle}
        />
      </div>

      {/* Divider — student contact fields */}
      <div style={{
        borderTop: "1px solid var(--pub-border-subtle)",
        margin: "16px 0 12px",
        paddingTop: 14,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--pub-text-faint)", marginBottom: 10 }}>
          Student Contact Info <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional — for older students)</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Student Email</label>
            <input
              type="email"
              placeholder="student@example.com"
              value={secondaryEmail}
              onChange={(e) => setSecondaryEmail(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Student Phone</label>
            <input
              type="tel"
              placeholder="(555) 555-5555"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* Submit */}
      <div style={{ paddingTop: 6 }}>
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            padding: "8px 20px",
            borderRadius: 7,
            border: "1.5px solid var(--plum)",
            background: "var(--plum)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            cursor: isSubmitting ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            opacity: isSubmitting ? 0.6 : 1,
          }}
        >
          {isSubmitting ? "Adding…" : "Add Dancer"}
        </button>
      </div>
    </form>
  );
}
