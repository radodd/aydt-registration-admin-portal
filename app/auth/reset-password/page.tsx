"use client";

import { useState } from "react";
import Link from "next/link";
import { resetPassword } from "../actions";
import { authTokens } from "../authTokens";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  border: "1.5px solid var(--pub-border)",
  borderRadius: "var(--pub-radius-md)",
  fontFamily: "var(--pub-font-primary)",
  fontSize: 14,
  color: "var(--pub-text-primary)",
  background: "var(--pub-surface)",
  outline: "none",
  boxSizing: "border-box",
};

const SERVER_ERRORS: Record<string, string> = {
  length: "Password must be at least 8 characters.",
  mismatch: "The two passwords don't match.",
  update:
    "We couldn't update your password. The reset link may have expired — request a new one.",
};

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  const serverError =
    typeof window !== "undefined"
      ? SERVER_ERRORS[
          new URLSearchParams(window.location.search).get("error") ?? ""
        ] ?? null
      : null;

  const error = clientError ?? serverError;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    // Client-side guard for instant feedback; the server action re-validates.
    if (password.length < 8) {
      e.preventDefault();
      setClientError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      e.preventDefault();
      setClientError("The two passwords don't match.");
      return;
    }
    setClientError(null);
  }

  return (
    <div
      style={{
        ...authTokens,
        minHeight: "calc(100vh - 66px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
        background: "var(--pub-page-bg)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 440 }}>
        {/* Logo mark */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: "var(--plum)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 14,
              color: "#fff",
              letterSpacing: "-0.5px",
            }}
          >
            AY
          </div>
        </div>

        <div
          style={{
            background: "var(--pub-surface)",
            border: "1px solid var(--pub-border)",
            borderRadius: "var(--pub-radius-xl)",
            boxShadow: "var(--pub-shadow-elevated)",
            padding: "36px 36px 32px",
          }}
        >
          <h1
            style={{
              fontFamily: "var(--pub-font-secondary)",
              fontSize: 24,
              fontWeight: 800,
              color: "var(--pub-text-primary)",
              marginBottom: 6,
              lineHeight: 1.15,
            }}
          >
            Set a new password
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "var(--pub-text-muted)",
              lineHeight: 1.6,
              marginBottom: 24,
            }}
          >
            Choose a new password for your AYDT account. Use at least 8
            characters.
          </p>

          {error && (
            <div
              role="alert"
              style={{
                background: "var(--pub-badge-rose-bg, #fdecec)",
                border: "1px solid var(--pub-badge-rose-text, #d9534f)",
                color: "var(--pub-badge-rose-text, #b23b38)",
                borderRadius: "var(--pub-radius-md)",
                padding: "10px 14px",
                fontSize: 13,
                lineHeight: 1.5,
                marginBottom: 18,
              }}
            >
              {error}
            </div>
          )}

          <form action={resetPassword} onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="password"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--pub-text-primary)",
                  display: "block",
                  marginBottom: 5,
                }}
              >
                New password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="Enter a new password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--plum)";
                  e.currentTarget.style.boxShadow =
                    "0 0 0 3px rgba(122,74,114,0.10)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--pub-border)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label
                htmlFor="confirmPassword"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--pub-text-primary)",
                  display: "block",
                  marginBottom: 5,
                }}
              >
                Confirm password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Re-enter your new password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                style={inputStyle}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--plum)";
                  e.currentTarget.style.boxShadow =
                    "0 0 0 3px rgba(122,74,114,0.10)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--pub-border)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            <button
              type="submit"
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "var(--pub-radius-md)",
                border: "2px solid var(--plum)",
                background: "var(--plum)",
                color: "#fff",
                fontFamily: "var(--pub-font-primary)",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                transition: "background .15s, border-color .15s",
                marginBottom: 20,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "var(--plum-700)";
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "var(--plum-700)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "var(--plum)";
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "var(--plum)";
              }}
            >
              Set new password
            </button>
          </form>

          <div
            style={{
              borderTop: "1px solid var(--pub-border-subtle)",
              paddingTop: 16,
              textAlign: "center",
              fontSize: 13,
              color: "var(--pub-text-muted)",
            }}
          >
            Remember your password?{" "}
            <Link
              href="/auth/login"
              style={{
                color: "var(--plum)",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
