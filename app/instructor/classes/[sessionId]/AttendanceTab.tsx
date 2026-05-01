"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { getAttendanceForSession } from "@/queries/instructor";
import { upsertAttendance } from "@/app/instructor/actions/attendance";
import type { AttendanceRecord, AttendanceStatus } from "@/types";
import type { SessionDetail, RosterEntry } from "@/queries/instructor";
import { Check, Pencil } from "lucide-react";

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

const STATUSES: AttendanceStatus[] = ["present", "absent", "tardy", "excused"];

const STATUS_LETTER: Record<AttendanceStatus, string> = {
  present: "P", absent: "A", tardy: "T", excused: "E",
};

const STATUS_COLORS: Record<AttendanceStatus, { bg: string; color: string; border: string }> = {
  present: { bg: "#EAF3DE", color: "#3B6D11", border: "#3B6D11" },
  absent:  { bg: "#FCEBEB", color: "#A32D2D", border: "#A32D2D" },
  tardy:   { bg: "#FAEEDA", color: "#854F0B", border: "#854F0B" },
  excused: { bg: "#E6F1FB", color: "#185FA5", border: "#185FA5" },
};

type StudentMark = {
  status:     AttendanceStatus | null;
  note:       string;
  noteOpen:   boolean;
  existingId: string | null;
  lockedBy:   string | null;
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

  const occurrenceDates = useMemo(
    () => session.occurrenceDates.filter((d) => !d.is_cancelled),
    [session.occurrenceDates],
  );
  // Chronological ascending — matches mockup left-to-right scrolling.
  const sortedDates = useMemo(
    () => [...occurrenceDates].sort((a, b) => a.date.localeCompare(b.date)),
    [occurrenceDates],
  );

  // Resolve current user
  useEffect(() => {
    createClient().auth.getUser()
      .then(({ data: { user } }) => setCurrentUserId(user?.id ?? null));
  }, []);

  // Fetch all attendance for this session once
  useEffect(() => {
    getAttendanceForSession(session.sessionId).then(setAllAttendance);
  }, [session.sessionId]);

  // Auto-select: today's occurrence if present, else most recent past unmarked,
  // else most recent past, else first future.
  useEffect(() => {
    if (selectedDateId || sortedDates.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const todayMatch = sortedDates.find((d) => d.date === today);
    if (todayMatch) { setSelectedDateId(todayMatch.id); return; }
    const past = sortedDates.filter((d) => d.date < today);
    const pastUnmarked = past.find(
      (d) => !allAttendance.some((r) => r.occurrence_date_id === d.id),
    );
    const fallback = pastUnmarked ?? past[past.length - 1] ?? sortedDates[0];
    setSelectedDateId(fallback?.id ?? null);
  }, [sortedDates, selectedDateId, allAttendance]);

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

  function markAllPresent() {
    setMarks((prev) => {
      const next = new Map(prev);
      for (const [dancerId, mark] of prev) {
        if (mark.lockedBy) continue;       // don't overwrite another instructor
        if (mark.status === null) {
          next.set(dancerId, { ...mark, status: "present" });
        }
      }
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

  function isPartiallyMarked(dateId: string) {
    if (!dateHasRecords(dateId)) return false;
    const recordsForDate = allAttendance.filter((r) => r.occurrence_date_id === dateId);
    return recordsForDate.length < roster.length;
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
      </div>
    );
  }

  const selectedDateObj = occurrenceDates.find((d) => d.id === selectedDateId);
  const selectedDateLabel = selectedDateObj
    ? new Date(selectedDateObj.date + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric",
      })
    : "";

  // Progress ring math: r=16 → circumference ≈ 100.5
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const progressOffset = roster.length > 0
    ? circumference - (markedCount / roster.length) * circumference
    : circumference;

  return (
    <div className="space-y-3">
      {/* ── Date selector ─────────────────────────────────────────── */}
      <div>
        <p
          className="text-[11px] font-semibold uppercase tracking-wider mb-2 px-1"
          style={{ color: "var(--admin-text-faint)" }}
        >
          Select a date
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
          {sortedDates.map((d) => {
            const isSelected = d.id === selectedDateId;
            const hasRecords = dateHasRecords(d.id);
            const isPartial  = isPartiallyMarked(d.id);
            const dt = new Date(d.date + "T12:00:00");
            const dow   = dt.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
            const label = dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            return (
              <button
                key={d.id}
                onClick={() => setSelectedDateId(d.id)}
                className="relative shrink-0 px-3.5 py-2 rounded-lg transition-colors"
                style={{
                  background: isSelected ? "var(--admin-text)" : "var(--admin-surface)",
                  border:     `1px solid ${isSelected ? "var(--admin-text)" : "var(--admin-border)"}`,
                  color:      isSelected ? "#fff" : "var(--admin-text-muted)",
                  minWidth:   76,
                }}
              >
                <div
                  className="text-[10px] tracking-wide font-medium"
                  style={{ color: isSelected ? "rgba(255,255,255,0.6)" : "var(--admin-text-faint)" }}
                >
                  {dow}
                </div>
                <div
                  className="text-sm font-medium"
                  style={{ color: isSelected ? "#fff" : "var(--admin-text)" }}
                >
                  {label}
                </div>
                {hasRecords && (
                  <span
                    className="absolute top-1.5 right-1.5 rounded-full"
                    style={{
                      width: 6, height: 6,
                      background: isPartial ? "#854F0B" : "#3B6D11",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-[11px] px-1" style={{ color: "var(--admin-text-faint)" }}>
        <span className="inline-flex items-center gap-1.5">
          <span style={{ display: "inline-block", width: 8, height: 8, background: "#3B6D11", borderRadius: 2 }} />
          Saved
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span style={{ display: "inline-block", width: 8, height: 8, background: "#854F0B", borderRadius: 2 }} />
          Partial
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span style={{ display: "inline-block", width: 8, height: 8, background: "var(--admin-border-sub)", borderRadius: 2 }} />
          Not yet marked
        </span>
      </div>

      {/* ── Summary bar with progress ring ─────────────────────── */}
      <div
        className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
        style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="relative shrink-0" style={{ width: 38, height: 38 }}>
            <svg width="38" height="38" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="19" cy="19" r={radius} stroke="var(--admin-border)" strokeWidth="3" fill="none" />
              <circle
                cx="19" cy="19" r={radius}
                stroke="var(--admin-sidebar-active)"
                strokeWidth="3"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={progressOffset}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 0.25s" }}
              />
            </svg>
            <div
              className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold"
              style={{ color: "var(--admin-text)" }}
            >
              {markedCount}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium" style={{ color: "var(--admin-text)" }}>
              {markedCount} of {roster.length} marked
            </div>
            <div className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
              {selectedDateLabel}
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={markAllPresent}
            className="px-3.5 py-2 rounded-lg text-xs font-medium"
            style={{
              border: "1px solid var(--admin-border-sub)",
              color:  "var(--admin-text)",
              background: "transparent",
            }}
          >
            Mark all present
          </button>
          <button
            onClick={handleSave}
            disabled={saveState === "saving" || !isDirty}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{
              background: saveState === "saved" ? "#3B6D11" : "var(--admin-sidebar-active)",
              color: "#fff",
              minWidth: 80,
            }}
          >
            {saveState === "saving" ? (
              <>
                <span
                  style={{
                    display: "inline-block", width: 12, height: 12,
                    border: "2px solid rgba(255,255,255,0.4)",
                    borderTopColor: "#fff",
                    borderRadius: "50%",
                    animation: "spin 0.7s linear infinite",
                  }}
                />
                Saving
              </>
            ) : saveState === "saved" ? (
              <><Check size={14} /> Saved</>
            ) : (
              "Save"
            )}
          </button>
        </div>
      </div>

      {saveState === "error" && (
        <p className="text-xs px-1" style={{ color: "#A32D2D" }}>
          {saveError ?? "Something went wrong."}
        </p>
      )}

      {/* ── Student rows ──────────────────────────────────────── */}
      {roster.length === 0 ? (
        <div
          className="rounded-2xl px-6 py-10 text-center text-sm"
          style={{
            background: "var(--admin-surface)",
            border: "1px solid var(--admin-border)",
            color: "var(--admin-text-faint)",
          }}
        >
          No students enrolled in this session.
        </div>
      ) : (
        <div className="space-y-2">
          {roster.map((entry) => {
            const mark = marks.get(entry.dancer.id);
            if (!mark) return null;
            return (
              <StudentAttendanceRow
                key={entry.dancer.id}
                entry={entry}
                mark={mark}
                onStatusChange={(status) => updateMark(entry.dancer.id, { status })}
                onNoteChange={(note) => updateMark(entry.dancer.id, { note })}
                onToggleNote={() => updateMark(entry.dancer.id, { noteOpen: !mark.noteOpen })}
              />
            );
          })}
        </div>
      )}

      {/* Spinner keyframes */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* StudentAttendanceRow — horizontal P/A/T/E + note pencil                     */
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
  const hasNote  = !!mark.note.trim();

  return (
    <div
      className="rounded-2xl"
      style={{
        background: "var(--admin-surface)",
        border:     "1px solid var(--admin-border)",
        opacity:    isLocked ? 0.7 : 1,
      }}
    >
      <div className="flex items-center gap-3 px-3.5 py-3 flex-wrap sm:flex-nowrap">
        {/* Avatar */}
        <div
          className="flex items-center justify-center rounded-full text-xs font-semibold shrink-0"
          style={{
            width: 36, height: 36,
            background: "var(--admin-surface-sub)",
            color: "var(--admin-sidebar-active)",
          }}
        >
          {initials}
        </div>

        {/* Name + term avg */}
        <div className="min-w-0" style={{ flex: "0 0 auto", width: 150 }}>
          <p className="text-sm font-medium truncate" style={{ color: "var(--admin-text)" }}>
            {entry.dancer.firstName} {entry.dancer.lastName}
          </p>
          {isLocked ? (
            <p className="text-[11px]" style={{ color: "var(--admin-text-faint)" }}>
              Marked by another instructor
            </p>
          ) : (
            <p className="text-[11px] mt-0.5" style={{ color: "var(--admin-text-faint)" }}>
              {entry.termAttendancePct !== null ? `${entry.termAttendancePct}% term avg` : "No term data"}
            </p>
          )}
        </div>

        {/* Status row */}
        <div className="flex gap-1.5 flex-1 min-w-0">
          {STATUSES.map((s) => {
            const active = mark.status === s;
            const c = STATUS_COLORS[s];
            return (
              <button
                key={s}
                disabled={isLocked}
                onClick={() => onStatusChange(s)}
                className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed"
                style={{
                  minWidth: 38,
                  background: active ? c.bg : "var(--admin-surface-sub)",
                  color:      active ? c.color : "var(--admin-text-faint)",
                  border:     active ? `1px solid ${c.border}` : "1px solid transparent",
                }}
              >
                {STATUS_LETTER[s]}
              </button>
            );
          })}
        </div>

        {/* Note button */}
        <button
          onClick={onToggleNote}
          className="rounded-lg shrink-0 transition-colors"
          style={{
            width: 32, height: 32,
            background: mark.noteOpen ? "var(--admin-surface-sub)" : "transparent",
            color: hasNote ? "var(--admin-sidebar-active)" : "var(--admin-text-faint)",
          }}
          aria-label={mark.noteOpen ? "Hide note" : "Add note"}
          title={mark.noteOpen ? "Hide note" : "Add note"}
        >
          <Pencil size={14} style={{ margin: "0 auto" }} />
        </button>
      </div>

      {/* Note field */}
      {mark.noteOpen && (
        <div className="px-4 pb-3" style={{ borderTop: "1px solid var(--admin-border-sub)" }}>
          <textarea
            value={mark.note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Add a note…"
            rows={2}
            disabled={isLocked}
            className="w-full text-sm rounded-lg px-3 py-2 resize-none focus:outline-none mt-2.5"
            style={{
              background: "var(--admin-surface-sub)",
              border:     "1px solid var(--admin-border-sub)",
              color:      "var(--admin-text)",
              fontSize:   "16px",
            }}
          />
        </div>
      )}
    </div>
  );
}
