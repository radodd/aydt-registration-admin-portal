"use client";

import { SemesterAction, SemesterDraft } from "@/types";
import { useState } from "react";
import ConfirmationEmailStep from "./ConfirmationEmailStep";
import WaitlistStep from "./WaitlistStep";

/* -------------------------------------------------------------------------- */
/* Emails step (merged)                                                       */
/*                                                                            */
/* New-UI redesign: the wizard's "Confirmation email" and "Waitlist" steps    */
/* are merged into a single "Emails" step (9 → 8 steps). This wrapper adds the */
/* top-level Confirmation email | Waitlist invitation switch and renders the   */
/* EXISTING step component underneath.                                         */
/*                                                                            */
/* ⚠️ DO NOT rebuild the per-email previews here. The desktop + mobile email   */
/* previews live inside ConfirmationEmailStep and WaitlistStep and must NOT be */
/* overwritten by the new UI work — they are reused as-is on purpose.          */
/* -------------------------------------------------------------------------- */

type Props = {
  state: SemesterDraft;
  dispatch: React.Dispatch<SemesterAction>;
  onNext: () => void;
  onBack: () => void;
  isLocked?: boolean;
  semesterId?: string;
};

type EmailKey = "conf" | "wl";

const META: Record<EmailKey, string> = {
  conf: "Sent automatically when a registration is confirmed.",
  wl: "Sent when a waitlist spot opens up for a family.",
};

export default function EmailsStep({
  state,
  dispatch,
  onNext,
  onBack,
  isLocked = false,
  semesterId,
}: Props) {
  const [active, setActive] = useState<EmailKey>("conf");

  const tabs: { key: EmailKey; label: string }[] = [
    { key: "conf", label: "Confirmation email" },
    { key: "wl", label: "Waitlist invitation" },
  ];

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: "var(--admin-page-bg)" }}
    >
      {/* ── Top-level email selector ──────────────────────────────────── */}
      <div
        className="shrink-0 px-4 md:px-6 pt-4 pb-3 flex flex-col gap-2"
        style={{
          background: "var(--admin-surface)",
          borderBottom: "1px solid var(--admin-border)",
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div
            className="inline-flex rounded-xl p-[3px] gap-[2px]"
            style={{ background: "var(--admin-page-bg)" }}
          >
            {tabs.map((tab) => {
              const isActive = active === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActive(tab.key)}
                  className="px-3 md:px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                  style={
                    isActive
                      ? {
                          background: "var(--admin-surface)",
                          color: "var(--admin-sidebar-active)",
                          boxShadow:
                            "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
                        }
                      : { background: "transparent", color: "var(--admin-text-faint)" }
                  }
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
        <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
          {META[active]}
        </p>
      </div>

      {/* ── Active email step (previews reused untouched) ─────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {active === "conf" ? (
          <ConfirmationEmailStep
            state={state}
            dispatch={dispatch}
            onNext={onNext}
            onBack={onBack}
            isLocked={isLocked}
          />
        ) : (
          <WaitlistStep
            state={state}
            dispatch={dispatch}
            onNext={onNext}
            onBack={onBack}
            isLocked={isLocked}
            semesterId={semesterId}
          />
        )}
      </div>
    </div>
  );
}
