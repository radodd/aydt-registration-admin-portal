"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Plus,
  X,
  Filter,
  Columns,
  Layers,
  Download,
  Save,
  ChevronRight,
  Mail,
  ArrowUpDown,
} from "lucide-react";
import type { ReportFilter, ReportRow, ReportSemester } from "@/types";
import { getReportData } from "./actions";
import { SeasonSelectorModal } from "./_components/SeasonSelectorModal";
import { FilterCriteriaModal } from "./_components/FilterCriteriaModal";
import {
  ColumnChooserModal,
  DEFAULT_SELECTED_COLS,
} from "./_components/ColumnChooserModal";
import { GroupRecordsModal } from "./_components/GroupRecordsModal";
import { useToast } from "@/app/components/Toast";

/* ── Column key map ────────────────────────────────────────────────────────── */
const COL_KEY: Record<string, keyof ReportRow | string> = {
  "Participant: Name": "dancerName",
  "Primary P/G: Name": "parentName",
  "Season name": "seasonName",
  "Session name": "sessionName",
  "Participant: Age": "age",
  Balance: "balance",
  Grade: "grade",
  "Date registered": "dateRegistered",
  "Days of the week": "daysOfWeek",
  Location: "location",
  Instructor: "instructor",
  "Family ID": "familyId",
  "Parent email": "parentEmail",
  "Parent phone": "parentPhone",
  "Tuition amount": "tuitionAmount",
  "Discount total": "discountTotal",
  "Payment plan type": "paymentPlanType",
  "Registration status": "registrationStatus",
};

/* ── Formatting helpers ────────────────────────────────────────────────────── */
function formatCell(col: string, row: ReportRow): string {
  const key = COL_KEY[col] as keyof ReportRow;
  const val = row[key];
  if (val === null || val === undefined) return "—";
  if (col === "Balance" || col === "Tuition amount" || col === "Discount total") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(val));
  }
  if (col === "Date registered") {
    return new Date(String(val)).toLocaleDateString();
  }
  if (col === "Payment plan type") {
    return String(val).replace(/_/g, " ");
  }
  return String(val);
}

function getCellValue(col: string, row: ReportRow): string | number | null {
  const key = COL_KEY[col] as keyof ReportRow;
  return (row[key] as string | number | null) ?? null;
}

/* ── Filter application ────────────────────────────────────────────────────── */
function applyFilters(rows: ReportRow[], filters: ReportFilter[]): ReportRow[] {
  if (!filters.length) return rows;
  return rows.filter((row) => {
    for (const f of filters) {
      const val = String((row as any)[f.field] ?? "").toLowerCase();
      const fVal = f.value.toLowerCase();
      if (f.field === "balance") {
        const bal = row.balance;
        if (f.value === "zero" && bal !== 0) return false;
        if (f.value === "positive" && bal <= 0) return false;
        if (f.value === "over100" && bal <= 100) return false;
      } else if (f.field === "dateRegistered" && f.valueTo) {
        const d = new Date(row.dateRegistered).getTime();
        const from = new Date(f.value).getTime();
        const to = new Date(f.valueTo).getTime();
        if (d < from || d > to) return false;
      } else if (!val.includes(fVal)) {
        return false;
      }
    }
    return true;
  });
}

/* ── Filter chip label ─────────────────────────────────────────────────────── */
const FILTER_LABELS: Record<string, string> = {
  dateRegistered: "Registration date",
  sessionName: "Session",
  registrationStatus: "Registration status",
  grade: "Grade",
  balance: "Balance",
  paymentPlanType: "Payment plan",
};

function filterChipLabel(f: ReportFilter): string {
  const label = FILTER_LABELS[f.field] ?? f.field;
  const val = f.value.replace(/_/g, " ");
  return `${label}: ${val}`;
}

/* ── Group-by label ────────────────────────────────────────────────────────── */
const GROUP_LABELS: Record<string, string> = {
  grade: "Grade",
  age: "Age",
  seasonName: "Season name",
  sessionName: "Session name",
  paymentPlanType: "Payment plan",
  registrationStatus: "Status",
};

