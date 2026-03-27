"use client";

import { useState } from "react";
import { X, ChevronRight, ChevronLeft, ChevronUp, ChevronDown } from "lucide-react";

export const DEFAULT_SELECTED_COLS = [
  "Participant: Name",
  "Primary P/G: Name",
  "Season name",
  "Session name",
  "Participant: Age",
  "Balance",
];

export const ALL_COLUMNS = [
  "Participant: Name",
  "Primary P/G: Name",
  "Season name",
  "Session name",
  "Participant: Age",
  "Balance",
  "Grade",
  "Date registered",
  "Days of the week",
  "Location",
  "Instructor",
  "Family ID",
  "Parent email",
  "Parent phone",
  "Tuition amount",
  "Discount total",
  "Payment plan type",
  "Registration status",
];

interface Props {
  selected: string[];
  onSave: (cols: string[]) => void;
  onClose: () => void;
}

export function ColumnChooserModal({ selected, onSave, onClose }: Props) {
  const [selCols, setSelCols] = useState<string[]>([...selected]);
  const [availSearch, setAvailSearch] = useState("");
  const [selSearch, setSelSearch] = useState("");
  const [checkedAvail, setCheckedAvail] = useState<Set<string>>(new Set());
  const [checkedSel, setCheckedSel] = useState<Set<string>>(new Set());
  const [allAvailChecked, setAllAvailChecked] = useState(false);
  const [allSelChecked, setAllSelChecked] = useState(false);

  const availCols = ALL_COLUMNS.filter(
    (c) =>
      !selCols.includes(c) &&
      c.toLowerCase().includes(availSearch.toLowerCase()),
  );
  const filteredSel = selCols.filter((c) =>
    c.toLowerCase().includes(selSearch.toLowerCase()),
  );

  const moveToSelected = () => {
    const toAdd = availCols.filter((c) => checkedAvail.has(c));
    setSelCols((p) => [...p, ...toAdd]);
    setCheckedAvail(new Set());
    setAllAvailChecked(false);
  };

  const moveToAvailable = () => {
    setSelCols((p) => p.filter((c) => !checkedSel.has(c)));
    setCheckedSel(new Set());
    setAllSelChecked(false);
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    setSelCols((p) => {
      const n = [...p];
      [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]];
      return n;
    });
  };

  const moveDown = (idx: number) => {
    if (idx >= selCols.length - 1) return;
    setSelCols((p) => {
      const n = [...p];
      [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]];
      return n;
    });
  };

  const toggleAvail = (col: string) => {
    setCheckedAvail((p) => {
      const n = new Set(p);
      if (n.has(col)) n.delete(col);
      else n.add(col);
      return n;
    });
  };

  const toggleSel = (col: string) => {
    setCheckedSel((p) => {
      const n = new Set(p);
      if (n.has(col)) n.delete(col);
      else n.add(col);
      return n;
    });
  };

  const handleAllAvail = (checked: boolean) => {
    setAllAvailChecked(checked);
    setCheckedAvail(checked ? new Set(availCols) : new Set());
  };

  const handleAllSel = (checked: boolean) => {
    setAllSelChecked(checked);
    setCheckedSel(checked ? new Set(selCols) : new Set());
  };

  const panelStyle = {
    border: "0.5px solid var(--admin-border)",
    borderRadius: 8,
    display: "flex" as const,
    flexDirection: "column" as const,
    overflow: "hidden" as const,
    flex: 1,
  };

  const panelHeaderStyle = {
    background: "var(--admin-surface-sub)",
    padding: "8px 12px",
    fontSize: 11,
    fontWeight: 600 as const,
    color: "var(--admin-text-muted)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    borderBottom: "0.5px solid var(--admin-border)",
    display: "flex" as const,
    alignItems: "center" as const,
    gap: 8,
  };

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
          width: 760,
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
            Choose columns
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
        <div className="flex-1 overflow-hidden p-5 flex flex-col gap-0">
          {/* Dual panel */}
          <div className="flex gap-2 items-stretch" style={{ height: 320 }}>
            {/* Available */}
            <div style={panelStyle}>
              <div style={panelHeaderStyle}>
                <input
                  type="checkbox"
                  checked={allAvailChecked}
                  onChange={(e) => handleAllAvail(e.target.checked)}
                  style={{ accentColor: "#8E2A23" }}
                />
                Available columns
              </div>
              <div className="p-2" style={{ borderBottom: "0.5px solid var(--admin-border-sub)" }}>
                <input
                  type="text"
                  placeholder="Search for a column"
                  value={availSearch}
                  onChange={(e) => setAvailSearch(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-md text-xs outline-none"
                  style={{
                    border: "0.5px solid var(--admin-border)",
                    color: "var(--admin-text)",
                  }}
                />
              </div>
              <div className="flex-1 overflow-y-auto">
                {availCols.map((col) => (
                  <div
                    key={col}
                    onClick={() => toggleAvail(col)}
                    className="flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors text-sm"
                    style={{
                      borderBottom: "0.5px solid var(--admin-border-sub)",
                      color: "var(--admin-text)",
                      background: checkedAvail.has(col)
                        ? "var(--admin-surface-sub)"
                        : undefined,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checkedAvail.has(col)}
                      onChange={() => toggleAvail(col)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ accentColor: "#8E2A23", flexShrink: 0 }}
                    />
                    {col}
                  </div>
                ))}
                {availCols.length === 0 && (
                  <p
                    className="px-3 py-4 text-xs text-center"
                    style={{ color: "var(--admin-text-faint)" }}
                  >
                    No columns available
                  </p>
                )}
              </div>
            </div>

            {/* Arrows */}
            <div className="flex flex-col items-center justify-center gap-2 px-1">
              <button
                onClick={moveToSelected}
                title="Add selected"
                className="w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition-colors"
                style={{
                  border: "0.5px solid var(--admin-border)",
                  background: "var(--admin-surface)",
                  color: "var(--admin-text-muted)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "#8E2A23";
                  (e.currentTarget as HTMLButtonElement).style.color = "#fff";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "#8E2A23";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--admin-surface)";
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--admin-text-muted)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--admin-border)";
                }}
              >
                <ChevronRight size={12} />
              </button>
              <button
                onClick={moveToAvailable}
                title="Remove selected"
                className="w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition-colors"
                style={{
                  border: "0.5px solid var(--admin-border)",
                  background: "var(--admin-surface)",
                  color: "var(--admin-text-muted)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "#8E2A23";
                  (e.currentTarget as HTMLButtonElement).style.color = "#fff";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "#8E2A23";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--admin-surface)";
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--admin-text-muted)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--admin-border)";
                }}
              >
                <ChevronLeft size={12} />
              </button>
            </div>

            {/* Selected */}
            <div style={panelStyle}>
              <div style={panelHeaderStyle}>
                <input
                  type="checkbox"
                  checked={allSelChecked}
                  onChange={(e) => handleAllSel(e.target.checked)}
                  style={{ accentColor: "#8E2A23" }}
                />
                Selected columns
              </div>
              <div className="p-2" style={{ borderBottom: "0.5px solid var(--admin-border-sub)" }}>
                <input
                  type="text"
                  placeholder="Search for a column"
                  value={selSearch}
                  onChange={(e) => setSelSearch(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-md text-xs outline-none"
                  style={{
                    border: "0.5px solid var(--admin-border)",
                    color: "var(--admin-text)",
                  }}
                />
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredSel.map((col) => {
                  const realIdx = selCols.indexOf(col);
                  return (
                    <div
                      key={col}
                      onClick={() => toggleSel(col)}
                      className="flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors text-sm"
                      style={{
                        borderBottom: "0.5px solid var(--admin-border-sub)",
                        color: "var(--admin-text)",
                        justifyContent: "space-between",
                        background: checkedSel.has(col)
                          ? "var(--admin-surface-sub)"
                          : undefined,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checkedSel.has(col)}
                          onChange={() => toggleSel(col)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ accentColor: "#8E2A23", flexShrink: 0 }}
                        />
                        {col}
                      </div>
                      <div className="flex flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => moveUp(realIdx)}
                          disabled={realIdx === 0}
                          className="w-5 h-5 rounded flex items-center justify-center cursor-pointer transition-colors disabled:opacity-30"
                          style={{
                            border: "0.5px solid var(--admin-border)",
                            background: "var(--admin-surface)",
                            color: "var(--admin-text-muted)",
                          }}
                        >
                          <ChevronUp size={10} />
                        </button>
                        <button
                          onClick={() => moveDown(realIdx)}
                          disabled={realIdx >= selCols.length - 1}
                          className="w-5 h-5 rounded flex items-center justify-center cursor-pointer transition-colors disabled:opacity-30"
                          style={{
                            border: "0.5px solid var(--admin-border)",
                            background: "var(--admin-surface)",
                            color: "var(--admin-text-muted)",
                          }}
                        >
                          <ChevronDown size={10} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {filteredSel.length === 0 && (
                  <p
                    className="px-3 py-4 text-xs text-center"
                    style={{ color: "var(--admin-text-faint)" }}
                  >
                    No columns selected
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Footer row */}
          <div
            className="flex items-center gap-4 pt-2.5 mt-2.5"
            style={{ borderTop: "0.5px solid var(--admin-border)" }}
          >
            <button
              onClick={() => setSelCols([...DEFAULT_SELECTED_COLS])}
              className="text-xs font-medium cursor-pointer"
              style={{ color: "#8E2A23" }}
            >
              Reset to default
            </button>
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
            onClick={() => onSave(selCols)}
            className="admin-btn-primary admin-btn-sm cursor-pointer"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
