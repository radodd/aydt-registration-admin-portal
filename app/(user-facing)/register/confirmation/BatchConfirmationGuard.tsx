"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { gaEvent } from "@/utils/analytics";
import type { ConfirmationLineItem } from "./page";

type BatchStatus = "confirmed" | "pending_payment" | "failed" | "unknown";

/**
 * BatchConfirmationGuard
 *
 * Handles the race between the EPG payment webhook and the returnUrl redirect.
 * EPG fires the webhook and redirects the user roughly simultaneously — the
 * redirect can arrive before the webhook has been processed.
 *
 * When the batch is still `pending_payment` on page load, this component polls
 * GET /api/register/batch-status every 2 seconds for up to 30 seconds.
 * Once the webhook confirms the batch, we show the success UI.
 *
 * If the batch is already confirmed on load (webhook beat the redirect),
 * we render the success UI immediately without polling.
 */
export function BatchConfirmationGuard({
  batchId,
  initialStatus,
  isPreview,
  grandTotal,
  paymentPlanType,
  semesterName,
  items,
}: {
  batchId: string;
  initialStatus: BatchStatus;
  isPreview: boolean;
  grandTotal?: number | null;
  paymentPlanType?: string | null;
  semesterName?: string | null;
  items?: ConfirmationLineItem[];
}) {
  const [status, setStatus] = useState<BatchStatus>(initialStatus);
  const [timedOut, setTimedOut] = useState(false);
  const pollCount = useRef(0);
  const consecutiveFailures = useRef(0);
  const MAX_POLLS = 15; // 15 × 2s = 30s
  const MAX_CONSECUTIVE_FAILURES = 3;
  const purchaseFired = useRef(false);

  useEffect(() => {
    // No polling needed if already confirmed or in preview mode
    if (status === "confirmed" || isPreview) return;

    const interval = setInterval(async () => {
      pollCount.current++;
      if (pollCount.current > MAX_POLLS) {
        clearInterval(interval);
        setTimedOut(true);
        return;
      }
      try {
        const res = await fetch(`/api/register/batch-status?id=${batchId}`);
        if (!res.ok) {
          consecutiveFailures.current++;
          if (consecutiveFailures.current >= MAX_CONSECUTIVE_FAILURES) {
            clearInterval(interval);
            setTimedOut(true);
          }
          return;
        }
        consecutiveFailures.current = 0;
        const data = await res.json();
        if (data.status === "confirmed") {
          clearInterval(interval);
          setStatus("confirmed");
        }
      } catch {
        consecutiveFailures.current++;
        if (consecutiveFailures.current >= MAX_CONSECUTIVE_FAILURES) {
          clearInterval(interval);
          setTimedOut(true);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fire purchase event once when batch is confirmed
  useEffect(() => {
    if (status !== "confirmed" || isPreview || purchaseFired.current) return;
    purchaseFired.current = true;
    gaEvent("purchase", {
      transaction_id: batchId,
      value: grandTotal ?? 0,
      currency: "USD",
      payment_plan: paymentPlanType ?? "pay_in_full",
    });
  }, [status, batchId, grandTotal, paymentPlanType, isPreview]);

  // Confirmed — render the success UI
  if (status === "confirmed" || isPreview) {
    return (
      <SuccessContent
        isPreview={isPreview}
        grandTotal={grandTotal}
        semesterName={semesterName}
        items={items}
      />
    );
  }

  // Timed out — payment was received but the webhook took too long
  if (timedOut) {
    return (
      <ConfirmationShell>
        <StatusIcon variant="pending" />
        <h1 style={HEADING_STYLE}>
          Payment received — confirming your registration
        </h1>
        <p style={SUBTEXT_STYLE}>
          This is taking a little longer than usual. Your registration will be
          confirmed shortly and you&apos;ll receive a confirmation email.
        </p>
        <p style={FINEPRINT_STYLE}>
          If you don&apos;t receive an email within 10 minutes, please contact
          AYDT support.
        </p>
        <ActionButtons />
      </ConfirmationShell>
    );
  }

  // Polling — webhook hasn't fired yet
  return (
    <ConfirmationShell>
      <div
        style={{
          width: 48,
          height: 48,
          margin: "0 auto 22px",
          borderRadius: "50%",
          border: "4px solid var(--plum-100)",
          borderTopColor: "var(--plum)",
          animation: "spin 0.9s linear infinite",
        }}
      />
      <h1 style={HEADING_STYLE}>Confirming your registration…</h1>
      <p style={SUBTEXT_STYLE}>
        Your payment was received. Please wait while we confirm your
        registration.
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </ConfirmationShell>
  );
}

function SuccessContent({
  isPreview,
  grandTotal,
  semesterName,
  items,
}: {
  isPreview: boolean;
  grandTotal?: number | null;
  semesterName?: string | null;
  items?: ConfirmationLineItem[];
}) {
  const lineItems = items ?? [];
  const showTotal = typeof grandTotal === "number" && grandTotal > 0;

  return (
    <ConfirmationShell>
      {isPreview && (
        <div
          style={{
            background: "var(--plum-50)",
            border: "1px solid var(--plum-100)",
            borderRadius: 10,
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--plum-700)",
            marginBottom: 22,
          }}
        >
          Preview mode — this is a simulated confirmation.
        </div>
      )}

      <StatusIcon variant="success" />

      <h1 style={HEADING_STYLE}>You&apos;re registered!</h1>
      <p style={SUBTEXT_STYLE}>
        Your registration has been confirmed.
        {semesterName ? ` Welcome to ${semesterName}.` : ""}
      </p>

      {lineItems.length > 0 && (
        <div
          style={{
            textAlign: "left",
            background: "var(--pub-surface)",
            border: "1px solid var(--pub-border)",
            borderRadius: 12,
            boxShadow: "var(--pub-shadow-card)",
            overflow: "hidden",
            margin: "26px 0 8px",
          }}
        >
          <div
            style={{
              padding: "12px 18px",
              borderBottom: "1px solid var(--pub-border-subtle)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.4px",
              textTransform: "uppercase",
              color: "var(--pub-text-muted)",
            }}
          >
            {semesterName ? `${semesterName} · ` : ""}Registration Summary
          </div>
          <div style={{ padding: "6px 18px" }}>
            {lineItems.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 0",
                  borderBottom:
                    idx < lineItems.length - 1
                      ? "1px solid var(--pub-border-subtle)"
                      : "none",
                }}
              >
                <span
                  style={{
                    width: 4,
                    alignSelf: "stretch",
                    minHeight: 32,
                    borderRadius: 2,
                    background: "var(--plum-200)",
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {item.className}
                  </div>
                  {item.dancerName && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--pub-text-muted)",
                        marginTop: 2,
                      }}
                    >
                      {item.dancerName}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {showTotal && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "13px 18px",
                borderTop: "1px solid var(--pub-border)",
                background: "var(--pub-surface-warm)",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--pub-text-muted)",
                }}
              >
                Total paid
              </span>
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: "var(--pub-text-primary)",
                }}
              >
                ${grandTotal!.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}

      <p style={{ ...FINEPRINT_STYLE, marginTop: lineItems.length > 0 ? 18 : 0 }}>
        A confirmation email has been sent to your inbox. Please check your spam
        folder if you don&apos;t see it within a few minutes.
      </p>

      <ActionButtons />
    </ConfirmationShell>
  );
}

/* ── Layout + shared styling ─────────────────────────────────── */

function ConfirmationShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        maxWidth: 540,
        margin: "0 auto",
        padding: "64px 24px 80px",
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}

const HEADING_STYLE: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 700,
  color: "var(--pub-text-primary)",
  margin: "0 0 10px",
  letterSpacing: "-0.01em",
};

