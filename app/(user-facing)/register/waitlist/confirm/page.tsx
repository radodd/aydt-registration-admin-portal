"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCart } from "@/app/providers/CartProvider";
import { useRegistration } from "@/app/providers/RegistrationProvider";
import { createClient } from "@/utils/supabase/client";
import { joinWaitlist } from "../../actions/joinWaitlist";

/* -------------------------------------------------------------------------- */
/* Meeting-plan #5: terminal step of the waitlist join flow.                   */
/* Reuses the full registration flow (dancer + form capture) but, instead of   */
/* charging, writes one capacity-neutral waitlist entry per assigned dancer.    */
/* -------------------------------------------------------------------------- */

type SubmitState =
  | { phase: "submitting" }
  | {
      phase: "done";
      count: number;
      emailIssues: boolean;
      email: string | null;
      summary: WaitlistSummaryLine[];
    }
  | { phase: "error"; message: string };

type WaitlistSummaryLine = {
  dancerName: string | null;
  className: string;
  /** Number of drop-in dates waitlisted; null for standard/tiered. */
  dateCount: number | null;
};

function WaitlistConfirmInner() {
  const router = useRouter();
  const params = useSearchParams();
  const semesterId = params.get("semester") ?? "";
  const { items, clear } = useCart();
  const { state } = useRegistration();
  const [result, setResult] = useState<SubmitState>({ phase: "submitting" });
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      const assigned = state.participants.filter(
        (p) => p.dancerId || p.newDancer,
      );
      if (assigned.length === 0) {
        setResult({
          phase: "error",
          message: "No dancers were assigned. Please start over.",
        });
        return;
      }

      const supabase = createClient();

      // Resolve section_id per representative meeting (booking-grain hint for the
      // admin invite later). Best-effort — classId is the authoritative target.
      const meetingIds = [...new Set(assigned.map((p) => p.sessionId))];
      const sectionByMeeting = new Map<string, string | null>();
      if (meetingIds.length) {
        const { data: meetings } = await supabase
          .from("class_meetings")
          .select("id, section_id")
          .in("id", meetingIds);
        for (const m of meetings ?? []) {
          sectionByMeeting.set(
            m.id as string,
            (m as { section_id?: string | null }).section_id ?? null,
          );
        }
      }

      // Resolve existing dancer names for the admin list + confirmation email.
      const existingIds = assigned
        .map((p) => p.dancerId)
        .filter((id): id is string => !!id);
      const nameById = new Map<string, string>();
      if (existingIds.length) {
        const { data: dancers } = await supabase
          .from("dancers")
          .select("id, first_name, last_name")
          .in("id", existingIds);
        for (const d of dancers ?? []) {
          nameById.set(
            d.id as string,
            `${(d as { first_name?: string }).first_name ?? ""} ${
              (d as { last_name?: string }).last_name ?? ""
            }`.trim(),
          );
        }
      }

      let count = 0;
      let emailIssues = false;
      let firstError: string | null = null;
      const summary: WaitlistSummaryLine[] = [];

      for (const p of assigned) {
        const owner = items.find((it) => {
          if (it.mode === "drop-in") {
            return (it.selectedDateIds ?? []).includes(p.sessionId);
          }
          return it.sessionId === p.sessionId;
        });
        if (!owner) continue;

        const dancerName = p.newDancer
          ? `${p.newDancer.firstName} ${p.newDancer.lastName}`.trim()
          : (nameById.get(p.dancerId ?? "") ?? null);

        const formData = {
          ...state.formData,
          // Snapshot new-dancer details so the admin can register them later
          // without a pre-existing dancer row.
          ...(p.newDancer ? { _newDancer: p.newDancer } : {}),
        };

        // Meeting-plan #5: drop-in waitlisting is per DATE — one entry per
        // selected meeting. Standard/tiered create a single entry per dancer.
        const dropInDates =
          owner.mode === "drop-in"
            ? (owner.selectedDateIds?.length ? owner.selectedDateIds : [p.sessionId])
            : [];

        const targets =
          owner.mode === "drop-in"
            ? dropInDates.map((meetingId) => ({
                sectionId: null,
                meetingId,
                classTierId: null,
              }))
            : [
                {
                  sectionId: sectionByMeeting.get(p.sessionId) ?? null,
                  meetingId: null,
                  classTierId: owner.mode === "tiered" ? (owner.classTierId ?? null) : null,
                },
              ];

        let ownerSucceeded = false;
        for (const t of targets) {
          const res = await joinWaitlist({
            semesterId,
            classId: owner.classId,
            sectionId: t.sectionId,
            meetingId: t.meetingId,
            classTierId: t.classTierId,
            dancerId: p.dancerId ?? null,
            dancerName,
            formData,
          });

          if (res.success) {
            count += 1;
            ownerSucceeded = true;
            if (res.emailFailed) emailIssues = true;
          } else if (!firstError) {
            firstError = res.error ?? "Failed to join the waitlist.";
          }
        }

        // One receipt line per (dancer, class) that landed on the waitlist.
        if (ownerSucceeded) {
          summary.push({
            dancerName,
            className: owner.className,
            dateCount: owner.mode === "drop-in" ? dropInDates.length : null,
          });
        }
      }

      if (count === 0) {
        setResult({
          phase: "error",
          message: firstError ?? "Could not add you to the waitlist.",
        });
        return;
      }

      // Clear the cart now that the waitlist entries are committed.
      clear();
      setResult({
        phase: "done",
        count,
        emailIssues,
        email: state.email || null,
        summary,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (result.phase === "submitting") {
    return (
      <div style={{ textAlign: "center", padding: "60px 0" }}>
        <div
          style={{
            width: 28,
            height: 28,
            border: "3px solid var(--pub-border)",
            borderTopColor: "var(--plum)",
            borderRadius: "50%",
            margin: "0 auto 16px",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <div style={{ fontSize: 14, color: "var(--pub-text-muted)" }}>
          Adding you to the waitlist…
        </div>
      </div>
    );
  }

  if (result.phase === "error") {
    return (
      <div
        style={{
          background: "#FEF2F2",
          border: "1px solid #FEE2E2",
          borderRadius: 12,
          padding: "24px 20px",
          textAlign: "center",
        }}
      >
        <div
          style={{ fontSize: 14, fontWeight: 600, color: "#B91C1C", marginBottom: 6 }}
        >
          Could not join the waitlist
        </div>
        <div style={{ fontSize: 12, color: "var(--pub-text-muted)", marginBottom: 14 }}>
          {result.message}
        </div>
        <button
          type="button"
          onClick={() => router.push(semesterId ? `/semester/${semesterId}` : "/")}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--plum)",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "var(--pub-font-primary)",
          }}
        >
          ← Back to classes
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "32px 0", textAlign: "center" }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "var(--pub-badge-sage-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 18px",
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--pub-badge-sage-text)"
          strokeWidth="2.5"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <div
        style={{
          fontFamily: "var(--pub-font-secondary)",
          fontSize: 24,
          fontWeight: 700,
          color: "var(--pub-text-primary)",
          marginBottom: 6,
        }}
      >
        You&apos;re all set!
      </div>
      <div
        style={{
          fontSize: 14,
          color: "var(--pub-text-muted)",
          margin: "0 auto 18px",
          lineHeight: 1.6,
        }}
      >
        {result.count === 1
          ? "You've been added to the waitlist."
          : `You've been added to ${result.count} waitlists.`}
      </div>

      {/* No-payment callout */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          background: "var(--pub-badge-sage-bg)",
          color: "var(--pub-badge-sage-text)",
          border: "1px solid var(--pub-badge-sage-text)",
          borderRadius: 10,
          padding: "10px 14px",
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 18,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
        No payment needed right now
      </div>

      {/* Receipt-style summary of what was waitlisted */}
      {result.summary.length > 0 && (
        <div
          style={{
            textAlign: "left",
            border: "1px solid var(--pub-border)",
            borderRadius: 12,
            overflow: "hidden",
            marginBottom: 18,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--pub-text-muted)",
              background: "var(--pub-badge-sage-bg, #f5f7f2)",
              padding: "8px 14px",
            }}
          >
            Waitlisted
          </div>
          {result.summary.map((s, i) => (
            <div
              key={`${s.className}-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 14px",
                borderTop: i > 0 ? "1px solid var(--pub-border-subtle, #ede9e4)" : "none",
                fontSize: 13,
              }}
            >
              <span style={{ color: "var(--pub-text-primary)", fontWeight: 600 }}>
                {s.dancerName ?? "Dancer"}
              </span>
              <span style={{ color: "var(--pub-text-muted)", textAlign: "right" }}>
                {s.className}
                {s.dateCount != null && (
                  <span style={{ color: "var(--pub-text-faint, #999)" }}>
                    {" "}· {s.dateCount} date{s.dateCount !== 1 ? "s" : ""}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Email confirmation + no-action-needed */}
      <div
        style={{
          fontSize: 13,
          color: "var(--pub-text-muted)",
          lineHeight: 1.6,
          marginBottom: 8,
        }}
      >
        {result.emailIssues ? (
          <>
            Your spot is saved, but we couldn&apos;t send your confirmation email.
            Your spot is still secure.
          </>
        ) : (
          <>
            A confirmation email has been sent
            {result.email ? (
              <>
                {" "}to <strong>{result.email}</strong>
              </>
            ) : null}
            .
          </>
        )}
      </div>
      <div style={{ fontSize: 13, color: "var(--pub-text-muted)", lineHeight: 1.6 }}>
        <strong>No further action is needed.</strong> We&apos;ll only email you
        again if a spot opens up.
      </div>

      <button
        type="button"
        onClick={() => router.push(semesterId ? `/semester/${semesterId}` : "/")}
        style={{
          marginTop: 26,
          fontSize: 14,
          fontWeight: 600,
          color: "#fff",
          background: "var(--plum)",
          border: "none",
          borderRadius: 10,
          padding: "10px 22px",
          cursor: "pointer",
          fontFamily: "var(--pub-font-primary)",
        }}
      >
        Back to classes
      </button>
    </div>
  );
}

export default function WaitlistConfirmPage() {
  return (
    <Suspense>
      <WaitlistConfirmInner />
    </Suspense>
  );
}
