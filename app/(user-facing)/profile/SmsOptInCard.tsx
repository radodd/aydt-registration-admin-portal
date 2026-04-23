"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@/types";
import { sendPhoneVerification } from "@/app/actions/sendPhoneVerification";
import { confirmPhoneVerification } from "@/app/actions/confirmPhoneVerification";
import { smsOptOut } from "@/app/actions/smsOptOut";

type State = "idle" | "code_sent" | "verified";

interface Props {
  user: User;
}

const SMS_MESSAGE_TYPES = [
  "Class cancellations",
  "Schedule changes",
  "Recital updates",
  "Registration information",
];

export function SmsOptInCard({ user }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const alreadyVerified = !!(user.sms_opt_in && user.sms_verified);

  const [state, setState] = useState<State>("idle");
  const [phone, setPhone] = useState(user.phone_number ?? "");
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSendCode() {
    if (!consent) {
      setError("Please check the consent box before continuing.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await sendPhoneVerification(phone);
      if (result.error) {
        setError(result.error);
      } else {
        setState("code_sent");
      }
    });
  }

  function handleVerify() {
    setError(null);
    startTransition(async () => {
      const result = await confirmPhoneVerification(phone, code);
      if (result.error) {
        setError(result.error);
      } else {
        setState("verified");
        router.refresh();
      }
    });
  }

  function handleResend() {
    setCode("");
    setError(null);
    startTransition(async () => {
      const result = await sendPhoneVerification(phone);
      if (result.error) setError(result.error);
    });
  }

  function handleOptOut() {
    setError(null);
    startTransition(async () => {
      const result = await smsOptOut();
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
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

  return (
    <div style={{
      background: "var(--pub-surface)",
      border: "1px solid var(--pub-border)",
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: "var(--pub-shadow-card)",
    }}>
      {/* Card header */}
      <div style={{
        padding: "14px 20px",
        background: "var(--pub-surface-warm)",
        borderBottom: "1px solid var(--pub-border-subtle)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Text Message Alerts</div>
          <div style={{ fontSize: 12, color: "var(--pub-text-muted)", marginTop: 1 }}>
            {alreadyVerified
              ? `SMS active · ${user.phone_number}`
              : "Opt in to receive urgent class alerts by text"}
          </div>
        </div>
        {alreadyVerified && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "2px 8px", borderRadius: 99,
            fontSize: 10, fontWeight: 700,
            background: "var(--pub-badge-mint-bg)", color: "var(--pub-badge-mint-text)",
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", opacity: 0.75 }} />
            SMS Active
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: 20 }}>
        {error && (
          <div style={{
            marginBottom: 14, background: "#FFF0EE", border: "1px solid #F0D0CE",
            color: "var(--wine)", fontSize: 12, borderRadius: 7, padding: "10px 14px",
          }}>
            {error}
          </div>
        )}

        {/* Opted in — single toggle + message list */}
        {alreadyVerified && state === "idle" && (
          <div>
            {/* Toggle row */}
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 14,
              paddingBottom: 16,
              borderBottom: "1px solid var(--pub-border-subtle)",
              marginBottom: 16,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pub-text-primary)" }}>
                  Receive text message alerts
                </div>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  marginTop: 6, padding: "4px 10px", borderRadius: 6,
                  background: "var(--pub-badge-mint-bg)",
                  border: "1px solid #A8DDD0",
                }}>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M13 6.5A5 5 0 1 1 3 6.5a5 5 0 0 1 10 0z" stroke="var(--pub-badge-mint-text)" strokeWidth="1.4" />
                    <path d="M8 4.5v2.5l1.5 1.5" stroke="var(--pub-badge-mint-text)" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--pub-badge-mint-text)", lineHeight: 1.4 }}>
                    Texts are limited to information pertinent to your child&apos;s classes.
                  </span>
                </div>
              </div>
              {/* Toggle — clicking opts out */}
              <div
                role="switch"
                aria-checked={true}
                onClick={handleOptOut}
                style={{
                  position: "relative", width: 38, height: 22,
                  flexShrink: 0, marginTop: 1,
                  cursor: isPending ? "not-allowed" : "pointer",
                  userSelect: "none",
                  opacity: isPending ? 0.5 : 1,
                }}
              >
                <div style={{
                  position: "absolute", inset: 0, borderRadius: 11,
                  background: "var(--plum)",
                  transition: "background .2s",
                }} />
                <div style={{
                  position: "absolute", top: 3, left: 19,
                  width: 16, height: 16, borderRadius: "50%",
                  background: "#fff",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                }} />
              </div>
            </div>

            {/* Message type list */}
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--pub-text-faint)", marginBottom: 8 }}>
              You will receive texts for
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
              {SMS_MESSAGE_TYPES.map((type) => (
                <li key={type} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--pub-text-primary)" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--plum)" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  {type}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Not opted in — idle */}
        {!alreadyVerified && state === "idle" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                Mobile phone number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(212) 555-1234"
                style={inputStyle}
              />
            </div>

            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                style={{ marginTop: 2, width: 14, height: 14, flexShrink: 0, accentColor: "var(--plum)" }}
              />
              <span style={{ fontSize: 12, color: "var(--pub-text-muted)", lineHeight: 1.5 }}>
                I agree to receive SMS alerts from AYDT about class cancellations, schedule changes,
                recital updates, and registration information (texts are limited to information
                pertinent to my child&apos;s classes). Message and data rates may apply. Reply STOP to opt out.
              </span>
            </label>

            <button
              onClick={handleSendCode}
              disabled={isPending || !phone.trim()}
              style={{
                width: "100%", padding: "9px 0", borderRadius: 7,
                background: "var(--plum)", color: "#fff",
                border: "none", fontSize: 13, fontWeight: 600,
                cursor: isPending || !phone.trim() ? "not-allowed" : "pointer",
                fontFamily: "inherit", opacity: isPending || !phone.trim() ? 0.55 : 1,
              }}
            >
              {isPending ? "Sending code…" : "Send Verification Code"}
            </button>
          </div>
        )}

        {/* Code entry */}
        {state === "code_sent" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ fontSize: 13, color: "var(--pub-text-muted)", margin: 0 }}>
              A 6-digit code was sent to <strong style={{ color: "var(--pub-text-primary)" }}>{phone}</strong>.
            </p>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                Verification code
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                style={{ ...inputStyle, fontFamily: "monospace", letterSpacing: "0.2em" }}
              />
            </div>

            <button
              onClick={handleVerify}
              disabled={isPending || code.length < 6}
              style={{
                width: "100%", padding: "9px 0", borderRadius: 7,
                background: "var(--plum)", color: "#fff",
                border: "none", fontSize: 13, fontWeight: 600,
                cursor: isPending || code.length < 6 ? "not-allowed" : "pointer",
                fontFamily: "inherit", opacity: isPending || code.length < 6 ? 0.55 : 1,
              }}
            >
              {isPending ? "Verifying…" : "Verify"}
            </button>

            <button
              onClick={handleResend}
              disabled={isPending}
              style={{
                width: "100%", fontSize: 12, color: "var(--pub-text-muted)",
                background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
                opacity: isPending ? 0.5 : 1,
              }}
            >
              Resend code
            </button>
          </div>
        )}

        {/* Success */}
        {state === "verified" && (
          <div style={{
            borderRadius: 7, background: "var(--pub-badge-mint-bg)",
            border: "1px solid #A8DDD0",
            padding: "12px 14px", fontSize: 13, color: "var(--pub-badge-mint-text)",
          }}>
            Phone verified. You will now receive text alerts for class cancellations, schedule changes,
            recital updates, and registration information.
          </div>
        )}
      </div>
    </div>
  );
}
