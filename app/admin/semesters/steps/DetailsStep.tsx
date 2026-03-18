"use client";

import { DetailsStepProps } from "@/types";
import { useEffect, useRef } from "react";

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function DetailsStep({
  state,
  dispatch,
  onNext,
  onRegisterSubmit,
}: DetailsStepProps & { onRegisterSubmit?: (fn: () => void) => void }) {
  const name = state.details?.name ?? "";
  const trackingMode = state.details?.trackingMode ?? false;

  /* ------------------------------------------------------------------------ */
  /* Register submit handler with parent footer                               */
  /* ------------------------------------------------------------------------ */

  const handleRef = useRef(handleDetailsNext);
  handleRef.current = handleDetailsNext;

  useEffect(() => {
    onRegisterSubmit?.(() => handleRef.current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------------------ */
  /* Handlers                                                                 */
  /* ------------------------------------------------------------------------ */

  function updateName(value: string) {
    dispatch({
      type: "SET_DETAILS",
      payload: { name: value, trackingMode },
    });
  }

  function updateTracking(value: boolean) {
    dispatch({
      type: "SET_DETAILS",
      payload: { name, trackingMode: value },
    });
  }

  function handleDetailsNext() {
    if (!name.trim()) {
      alert("Semester name is required");
      return;
    }
    onNext();
  }

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="max-w-2xl mx-auto">
      {/* Heading */}
      <div className="mb-6">
        <h2
          className="text-xl font-semibold tracking-tight"
          style={{ color: "var(--admin-text)" }}
        >
          Semester details
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--admin-text-faint)" }}>
          Configure the basic settings for this semester.
        </p>
      </div>

      <div className="space-y-3">
        {/* Semester Name */}
        <div
          className="rounded-xl p-5"
          style={{
            background: "var(--admin-surface)",
            border: "0.5px solid var(--admin-border)",
          }}
        >
          <label
            htmlFor="semester-name"
            className="block text-sm font-medium mb-2"
            style={{ color: "var(--admin-text)" }}
          >
            Semester name{" "}
            <span style={{ color: "var(--admin-sidebar-active)" }}>*</span>
          </label>
          <input
            id="semester-name"
            type="text"
            placeholder="e.g. Fall 2026"
            value={name}
            onChange={(e) => updateName(e.target.value)}
            className="admin-input w-full text-sm"
          />
          <p
            className="text-xs mt-2"
            style={{ color: "var(--admin-text-faint)" }}
          >
            Shown to families in the registration portal.
          </p>
        </div>

        {/* Attendance Tracking */}
        <div
          className="rounded-xl p-5 flex items-center justify-between gap-4"
          style={{
            background: "var(--admin-surface)",
            border: "0.5px solid var(--admin-border)",
          }}
        >
          <div>
            <p
              className="text-sm font-medium"
              style={{ color: "var(--admin-text)" }}
            >
              Enable attendance tracking
            </p>
            <p
              className="text-xs mt-0.5"
              style={{ color: "var(--admin-text-faint)" }}
            >
              Track student attendance per session for reporting and compliance.
            </p>
          </div>

          {/* Toggle switch */}
          <button
            type="button"
            role="switch"
            aria-checked={trackingMode}
            onClick={() => updateTracking(!trackingMode)}
            className="shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              background: trackingMode
                ? "var(--admin-sidebar-active)"
                : "var(--admin-border)",
            }}
          >
            <span
              className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
              style={{
                transform: trackingMode ? "translateX(22px)" : "translateX(4px)",
              }}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
