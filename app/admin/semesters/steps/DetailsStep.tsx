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
  const location = state.details?.location ?? "";
  const trackingMode = state.details?.trackingMode ?? false;
  const capacityWarningThreshold = state.details?.capacityWarningThreshold ?? "";
  const capacityWarningMode = state.details?.capacityWarningMode ?? "count";

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

  function patch(partial: Partial<NonNullable<typeof state.details>>) {
    dispatch({
      type: "SET_DETAILS",
      payload: {
        name,
        location: location || undefined,
        trackingMode,
        capacityWarningThreshold: capacityWarningThreshold !== "" ? Number(capacityWarningThreshold) : undefined,
        capacityWarningMode,
        ...partial,
      },
    });
  }

  function handleDetailsNext() {
    if (!name.trim()) {
      alert("Semester name is required");
      return;
    }
    if (!location.trim()) {
      alert("Location is required");
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
            onChange={(e) => patch({ name: e.target.value })}
            className="admin-input w-full text-sm"
          />
          <p
            className="text-xs mt-2"
            style={{ color: "var(--admin-text-faint)" }}
          >
            Shown to families in the registration portal.
          </p>
        </div>

        {/* Location */}
        <div
          className="rounded-xl p-5"
          style={{
            background: "var(--admin-surface)",
            border: "0.5px solid var(--admin-border)",
          }}
        >
          <label
            htmlFor="semester-location"
            className="block text-sm font-medium mb-2"
            style={{ color: "var(--admin-text)" }}
          >
            Location{" "}
            <span style={{ color: "var(--admin-sidebar-active)" }}>*</span>
          </label>
          <input
            id="semester-location"
            type="text"
            placeholder="e.g. Upper East Side"
            value={location}
            onChange={(e) => patch({ location: e.target.value })}
            className="admin-input w-full text-sm"
          />
          <p
            className="text-xs mt-2"
            style={{ color: "var(--admin-text-faint)" }}
          >
            Campus for this semester. All classes belong to this location — keeps UES and Washington Heights programs separate.
          </p>
        </div>

        {/* Capacity Warning Threshold */}
        <div
          className="rounded-xl p-5"
          style={{
            background: "var(--admin-surface)",
            border: "0.5px solid var(--admin-border)",
          }}
        >
          <label
            htmlFor="semester-threshold"
            className="block text-sm font-medium mb-2"
            style={{ color: "var(--admin-text)" }}
          >
            Availability warning threshold
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              id="semester-threshold"
              type="number"
              min={1}
              max={capacityWarningMode === "percent" ? 100 : 20}
              placeholder={capacityWarningMode === "percent" ? "e.g. 90" : "e.g. 3"}
              value={capacityWarningThreshold}
              onChange={(e) => patch({ capacityWarningThreshold: e.target.value ? Number(e.target.value) : undefined })}
              className="admin-input w-24 text-sm"
            />
            {/* Mode toggle: spots-remaining count vs. percent-full */}
            <div className="inline-flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
              {(["count", "percent"] as const).map((m) => {
                const active = capacityWarningMode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => patch({ capacityWarningMode: m })}
                    className="text-sm px-3 py-1.5 transition-colors"
                    style={
                      active
                        ? { background: "var(--admin-sidebar-active)", color: "#fff" }
                        : { background: "transparent", color: "var(--admin-text-faint)" }
                    }
                  >
                    {m === "count" ? "spots remaining" : "% full"}
                  </button>
                );
              })}
            </div>
          </div>
          <p
            className="text-xs mt-2"
            style={{ color: "var(--admin-text-faint)" }}
          >
            {capacityWarningMode === "percent" ? (
              <>When a class reaches this percent of capacity, families see &ldquo;X spots left&rdquo; on the enrollment card. e.g. 90 triggers at 90% full. Leave blank to hide availability counts entirely.</>
            ) : (
              <>When a class has this many spots left, families see &ldquo;X spots left&rdquo; on the enrollment card. Leave blank to hide availability counts entirely.</>
            )}
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
            onClick={() => patch({ trackingMode: !trackingMode })}
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