/* ── CSV export ────────────────────────────────────────────────────────────── */
function exportCSV(columns: string[], rows: ReportRow[], filename: string) {
  const headers = columns.join(",");
  const body = rows
    .map((row) =>
      columns
        .map((col) => {
          const v = formatCell(col, row);
          return `"${v.replace(/"/g, '""')}"`;
        })
        .join(","),
    )
    .join("\n");
  const blob = new Blob([headers + "\n" + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}


/* ── Component ─────────────────────────────────────────────────────────────── */
interface Props {
  semesters: ReportSemester[];
  initialRows: ReportRow[];
  defaultSemesterId: string;
}

const STORAGE_KEY = "aydt_report_config";

export function ReportsClient({
  semesters,
  initialRows,
  defaultSemesterId,
}: Props) {
  // Config state — load from localStorage on mount
  const [columns, setColumns] = useState<string[]>(DEFAULT_SELECTED_COLS);
  const [filters, setFilters] = useState<ReportFilter[]>([]);
  const [groupBy, setGroupBy] = useState<string>("none");

  // Data state
  const [selectedSemesterIds, setSelectedSemesterIds] = useState<string[]>([
    defaultSemesterId,
  ]);
  const [rows, setRows] = useState<ReportRow[]>(initialRows);
  const [loading, setLoading] = useState(false);

  // Sort state
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Row selection
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  // Modal states
  const [showSeason, setShowSeason] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [showGroup, setShowGroup] = useState(false);

  // Dropdown states
  const [exportOpen, setExportOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const toast = useToast();

  // Load persisted config on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const cfg = JSON.parse(raw);
        if (cfg.columns?.length) setColumns(cfg.columns);
        if (cfg.filters) setFilters(cfg.filters);
        if (cfg.groupBy) setGroupBy(cfg.groupBy);
      }
    } catch {
      // ignore
    }
  }, []);

  // Close dropdowns on outside click
  const exportRef = useRef<HTMLDivElement>(null);
  const customizeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false);
      if (!customizeRef.current?.contains(e.target as Node))
        setCustomizeOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Re-fetch when semester selection changes
  useEffect(() => {
    if (!selectedSemesterIds.length) return;
    setLoading(true);
    getReportData(selectedSemesterIds)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [selectedSemesterIds]);

  // Derived: filtered + sorted rows
  const filteredRows = useMemo(
    () => applyFilters(rows, filters),
    [rows, filters],
  );

  const sortedRows = useMemo(() => {
    if (!sortCol) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      const av = getCellValue(sortCol, a);
      const bv = getCellValue(sortCol, b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredRows, sortCol, sortDir]);

  // Grouped rows
  const groupedData = useMemo(() => {
    if (groupBy === "none") return null;
    const groups: Record<string, ReportRow[]> = {};
    for (const row of sortedRows) {
      const key = String((row as any)[groupBy] ?? "—") || "—";
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    }
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [sortedRows, groupBy]);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const handleSave = () => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ columns, filters, groupBy }),
      );
      toast.success("Report configuration saved.");
    } catch {
      toast.error("Could not save configuration.");
    }
  };

  const handleExportCSV = () => {
    exportCSV(
      columns,
      sortedRows,
      `aydt-report-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    setExportOpen(false);
    toast.info("Exporting as CSV…");
  };

  const handleExportPDF = () => {
    setExportOpen(false);
    window.print();
  };

  const handleSeasonSave = (ids: string[]) => {
    setSelectedSemesterIds(ids.length ? ids : [defaultSemesterId]);
    setShowSeason(false);
    toast.info("Season filter updated.");
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) setSelectedRowIds(new Set(sortedRows.map((r) => r.id)));
    else setSelectedRowIds(new Set());
  };

  const toggleRow = (id: string) => {
    setSelectedRowIds((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const allSelected =
    sortedRows.length > 0 &&
    sortedRows.every((r) => selectedRowIds.has(r.id));

  const selectedSemesters = semesters.filter((s) =>
    selectedSemesterIds.includes(s.id),
  );
  const seasonLabel =
    selectedSemesters.length === 1
      ? selectedSemesters[0].name
      : `${selectedSemesters.length} of ${semesters.length} seasons`;

  // Unique sessions from loaded rows for filter modal
  const sessionOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { id: string; label: string }[] = [];
    for (const row of rows) {
      if (!seen.has(row.sessionName)) {
        seen.add(row.sessionName);
        opts.push({ id: row.sessionName, label: row.sessionName });
      }
    }
    return opts;
  }, [rows]);

  const btnOutlineStyle = {
    display: "inline-flex" as const,
    alignItems: "center" as const,
    gap: 5,
    padding: "7px 13px",
    borderRadius: 7,
    fontSize: 13,
    fontWeight: 600,
    border: "0.5px solid var(--admin-border)",
    background: "transparent",
    color: "var(--admin-text)",
    cursor: "pointer" as const,
    whiteSpace: "nowrap" as const,
  };

  const dropdownMenuStyle = {
    position: "absolute" as const,
    top: "calc(100% + 6px)",
    right: 0,
    background: "var(--admin-surface)",
    border: "0.5px solid var(--admin-border)",
    borderRadius: 10,
    boxShadow: "var(--shadow-dropdown)",
    minWidth: 180,
    zIndex: 100,
    overflow: "hidden" as const,
  };

  const dropdownItemStyle = {
    display: "flex" as const,
    alignItems: "center" as const,
    gap: 8,
    padding: "9px 14px",
    fontSize: 13,
    color: "var(--admin-text)",
    cursor: "pointer" as const,
    transition: "background 0.1s",
  };

  return (
    <>
      {/* Semester header */}
      <div
        style={{
          background: "var(--admin-surface)",
          borderBottom: "0.5px solid var(--admin-border)",
          padding: "20px 24px 0",
        }}
      >
        <div className="flex flex-wrap items-start justify-between mb-4 gap-2">
          <h1
            className="text-xl font-medium"
            style={{ color: "var(--admin-text)" }}
          >
            {selectedSemesters.length === 1
              ? selectedSemesters[0].name
              : "Multiple seasons"}
          </h1>
          <button
            onClick={() => setShowSeason(true)}
            style={{ ...btnOutlineStyle, fontSize: 12 }}
          >
            View another season
            <ChevronDown size={13} />
          </button>
        </div>
      </div>

      {/* Report content */}
      <div style={{ padding: 24 }}>
        {/* Toolbar — wraps on mobile */}
        <div className="flex flex-wrap items-center justify-between mb-4 gap-2">
          <span
            className="text-base font-semibold"
            style={{ color: "var(--admin-text)" }}
          >
            Custom report
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleSave}
              className="admin-btn-primary admin-btn-sm cursor-pointer"
            >
              <Save size={13} />
              Save report
            </button>

            {/* Export dropdown */}
            <div ref={exportRef} style={{ position: "relative" }}>
              <button
                onClick={() => setExportOpen((p) => !p)}
                style={btnOutlineStyle}
              >
                Export report
                <ChevronDown size={13} />
              </button>
              {exportOpen && (
                <div style={dropdownMenuStyle}>
                  <div
                    style={dropdownItemStyle}
                    onClick={handleExportCSV}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLDivElement).style.background =
                        "var(--admin-surface-sub)")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLDivElement).style.background =
                        "transparent")
                    }
                  >
                    Export as CSV
                  </div>
                  <div
                    style={dropdownItemStyle}
                    onClick={handleExportPDF}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLDivElement).style.background =
                        "var(--admin-surface-sub)")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLDivElement).style.background =
                        "transparent")
                    }
                  >
                    Export as PDF
                  </div>
                </div>
              )}
            </div>

            {/* Customize dropdown */}
            <div ref={customizeRef} style={{ position: "relative" }}>
              <button
                onClick={() => setCustomizeOpen((p) => !p)}
                style={btnOutlineStyle}
              >
                Customize
                <ChevronDown size={13} />
              </button>
              {customizeOpen && (
                <div style={dropdownMenuStyle}>
                  <div
                    style={dropdownItemStyle}
                    onClick={() => {
                      setShowColumns(true);
                      setCustomizeOpen(false);
                    }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLDivElement).style.background =
                        "var(--admin-surface-sub)")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLDivElement).style.background =
                        "transparent")
                    }
                  >
                    <Columns size={13} />
                    Edit columns
                  </div>
                  <div
                    style={dropdownItemStyle}
                    onClick={() => {
                      setShowFilter(true);
                      setCustomizeOpen(false);
                    }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLDivElement).style.background =
                        "var(--admin-surface-sub)")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLDivElement).style.background =
                        "transparent")
                    }
                  >
                    <Filter size={13} />
                    Edit filter criteria
                  </div>
                  <div
                    style={{
                      height: "0.5px",
                      background: "var(--admin-border)",
                      margin: "4px 0",
                    }}
                  />
                  <div
                    style={dropdownItemStyle}
                    onClick={() => {
                      setShowGroup(true);
                      setCustomizeOpen(false);
                    }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLDivElement).style.background =
                        "var(--admin-surface-sub)")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLDivElement).style.background =
                        "transparent")
                    }
                  >
                    <Layers size={13} />
                    Group records
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Meta bar */}
        <div
          style={{
            background: "var(--admin-surface)",
            border: "0.5px solid var(--admin-border)",
            borderRadius: "10px 10px 0 0",
            borderBottom: "none",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: 0,
          }}
        >
          <div className="flex items-center gap-2 flex-1">
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--admin-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                minWidth: 52,
              }}
            >
              Season
            </span>
            <span
              className="text-sm font-medium"
              style={{ color: "var(--admin-text)" }}
            >
              {seasonLabel}
            </span>
            <button
              onClick={() => setShowSeason(true)}
              className="flex items-center gap-1 text-xs font-medium cursor-pointer px-1.5 py-0.5 rounded transition-colors"
              style={{ color: "#8E2A23" }}
            >
              Edit
            </button>
          </div>
          <div
            className="flex items-center gap-2 flex-1"
            style={{
              borderLeft: "0.5px solid var(--admin-border)",
              paddingLeft: 20,
              marginLeft: 20,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--admin-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                minWidth: 52,
              }}
            >
              Session
            </span>
            <span
              className="text-sm font-medium"
              style={{ color: "var(--admin-text)" }}
            >
              All sessions
            </span>
          </div>
          <span
            className="text-xs ml-auto"
            style={{ color: "var(--admin-text-muted)" }}
          >
            Showing {sortedRows.length} of {rows.length}
          </span>
        </div>

        {/* Filter row */}
        <div
          style={{
            background: "var(--admin-surface)",
            border: "0.5px solid var(--admin-border)",
            borderTop: "0.5px solid var(--admin-border-sub)",
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            borderBottom: "none",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--admin-text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              minWidth: 52,
            }}
          >
            Filters
          </span>
          <div className="flex items-center gap-2 flex-wrap flex-1">
            {filters.length === 0 && (
              <span
                className="text-xs"
                style={{ color: "var(--admin-text-faint)" }}
              >
                No filters applied
              </span>
            )}
            {filters.map((f, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-full text-xs font-medium"
                style={{
                  background: "var(--color-primary-50)",
                  border: "0.5px solid var(--color-primary-200)",
                  color: "#7B1F1A",
                  padding: "3px 8px 3px 10px",
                }}
              >
                {filterChipLabel(f)}
                <button
                  onClick={() =>
                    setFilters((p) => p.filter((_, idx) => idx !== i))
                  }
                  className="w-3.5 h-3.5 rounded-full flex items-center justify-center cursor-pointer flex-shrink-0"
                  style={{ background: "rgba(142,42,35,0.12)" }}
                >
                  <X size={8} color="#8E2A23" />
                </button>
              </span>
            ))}
          </div>
          <button
            onClick={() => setShowFilter(true)}
            className="inline-flex items-center gap-1 text-xs font-medium cursor-pointer rounded px-1.5 py-0.5 transition-colors"
            style={{ color: "#8E2A23" }}
          >
            <Plus size={12} />
            Edit filter criteria
          </button>
        </div>

        {/* Action row */}
        <div
          style={{
            background: "var(--admin-surface)",
            border: "0.5px solid var(--admin-border)",
            borderTop: "0.5px solid var(--admin-border-sub)",
            padding: "10px 16px",
            borderBottom: "none",
          }}
        >
          <button
            className="inline-flex items-center gap-1.5 cursor-pointer rounded-lg transition-colors"
            style={{
              padding: "5px 10px",
              fontSize: 12,
              fontWeight: 600,
              border: "0.5px solid var(--admin-border)",
              background: "transparent",
              color: "var(--admin-text-muted)",
            }}
            onClick={() => toast.info("Email composer will open for selected participants.")}
          >
            <Mail size={13} />
            Email selected people
          </button>
        </div>

        {/* Table */}
        <div
          style={{
            background: "var(--admin-surface)",
            border: "0.5px solid var(--admin-border)",
            borderRadius: "0 0 10px 10px",
            overflow: "hidden",
          }}
        >
          {loading ? (
            <div
              className="flex items-center justify-center py-16"
              style={{ color: "var(--admin-text-faint)" }}
            >
              <div
                className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mr-3"
                style={{
                  borderColor: "#8E2A23",
                  borderTopColor: "transparent",
                }}
              />
              Loading report data…
            </div>
          ) : (
            <table className="w-full border-collapse" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th
                    style={{
                      background: "var(--admin-table-header-bg)",
                      color: "var(--admin-table-header-text)",
                      padding: "10px 14px",
                      width: 36,
                      borderRight: "0.5px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      style={{ accentColor: "#fff", width: 14, height: 14 }}
                      className="cursor-pointer"
                    />
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col}
                      onClick={() => handleSort(col)}
                      className="cursor-pointer select-none"
                      style={{
                        background: "var(--admin-table-header-bg)",
                        color: "var(--admin-table-header-text)",
                        fontSize: 11,
                        fontWeight: 500,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        padding: "10px 14px",
                        textAlign: "left",
                        borderRight: "0.5px solid rgba(255,255,255,0.1)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col}
                        {sortCol === col ? (
                          <span style={{ opacity: 0.8 }}>
                            {sortDir === "asc" ? "↑" : "↓"}
                          </span>
                        ) : (
                          <ArrowUpDown size={10} style={{ opacity: 0.4 }} />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupBy === "none"
                  ? sortedRows.map((row) => (
                      <ReportTableRow
                        key={row.id}
                        row={row}
                        columns={columns}
                        selected={selectedRowIds.has(row.id)}
                        onToggle={() => toggleRow(row.id)}
                      />
                    ))
                  : (groupedData ?? []).map(([groupKey, groupRows]) => (
                      <>
                        <tr
                          key={`group-${groupKey}`}
                          style={{ background: "var(--admin-surface-sub)" }}
                        >
                          <td
                            colSpan={columns.length + 1}
                            style={{ padding: "0 14px" }}
                          >
                            <div
                              className="flex items-center gap-2 py-2"
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: "var(--admin-text-muted)",
                              }}
                            >
                              <ChevronRight size={12} />
                              {GROUP_LABELS[groupBy] ?? groupBy} —{" "}
                              {groupKey}
                              <span
                                className="rounded-full px-1.5 py-0.5 text-xs"
                                style={{
                                  background: "var(--admin-border)",
                                  color: "var(--admin-text-muted)",
                                }}
                              >
                                {groupRows.length}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {groupRows.map((row) => (
                          <ReportTableRow
                            key={row.id}
                            row={row}
                            columns={columns}
                            selected={selectedRowIds.has(row.id)}
                            onToggle={() => toggleRow(row.id)}
                          />
                        ))}
                      </>
                    ))}
                {sortedRows.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={columns.length + 1}
                      className="text-center py-12 text-sm"
                      style={{ color: "var(--admin-text-faint)" }}
                    >
                      No registrations found for the selected season and
                      filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modals */}
      {showSeason && (
        <SeasonSelectorModal
          semesters={semesters}
          selectedIds={selectedSemesterIds}
          onSave={handleSeasonSave}
          onClose={() => setShowSeason(false)}
        />
      )}
      {showFilter && (
        <FilterCriteriaModal
          sessions={sessionOptions}
          filters={filters}
          onApply={(f) => {
            setFilters(f);
            setShowFilter(false);
            toast.info("Filters applied.");
          }}
          onClose={() => setShowFilter(false)}
        />
      )}
      {showColumns && (
        <ColumnChooserModal
          selected={columns}
          onSave={(cols) => {
            setColumns(cols);
            setShowColumns(false);
          }}
          onClose={() => setShowColumns(false)}
        />
      )}
      {showGroup && (
        <GroupRecordsModal
          groupBy={groupBy}
          rows={sortedRows}
          onApply={(g) => {
            setGroupBy(g);
            setShowGroup(false);
          }}
          onClose={() => setShowGroup(false)}
        />
      )}
    </>
  );
}

/* ── Row sub-component ─────────────────────────────────────────────────────── */
function ReportTableRow({
  row,
  columns,
  selected,
  onToggle,
}: {
  row: ReportRow;
  columns: string[];
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <tr
      style={{
        background: selected ? "var(--color-primary-50)" : undefined,
        cursor: "pointer",
      }}
      onClick={onToggle}
    >
      <td
        style={{
          padding: "9px 14px",
          borderBottom: "0.5px solid var(--admin-table-border)",
          borderRight: "0.5px solid var(--admin-border-sub)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          style={{ accentColor: "#8E2A23", width: 14, height: 14 }}
          className="cursor-pointer"
        />
      </td>
      {columns.map((col) => {
        const isName = col === "Participant: Name";
        const cellStyle: React.CSSProperties = {
          padding: "9px 14px",
          borderBottom: "0.5px solid var(--admin-table-border)",
          borderRight: "0.5px solid var(--admin-border-sub)",
          verticalAlign: "middle",
          color: isName ? "#8E2A23" : "var(--admin-text-muted)",
          fontWeight: isName ? 500 : undefined,
          fontVariantNumeric:
            col === "Balance" || col === "Tuition amount"
              ? "tabular-nums"
              : undefined,
          textAlign:
            col === "Balance" || col === "Tuition amount" ? "right" : "left",
        };

        if (isName && row.dancerId) {
          return (
            <td key={col} style={cellStyle} onClick={(e) => e.stopPropagation()}>
              <Link
                href={`/admin/dancers/${row.dancerId}`}
                className="hover:underline"
                style={{ color: "#8E2A23" }}
              >
                {formatCell(col, row)}
              </Link>
            </td>
          );
        }

        return (
          <td key={col} style={cellStyle}>
            {formatCell(col, row)}
          </td>
        );
      })}
    </tr>
  );
}
