"use client";

import { useState } from "react";
import { X, Search } from "lucide-react";
import type { ReportSemester } from "@/types";

interface Props {
  semesters: ReportSemester[];
  selectedIds: string[];
  onSave: (ids: string[]) => void;
  onClose: () => void;
}

const STATUS_FILTERS = [
  { value: "all", label: "Past and current seasons" },
  { value: "published", label: "Current seasons only" },
  { value: "archived", label: "Past seasons only" },
  { value: "scheduled", label: "Future seasons" },
];

export function SeasonSelectorModal({
  semesters,
  selectedIds,
  onSave,
  onClose,
}: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [localSelected, setLocalSelected] = useState<Set<string>>(
    new Set(selectedIds),
  );
  const [showOnlySelected, setShowOnlySelected] = useState(false);

  const filtered = semesters.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || s.status === statusFilter;
    const matchesSelected = !showOnlySelected || localSelected.has(s.id);
    return matchesSearch && matchesStatus && matchesSelected;
  });

  const toggleSemester = (id: string) => {
    setLocalSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    if (checked) setLocalSelected(new Set(filtered.map((s) => s.id)));
    else setLocalSelected(new Set());
  };

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((s) => localSelected.has(s.id));

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
          width: 560,
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
            Select seasons
          </span>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer"
            style={{ background: "rgba(255,255,255,0.15)" }}
          >
            <X size={14} color="white" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Controls */}
          <div className="flex gap-2 mb-3">
            <select
              className="admin-select flex-1"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <div
              className="flex items-center gap-2 flex-1 px-3 py-2 rounded-lg"
              style={{
                border: "0.5px solid var(--admin-border)",
                background: "var(--admin-surface)",
              }}
            >
              <Search size={13} style={{ color: "var(--admin-text-faint)", flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Search season name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 outline-none bg-transparent text-sm"
                style={{ color: "var(--admin-text)" }}
              />
            </div>
          </div>

          {/* Table */}
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr style={{ background: "var(--admin-surface-sub)" }}>
                <th
                  className="text-left px-3 py-2"
                  style={{
                    borderBottom: "0.5px solid var(--admin-border)",
                    width: 32,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={(e) => toggleAll(e.target.checked)}
                    className="cursor-pointer"
                    style={{ accentColor: "#8E2A23" }}
                  />
                </th>
                <th
                  className="text-left px-3 py-2 font-semibold uppercase tracking-wider"
                  style={{
                    fontSize: 11,
                    color: "var(--admin-text-muted)",
                    borderBottom: "0.5px solid var(--admin-border)",
                  }}
                >
                  Season name
                </th>
                <th
                  className="text-left px-3 py-2 font-semibold uppercase tracking-wider whitespace-nowrap"
                  style={{
                    fontSize: 11,
                    color: "var(--admin-text-muted)",
                    borderBottom: "0.5px solid var(--admin-border)",
                  }}
                >
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((sem) => (
                <tr
                  key={sem.id}
                  onClick={() => toggleSemester(sem.id)}
                  className="cursor-pointer"
                  style={{
                    borderBottom: "0.5px solid var(--admin-border-sub)",
                    background: localSelected.has(sem.id)
                      ? "var(--color-primary-50)"
                      : undefined,
                  }}
                >
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={localSelected.has(sem.id)}
                      onChange={() => toggleSemester(sem.id)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ accentColor: "#8E2A23" }}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2.5" style={{ color: "var(--admin-text)" }}>
                    {sem.name}
                  </td>
                  <td
                    className="px-3 py-2.5 capitalize whitespace-nowrap"
                    style={{ fontSize: 12, color: "var(--admin-text-muted)" }}
                  >
                    {sem.status}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-3 py-6 text-center text-sm"
                    style={{ color: "var(--admin-text-faint)" }}
                  >
                    No seasons match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Footer row */}
          <div
            className="flex items-center justify-between mt-3 pt-3"
            style={{ borderTop: "0.5px solid var(--admin-border)" }}
          >
            <label
              className="flex items-center gap-2 text-sm cursor-pointer"
              style={{ color: "var(--admin-text-muted)" }}
            >
              <input
                type="checkbox"
                checked={showOnlySelected}
                onChange={(e) => setShowOnlySelected(e.target.checked)}
                style={{ accentColor: "#8E2A23" }}
              />
              Only show selected seasons
            </label>
            <span className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
              {localSelected.size} season{localSelected.size !== 1 ? "s" : ""}{" "}
              selected
            </span>
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
            onClick={() => onSave(Array.from(localSelected))}
            className="admin-btn-primary admin-btn-sm cursor-pointer"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
