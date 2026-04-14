"use client";

import { useEffect } from "react";
import Link from "next/link";
import { sendPasswordResetEmail } from "../actions";

export default function RequestPasswordResetPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("sent") === "1") {
      // handled via success message below
    }
  }, []);

  const sentParam =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("sent") === "1"
      : false;

  return (
    <div style={{
      minHeight: "calc(100vh - 66px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 20px",
      background: "var(--pub-page-bg)",
    }}>
      <div style={{ width: "100%", maxWidth: 440 }}>

        {/* Logo mark */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: "var(--plum)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: 14, color: "#fff",
            letterSpacing: "-0.5px",
          }}>AY</div>
        </div>

        <div style={{
          background: "var(--pub-surface)",
          border: "1px solid var(--pub-border)",
          borderRadius: "var(--pub-radius-xl)",
          boxShadow: "var(--pub-shadow-elevated)",
          padding: "36px 36px 32px",
        }}>
          {sentParam ? (
            /* ── Success state ── */
            <>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: "50%",
                  background: "var(--pub-badge-sage-bg)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 16px",
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--pub-badge-sage-text)" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <h1 style={{
                  fontFamily: "var(--pub-font-secondary)",
                  fontSize: 22, fontWeight: 800,
                  color: "var(--pub-text-primary)", marginBottom: 8, lineHeight: 1.2,
                }}>
                  Check your email
                </h1>
                <p style={{ fontSize: 14, color: "var(--pub-text-muted)", lineHeight: 1.6 }}>
                  If an account exists for that address, we&apos;ve sent a password reset
                  link. It may take a minute to arrive.
                </p>
              </div>
              <Link
                href="/auth/login"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  width: "100%", padding: "12px",
                  borderRadius: "var(--pub-radius-md)",
                  border: "1.5px solid var(--pub-border)",
                  background: "var(--pub-surface)",
                  color: "var(--pub-text-muted)",
                  fontFamily: "var(--pub-font-primary)", fontSize: 13, fontWeight: 600,
                  textDecoration: "none", marginTop: 4,
                }}
              >
                Back to Sign In
              </Link>
            </>
          ) : (
            /* ── Form state ── */
            <>
              <h1 style={{
                fontFamily: "var(--pub-font-secondary)",
                fontSize: 24, fontWeight: 800,
                color: "var(--pub-text-primary)", marginBottom: 6, lineHeight: 1.15,
              }}>
                Reset your password
              </h1>
              <p style={{ fontSize: 14, color: "var(--pub-text-muted)", lineHeight: 1.6, marginBottom: 24 }}>
                Enter the email address associated with your AYDT account and we&apos;ll
                send you a reset link.
              </p>

              <form action={sendPasswordResetEmail}>
                <div style={{ marginBottom: 16 }}>
                  <label
                    htmlFor="email"
                    style={{ fontSize: 12, fontWeight: 600, color: "var(--pub-text-primary)", display: "block", marginBottom: 5 }}
                  >
                    Email address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    required
                    style={{
                      width: "100%", padding: "10px 14px",
                      border: "1.5px solid var(--pub-border)",
                      borderRadius: "var(--pub-radius-md)",
                      fontFamily: "var(--pub-font-primary)", fontSize: 14,
                      color: "var(--pub-text-primary)",
                      background: "var(--pub-surface)", outline: "none",
                      boxSizing: "border-box",
                    }}
                    onFocus={e => {
                      e.currentTarget.style.borderColor = "var(--plum)";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(122,74,114,0.10)";
                    }}
                    onBlur={e => {
                      e.currentTarget.style.borderColor = "var(--pub-border)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>

                <button
                  type="submit"
                  style={{
                    width: "100%", padding: "12px",
                    borderRadius: "var(--pub-radius-md)",
                    border: "2px solid var(--plum)",
                    background: "var(--plum)", color: "#fff",
                    fontFamily: "var(--pub-font-primary)", fontSize: 14, fontWeight: 700,
                    cursor: "pointer",
                    transition: "background .15s, border-color .15s",
                    marginBottom: 20,
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = "var(--plum-700)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--plum-700)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = "var(--plum)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--plum)";
                  }}
                >
                  Send reset link
                </button>
              </form>

              <div style={{
                borderTop: "1px solid var(--pub-border-subtle)",
                paddingTop: 16,
                display: "flex", flexDirection: "column", gap: 8,
              }}>
                <div style={{ textAlign: "center", fontSize: 13, color: "var(--pub-text-muted)" }}>
                  Remember your password?{" "}
                  <Link href="/auth/login" style={{ color: "var(--plum)", fontWeight: 600, textDecoration: "none" }}>
                    Sign in
                  </Link>
                </div>
                <div style={{ textAlign: "center", fontSize: 13, color: "var(--pub-text-muted)" }}>
                  New to AYDT?{" "}
                  <Link href="/register" style={{ color: "var(--plum)", fontWeight: 600, textDecoration: "none" }}>
                    Create a family account
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
