"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { getAttendanceForSession } from "@/queries/instructor";
import { upsertAttendance } from "@/app/instructor/actions/attendance";
import type { AttendanceRecord, AttendanceStatus } from "@/types";
import type { SessionDetail, RosterEntry } from "@/queries/instructor";
import { Check, Pencil, X, ChevronDown, ChevronUp } from "lucide-react";

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

const STATUSES: AttendanceStatus[] = ["present", "absent", "tardy", "excused"];

const STATUS_CFG: Record<
  AttendanceStatus,
  { label: string; sel: string; unsel: string; selText: string; unselText: string }
> = {
  present: { label: "P", sel: "#22c55e", selText: "#fff", unsel: "#f0fdf4", unselText: "#166534" },
  absent:  { label: "A", sel: "#ef4444", selText: "#fff", unsel: "#fef2f2", unselText: "#991b1b" },
  tardy:   { label: "T", sel: "#f97316", selText: "#fff", unsel: "#fff7ed", unselText: "#9a3412" },
  excused: { label: "E", sel: "#3b82f6", selText: "#fff", unsel: "#eff6ff", unselText: "#1e40af" },
};

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

type StudentMark = {
  status:      AttendanceStatus | null;
  note:        string;
  noteOpen:    boolean;
  existingId:  string | null;  // attendance record id, if already saved
  lockedBy:    string | null;  // user id of another instructor who owns this record
};

