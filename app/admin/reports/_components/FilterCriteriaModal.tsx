"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { ReportFilter } from "@/types";

interface Props {
  sessions: { id: string; label: string }[];
  filters: ReportFilter[];
  onApply: (filters: ReportFilter[]) => void;
  onClose: () => void;
}

type FilterDef = {
  field: string;
  label: string;
  type: "daterange" | "select" | "text";
  options?: { value: string; label: string }[];
};

const FILTER_DEFS: FilterDef[] = [
  {
    field: "dateRegistered",
    label: "Registration date",
    type: "daterange",
  },
  {
    field: "sessionName",
    label: "Session option",
    type: "select",
    options: [], // populated from sessions prop
  },
  {
    field: "registrationStatus",
    label: "Registration status",
    type: "select",
    options: [
      { value: "confirmed", label: "Confirmed" },
      { value: "pending_payment", label: "Pending" },
      { value: "cancelled", label: "Cancelled" },
    ],
  },
  {
    field: "grade",
    label: "Grade",
    type: "text",
  },
  {
    field: "balance",
    label: "Registration balance",
    type: "select",
    options: [
      { value: "zero", label: "Balance = $0" },
      { value: "positive", label: "Balance > $0" },
      { value: "over100", label: "Balance > $100" },
    ],
  },
  {
    field: "paymentPlanType",
    label: "Payment plan type",
    type: "select",
    options: [
      { value: "pay_in_full", label: "Pay in full" },
      { value: "installments", label: "Installment plan" },
    ],
  },
];

export function FilterCriteriaModal({
  sessions,
  filters,
  onApply,
  onClose,
}: Props) {
  // Build initial state from existing filters
  const initEnabled: Record<string, boolean> = {};
  const initValues: Record<string, string> = {};
  const initValuesTo: Record<string, string> = {};
  for (const f of filters) {
    initEnabled[f.field] = true;
    initValues[f.field] = f.value;
    if (f.valueTo) initValuesTo[f.field] = f.valueTo;
  }

  const [enabled, setEnabled] = useState<Record<string, boolean>>(initEnabled);
  const [values, setValues] = useState<Record<string, string>>(initValues);
  const [valuesTo, setValuesTo] = useState<Record<string, string>>(initValuesTo);

  const toggleRow = (field: string, checked: boolean) => {
    setEnabled((p) => ({ ...p, [field]: checked }));
    if (!checked) {
      setValues((p) => { const n = { ...p }; delete n[field]; return n; });
      setValuesTo((p) => { const n = { ...p }; delete n[field]; return n; });
    }
  };

  const handleApply = () => {
    const result: ReportFilter[] = [];
    for (const def of FILTER_DEFS) {
      if (!enabled[def.field]) continue;
      const val = values[def.field] ?? "";
      if (!val) continue;
      const filter: ReportFilter = { field: def.field, value: val };
      if (def.type === "daterange" && valuesTo[def.field]) {
        filter.valueTo = valuesTo[def.field];
      }
      result.push(filter);
    }
    onApply(result);
  };

  // Inject session options
  const defsWithSessions = FILTER_DEFS.map((def) => {
    if (def.field === "sessionName") {
      return {
        ...def,
        options: sessions.map((s) => ({ value: s.id, label: s.label })),
      };
    }
    return def;
  });

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
          width: 600,
          maxWidth: "95vw",
          maxHeight: "85vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ background: "#8E2A23" }}
        >
          <span className="text-base font-semibold text-white">
            Set filter criteria
          </span>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
            style={{ background: "rgba(255,255,255,0.15)" }}
          >
            <X size={14} color="white" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-sm mb-4" style={{ color: "var(--admin-text-muted)" }}>
            Set the filters you want for your report.
          </p>
          <div className="flex flex-col gap-3">
            {defsWithSessions.map((def) => {
              const isActive = !!enabled[def.field];
              return (
                <div
                  key={def.field}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
                  style={{
                    border: isActive
                      ? "0.5px solid var(--color-primary-200)"
                      : "0.5px solid var(--admin-border)",
                    background: isActive
                      ? "var(--color-primary-50)"
                      : undefined,
                  }}
                >
                  {/* Checkbox + label */}
                  <label
                    className="flex items-center gap-2 text-sm font-medium cursor-pointer"
                    style={{ color: "var(--admin-text)", minWidth: 180 }}
                  >
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => toggleRow(def.field, e.target.checked)}
                      style={{ accentColor: "#8E2A23", width: 15, height: 15 }}
                    />
                    {def.label}
                  </label>

                  {/* Control */}
                  <div className="flex items-center gap-2 flex-1">
                    {def.type === "daterange" && (
                      <>
                        <input
                          type="date"
                          disabled={!isActive}
                          value={values[def.field] ?? ""}
                          onChange={(e) =>
                            setValues((p) => ({ ...p, [def.field]: e.target.value }))
                          }
                          className="admin-input"
                          style={{ maxWidth: 140 }}
                        />
                        <span className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
                          to
                        </span>
                        <input
                          type="date"
                          disabled={!isActive}
                          value={valuesTo[def.field] ?? ""}
                          onChange={(e) =>
                            setValuesTo((p) => ({ ...p, [def.field]: e.target.value }))
                          }
                          className="admin-input"
                          style={{ maxWidth: 140 }}
                        />
                      </>
                    )}
                    {def.type === "select" && (
                      <select
                        disabled={!isActive}
                        value={values[def.field] ?? ""}
                        onChange={(e) =>
                          setValues((p) => ({ ...p, [def.field]: e.target.value }))
                        }
                        className="admin-select flex-1"
                      >
                        <option value="">Select an option</option>
                        {(def.options ?? []).map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    )}
                    {def.type === "text" && (
                      <input
                        type="text"
                        disabled={!isActive}
                        value={values[def.field] ?? ""}
                        onChange={(e) =>
                          setValues((p) => ({ ...p, [def.field]: e.target.value }))
                        }
                        placeholder="Enter value"
                        className="admin-input flex-1"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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
            onClick={handleApply}
            className="admin-btn-primary admin-btn-sm cursor-pointer"
          >
            Set filter
          </button>
        </div>
      </div>
    </div>
  );
}
