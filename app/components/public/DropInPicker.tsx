"use client";

import { useState, useMemo, useEffect } from "react";
import type { PublicSession } from "@/types/public";

type SessionRow = {
  id: string;
  scheduleDate: string;
  startTime: string | null;
  endTime: string | null;
  dropInPrice: number | null;
  spotsRemaining: number;
  waitlistEnabled: boolean;
};

/**
 * Phase 3b-i — Drop-in date picker (UI shell, no persistence).
 *
 * Multi-checkbox date list grouped by month. The user picks individual sessions
 * to register for. Surfaces `selectedSessionIds[]` + summed price to the parent
 * via `onChange`. State is local — no cart wiring.
 */
export function DropInPicker({
  sessions,
  onChange,
}: {
  sessions: PublicSession[];
  onChange?: (selectedSessionIds: string[], totalPrice: number) => void;
}) {
  // Normalize + sort the bookable sessions by date.
  const rows: SessionRow[] = useMemo(
    () =>
      sessions
        .filter((s) => s.scheduleDate)
        .map((s) => ({
          id: s.id,
          scheduleDate: s.scheduleDate,
          startTime: s.startTime ?? null,
          endTime: s.endTime ?? null,
          dropInPrice: s.dropInPrice ?? null,
          spotsRemaining: s.spotsRemaining,
          waitlistEnabled: s.waitlistEnabled,
        }))
        .sort((a, b) => a.scheduleDate.localeCompare(b.scheduleDate)),
    [sessions],
  );

  // Group rows by year-month (e.g. "2026-07").
  const months = useMemo(() => {
    const out: { key: string; label: string; rows: SessionRow[] }[] = [];
    const map = new Map<string, SessionRow[]>();
    for (const row of rows) {
      const key = row.scheduleDate.slice(0, 7); // YYYY-MM
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    for (const [key, list] of map) {
      const label = new Date(key + "-01T00:00:00").toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
      out.push({ key, label, rows: list });
    }
    return out.sort((a, b) => a.key.localeCompare(b.key));
  }, [rows]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Expand the first month by default; the rest start collapsed for tidiness.
  const [openMonths, setOpenMonths] = useState<Set<string>>(
    () => new Set(months[0] ? [months[0].key] : []),
  );

  useEffect(() => {
    let total = 0;
    for (const id of selected) {
      const row = rows.find((r) => r.id === id);
      if (row?.dropInPrice != null) total += row.dropInPrice;
    }
    onChange?.([...selected], total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, rows]);

  function toggle(id: string, isFull: boolean) {
    if (isFull) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleMonth(key: string) {
    setOpenMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (rows.length === 0) {
    return (
      <div style={{ fontSize: 12, color: "var(--pub-text-faint, #999)", fontStyle: "italic", padding: "8px 0" }}>
        No drop-in dates available.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--pub-text-muted, #666)",
          marginBottom: 2,
        }}
      >
        Pick dates ({selected.size} selected)
      </div>
      {months.map((m) => {
        const isOpen = openMonths.has(m.key);
        const monthSelectedCount = m.rows.filter((r) => selected.has(r.id)).length;
        return (
          <div
            key={m.key}
            style={{
              border: "1px solid var(--pub-border, #e0dcd6)",
              borderRadius: 10,
              overflow: "hidden",
              background: "white",
            }}
          >
            <button
              type="button"
              onClick={() => toggleMonth(m.key)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                background: isOpen ? "var(--plum-50, #faf6f9)" : "transparent",
                border: "none",
                cursor: "pointer",
                font: "inherit",
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 16 16"
                  fill="none"
                  style={{
                    transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
                    transition: "transform 120ms",
                  }}
                >
                  <path
                    d="M4 6l4 4 4-4"
                    stroke="var(--pub-text-muted, #666)"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span
                  style={{ fontSize: 13, fontWeight: 600, color: "var(--pub-text, #201d18)" }}
                >
                  {m.label}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--pub-text-faint, #999)",
                    fontWeight: 500,
                  }}
                >
                  {m.rows.length} date{m.rows.length !== 1 ? "s" : ""}
                </span>
              </div>
              {monthSelectedCount > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--plum-700, #5a3978)",
                    background: "var(--plum-100, #f0e4ee)",
                    padding: "2px 8px",
                    borderRadius: 999,
                  }}
                >
                  {monthSelectedCount} selected
                </span>
              )}
            </button>
            {isOpen && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  borderTop: "1px solid var(--pub-border-subtle, #ede9e4)",
                }}
              >
                {m.rows.map((row, i) => {
                  const isFull = row.spotsRemaining <= 0 && !row.waitlistEnabled;
                  const checked = selected.has(row.id);
                  const dateLabel = new Date(row.scheduleDate + "T00:00:00").toLocaleDateString(
                    "en-US",
                    { weekday: "short", month: "short", day: "numeric" },
                  );
                  const timeLabel =
                    row.startTime && row.endTime
                      ? `${fmt12(row.startTime)} – ${fmt12(row.endTime)}`
                      : "";
                  return (
                    <label
                      key={row.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "9px 12px",
                        borderTop: i > 0 ? "1px solid var(--pub-border-subtle, #ede9e4)" : "none",
                        cursor: isFull ? "not-allowed" : "pointer",
                        opacity: isFull ? 0.5 : 1,
                        background: checked ? "var(--plum-50, #faf6f9)" : "transparent",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isFull}
                        onChange={() => toggle(row.id, isFull)}
                        style={{
                          accentColor: "var(--plum-600, #8a4d83)",
                          width: 14,
                          height: 14,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: "var(--pub-text, #201d18)" }}>
                          <strong style={{ fontWeight: 600 }}>{dateLabel}</strong>
                          {timeLabel && (
                            <span style={{ color: "var(--pub-text-muted, #736d65)", marginLeft: 8 }}>
                              · {timeLabel}
                            </span>
                          )}
                        </div>
                      </div>
                      {isFull ? (
                        <span style={{ fontSize: 11, color: "var(--rose-700, #984459)" }}>Full</span>
                      ) : row.spotsRemaining <= 3 ? (
                        <span style={{ fontSize: 11, color: "var(--pub-text-muted, #736d65)" }}>
                          {row.spotsRemaining} left
                        </span>
                      ) : null}
                      {row.dropInPrice != null && (
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--pub-text, #201d18)",
                            fontVariantNumeric: "tabular-nums",
                            minWidth: 56,
                            textAlign: "right",
                          }}
                        >
                          {formatDollars(row.dropInPrice)}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function fmt12(time: string): string {
  if (!time) return "";
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  const m = mStr ?? "00";
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m} ${period}`;
}

function formatDollars(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