const SUBTEXT_STYLE: React.CSSProperties = {
  fontSize: 15,
  color: "var(--pub-text-muted)",
  margin: "0 0 4px",
  lineHeight: 1.6,
};

const FINEPRINT_STYLE: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--pub-text-muted)",
  opacity: 0.85,
  margin: "0 0 30px",
  lineHeight: 1.6,
};

function ActionButtons() {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        justifyContent: "center",
      }}
    >
      <Link
        href="/profile?tab=registrations"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "11px 22px",
          borderRadius: "var(--pub-radius-md)",
          border: "1.5px solid var(--plum)",
          background: "var(--plum)",
          color: "#fff",
          fontSize: 13,
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        View My Registrations
      </Link>
      <Link
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "11px 22px",
          borderRadius: "var(--pub-radius-md)",
          border: "1.5px solid var(--pub-border)",
          background: "var(--pub-surface)",
          color: "var(--pub-text-primary)",
          fontSize: 13,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Back to Home
      </Link>
    </div>
  );
}

/* ── Status icon ─────────────────────────────────────────────── */

function StatusIcon({ variant }: { variant: "success" | "pending" }) {
  const isSuccess = variant === "success";
  return (
    <div
      style={{
        width: 64,
        height: 64,
        margin: "0 auto 22px",
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: isSuccess ? "var(--pub-badge-mint-bg, #E6F4EA)" : "var(--plum-50)",
        color: isSuccess ? "var(--pub-badge-mint-text, #1A5C16)" : "var(--plum)",
      }}
    >
      {isSuccess ? (
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <rect
            x="3"
            y="6"
            width="18"
            height="13"
            rx="2.5"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M4 8l8 6 8-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}
