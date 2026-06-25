"use client";

import { useState } from "react";
import { X, ChevronDown } from "lucide-react";
import type { ReportRow } from "@/types";

const GROUP_OPTIONS = [
  { value: "none", label: "(No grouping)" },
  { value: "grade", label: "Participant: Grade" },
  { value: "age", label: "Participant: Age" },
  { value: "seasonName", label: "Season name" },
  { value: "sessionName", label: "Session name" },
  { value: "paymentPlanType", label: "Payment plan type" },
  { value: "registrationStatus", label: "Registration status" },
];

interface Props {
  groupBy: string;
  rows: ReportRow[];
  onApply: (groupBy: string) => void;
  onClose: () => void;
}

function buildPreview(
  groupBy: string,
  rows: ReportRow[],
): { label: string; count: number }[] {
  if (groupBy === "none") return [];
  const groups: Record<string, number> = {};
  for (const row of rows) {
    const key =
      String((row as any)[groupBy] ?? "—") || "—";
    groups[key] = (groups[key] ?? 0) + 1;
  }
  return Object.entries(groups)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([label, count]) => ({ label, count }));
}

export function GroupRecordsModal({ groupBy, rows, onApply, onClose }: Props) {
  const [localGroupBy, setLocalGroupBy] = useState(groupBy);
  const preview = buildPreview(localGroupBy, rows);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(22,12,10,0.45)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        className="flex flex-col overflow-hidden"
        style={{
          background: "var(--admin-surface)",
          borderRadius: 14,
          boxShadow: "var(--shadow-elevated), 0 0 0 0.5px var(--admin-border)",
          width: 460,
          maxWidth: "95vw",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ background: "#FFFFFF", borderBottom: "0.5px solid #DDD9D2" }}
        >
          <span className="text-base font-semibold text-[#201D18]">Grouping</span>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
            style={{ background: "#EDE9E4" }}
          >
            <X size={14} color="#736D65" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          <p className="text-sm mb-4" style={{ color: "var(--admin-text-muted)" }}>
            Select the piece of information you want to group these records by.
          </p>

          <div className="flex items-center gap-3">
            <span
              className="text-sm font-medium whitespace-nowrap"
              style={{ color: "var(--admin-text)" }}
            >
              Group by
            </span>
            <div className="relative flex-1">
              <select
                value={localGroupBy}
                onChange={(e) => setLocalGroupBy(e.target.value)}
                className="admin-select w-full"
              >
                {GROUP_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Preview */}
          {localGroupBy !== "none" && (
            <div
              className="mt-5 overflow-hidden"
              style={{
                border: "0.5px solid var(--admin-border)",
                borderRadius: 8,
              }}
            >
              <div
                className="px-3 py-2 font-semibold uppercase tracking-wider"
                style={{
                  fontSize: 11,
                  color: "var(--admin-text-muted)",
                  background: "var(--admin-surface-sub)",
                  borderBottom: "0.5px solid var(--admin-border)",
                }}
              >
                Preview
              </div>
              {preview.length === 0 ? (
                <div
                  className="px-3 py-4 text-sm text-center"
                  style={{ color: "var(--admin-text-faint)" }}
                >
                  No data to preview
                </div>
              ) : (
                preview.map(({ label, count }) => (
                  <div
                    key={label}
                    className="flex items-center justify-between px-3 py-2 text-sm"
                    style={{ borderBottom: "0.5px solid var(--admin-border-sub)" }}
                  >
                    <span
                      className="font-medium"
                      style={{ color: "var(--admin-text)", fontSize: 12 }}
                    >
                      {label}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{
                        background: "var(--admin-border)",
                        color: "var(--admin-text-muted)",
                      }}
                    >
                      {count}
                    </span>
                  </div>
                ))
              )}
              {rows.length > 6 * (preview[0]?.count || 1) && (
                <div
                  className="px-3 py-2 text-xs"
                  style={{ color: "var(--admin-text-faint)" }}
                >
                  Showing first {preview.length} groups…
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-3.5 flex-shrink-0"
          style={{
            borderTop: "0.5px solid var(--admin-border)",
            background: "var(--admin-surface)",
          }}
        >
          <button
            onClick={onClose}
            className="admin-btn-neutral admin-btn-sm cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => onApply(localGroupBy)}
            className="admin-btn-primary admin-btn-sm cursor-pointer"
          >
            Group records
          </button>
        </div>
      </div>
    </div>
  );
}