type SaveState = "idle" | "saving" | "saved" | "error";

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export function AttendanceTab({
  session,
  roster,
}: {
  session: SessionDetail;
  roster:  RosterEntry[];
}) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [selectedDateId, setSelectedDateId] = useState<string | null>(null);
  const [marks, setMarks] = useState<Map<string, StudentMark>>(new Map());
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const dateRowRef = useRef<HTMLDivElement>(null);

  const occurrenceDates = session.occurrenceDates.filter((d) => !d.is_cancelled);
  // Most recent dates first for easy access
  const sortedDates = [...occurrenceDates].sort((a, b) => b.date.localeCompare(a.date));

  // Resolve current user
  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => setCurrentUserId(user?.id ?? null));
  }, []);

  // Fetch all attendance for this session once
  useEffect(() => {
    getAttendanceForSession(session.sessionId).then(setAllAttendance);
  }, [session.sessionId]);

  // Auto-select the most recent past (or today) occurrence date
  useEffect(() => {
    if (selectedDateId || sortedDates.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const best =
      sortedDates.find((d) => d.date <= today) ?? sortedDates[sortedDates.length - 1];
    setSelectedDateId(best?.id ?? null);
  }, [sortedDates, selectedDateId]);

  // Build marks map whenever the selected date or allAttendance changes
  useEffect(() => {
    if (!selectedDateId) return;

    const recordsForDate = allAttendance.filter(
      (r) => r.occurrence_date_id === selectedDateId,
    );
    const recordMap = new Map(recordsForDate.map((r) => [r.dancer_id, r]));

    const newMarks = new Map<string, StudentMark>();
    for (const entry of roster) {
      const existing = recordMap.get(entry.dancer.id);
      newMarks.set(entry.dancer.id, {
        status:     (existing?.status as AttendanceStatus | null) ?? null,
        note:       existing?.note ?? "",
        noteOpen:   !!existing?.note,
        existingId: existing?.id ?? null,
        lockedBy:
          existing && existing.marked_by !== currentUserId
            ? existing.marked_by
            : null,
      });
    }
    setMarks(newMarks);
  }, [selectedDateId, allAttendance, roster, currentUserId]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  function updateMark(dancerId: string, patch: Partial<StudentMark>) {
    setMarks((prev) => {
      const next = new Map(prev);
      next.set(dancerId, { ...prev.get(dancerId)!, ...patch });
      return next;
    });
  }

  const isDirty = (() => {
    for (const [dancerId, mark] of marks) {
      const existing = allAttendance.find(
        (r) => r.dancer_id === dancerId && r.occurrence_date_id === selectedDateId,
      );
      const savedStatus = (existing?.status as AttendanceStatus | null) ?? null;
      const savedNote   = existing?.note ?? "";
      if (mark.status !== savedStatus || mark.note !== savedNote) return true;
    }
    return false;
  })();

  const markedCount = [...marks.values()].filter((m) => m.status !== null).length;

  function dateHasRecords(dateId: string) {
    return allAttendance.some((r) => r.occurrence_date_id === dateId);
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!selectedDateId) return;
    setSaveState("saving");
    setSaveError(null);

    const records = [...marks.entries()]
      .filter(([, m]) => m.status !== null && m.lockedBy === null)
      .map(([dancerId, m]) => ({
        dancerId,
        status: m.status!,
        note:   m.note || null,
      }));

    try {
      await upsertAttendance(session.sessionId, selectedDateId, records);
      const refreshed = await getAttendanceForSession(session.sessionId);
      setAllAttendance(refreshed);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2200);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
      setSaveState("error");
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (occurrenceDates.length === 0) {
    return (
      <div
        className="rounded-2xl px-6 py-12 text-center"
        style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}
      >
        <p className="text-sm" style={{ color: "var(--admin-text-muted)" }}>
          No scheduled dates found for this session.
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--admin-text-faint)" }}>
          Occurrence dates are generated when the semester is configured.
        </p>
      </div>
    );
  }

  const selectedDateObj = occurrenceDates.find((d) => d.id === selectedDateId);

  return (
    <div className="space-y-4">

      {/* ── Date selector ──────────────────────────────────────────── */}
      <div>
        <p
          className="text-[10px] font-semibold uppercase tracking-widest mb-2 px-1"
          style={{ color: "var(--admin-text-faint)" }}
        >
          Select a date
        </p>
        <div
          ref={dateRowRef}
          className="flex gap-2 overflow-x-auto pb-1"
          style={{ scrollbarWidth: "none" }}
        >
          {sortedDates.map((d) => {
            const isSelected = d.id === selectedDateId;
            const hasRecords = dateHasRecords(d.id);
            const dt = new Date(d.date + "T12:00:00");
            const label = dt.toLocaleDateString("en-US", {
              weekday: "short",
              month:   "short",
              day:     "numeric",
            });
            return (
              <button
                key={d.id}
                onClick={() => setSelectedDateId(d.id)}
                className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl shrink-0 transition-all"
                style={{
                  background:   isSelected ? "var(--admin-sidebar-active)" : "var(--admin-surface)",
                  border:       isSelected ? "1px solid transparent" : "1px solid var(--admin-border)",
                  color:        isSelected ? "#fff" : "var(--admin-text-muted)",
                  minWidth:     "80px",
                }}
              >
                <span className="text-xs font-medium whitespace-nowrap">{label}</span>
                {/* Dot indicator: records exist for this date */}
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: hasRecords
                      ? isSelected ? "rgba(255,255,255,0.7)" : "#22c55e"
                      : "transparent",
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Sticky save bar ────────────────────────────────────────── */}
      {selectedDateId && (
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-4 py-2.5 rounded-xl"
          style={{
            background:   "var(--admin-surface)",
            border:       "1px solid var(--admin-border)",
            boxShadow:    "0 2px 8px rgba(0,0,0,0.06)",
          }}
        >
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--admin-text)" }}>
              {markedCount} of {roster.length} marked
            </p>
            {selectedDateObj && (
              <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
                {new Date(selectedDateObj.date + "T12:00:00").toLocaleDateString("en-US", {
                  weekday: "long", month: "long", day: "numeric",
                })}
              </p>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={saveState === "saving" || !isDirty}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
            style={{
              background: saveState === "saved"
                ? "#22c55e"
                : "var(--admin-sidebar-active)",
              color: "#fff",
              minWidth: "90px",
              justifyContent: "center",
            }}
          >
            {saveState === "saving" ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Saving
              </>
            ) : saveState === "saved" ? (
              <>
                <Check size={14} />
                Saved
              </>
            ) : (
              "Save"
            )}
          </button>
        </div>
      )}

      {saveState === "error" && (
        <p className="text-sm text-red-600 px-1">{saveError ?? "Something went wrong."}</p>
      )}

      {/* ── Student list ────────────────────────────────────────────── */}
      {selectedDateId && roster.length === 0 && (
        <div
          className="rounded-2xl px-6 py-10 text-center text-sm"
          style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)", color: "var(--admin-text-faint)" }}
        >
          No students enrolled in this session.
        </div>
      )}

      {selectedDateId && roster.length > 0 && (
        <div className="space-y-2">
          {roster.map((entry) => {
            const mark = marks.get(entry.dancer.id);
            if (!mark) return null;
            return (
              <StudentAttendanceRow
                key={entry.dancer.id}
                entry={entry}
                mark={mark}
                onStatusChange={(status) =>
                  updateMark(entry.dancer.id, { status })
                }
                onNoteChange={(note) =>
                  updateMark(entry.dancer.id, { note })
                }
                onToggleNote={() =>
                  updateMark(entry.dancer.id, { noteOpen: !mark.noteOpen })
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* StudentAttendanceRow                                                        */
/* -------------------------------------------------------------------------- */

function StudentAttendanceRow({
  entry,
  mark,
  onStatusChange,
  onNoteChange,
  onToggleNote,
}: {
  entry:          RosterEntry;
  mark:           StudentMark;
  onStatusChange: (s: AttendanceStatus) => void;
  onNoteChange:   (n: string) => void;
  onToggleNote:   () => void;
}) {
  const initials = `${entry.dancer.firstName[0]}${entry.dancer.lastName[0]}`.toUpperCase();
  const isLocked = mark.lockedBy !== null;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "var(--admin-surface)",
        border:     "1px solid var(--admin-border)",
        opacity:    isLocked ? 0.75 : 1,
      }}
    >
      {/* Top row: avatar + name + status buttons */}
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-2">
        {/* Avatar */}
        <div
          className="flex items-center justify-center rounded-full text-xs font-semibold shrink-0"
          style={{
            width: 36, height: 36,
            background: mark.status
              ? STATUS_CFG[mark.status].sel + "22"  // 13% opacity tint
              : "var(--admin-surface-sub)",
            color: mark.status
              ? STATUS_CFG[mark.status].sel
              : "var(--admin-text-muted)",
          }}
        >
          {initials}
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: "var(--admin-text)" }}>
            {entry.dancer.firstName} {entry.dancer.lastName}
          </p>
          {isLocked && (
            <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
              Marked by another instructor
            </p>
          )}
        </div>
      </div>

      {/* Status buttons — full width, big touch targets */}
      <div className="flex px-4 pb-3 gap-2">
        {STATUSES.map((s) => {
          const cfg      = STATUS_CFG[s];
          const isActive = mark.status === s;
          return (
            <button
              key={s}
              disabled={isLocked}
              onClick={() => onStatusChange(s)}
              className="flex-1 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:cursor-not-allowed"
              style={{
                height:     "44px", // WCAG minimum touch target
                background: isActive ? cfg.sel    : cfg.unsel,
                color:      isActive ? cfg.selText : cfg.unselText,
                border:     isActive ? "2px solid transparent" : "1px solid transparent",
              }}
            >
              {cfg.label}
            </button>
          );
        })}

        {/* Note toggle button */}
        <button
          onClick={onToggleNote}
          className="flex items-center justify-center rounded-xl transition-colors"
          style={{
            width:      "44px",
            height:     "44px",
            background: mark.noteOpen || mark.note
              ? "var(--admin-surface-sub)"
              : "transparent",
            color: mark.noteOpen || mark.note
              ? "var(--admin-text)"
              : "var(--admin-text-faint)",
            flexShrink: 0,
          }}
          aria-label={mark.noteOpen ? "Hide note" : "Add note"}
        >
          <Pencil size={14} />
        </button>
      </div>

      {/* Note field — inline expand */}
      {mark.noteOpen && (
        <div className="px-4 pb-3.5" style={{ borderTop: "1px solid var(--admin-border-sub)" }}>
          <textarea
            value={mark.note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Add a note…"
            rows={2}
            disabled={isLocked}
            className="w-full text-sm rounded-xl px-3 py-2.5 resize-none focus:outline-none mt-2.5"
            style={{
              background: "var(--admin-surface-sub)",
              border:     "1px solid var(--admin-border-sub)",
              color:      "var(--admin-text)",
              fontSize:   "16px", // prevents iOS zoom on focus
            }}
          />
        </div>
      )}
    </div>
  );
}
