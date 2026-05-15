"use client";

import { useState, useEffect } from "react";
import type { PublicSession } from "@/types/public";

type Tier = NonNullable<PublicSession["classTiers"]>[number];

/**
 * Phase 3b-i — Tiered class picker (UI shell, no persistence).
 *
 * Renders a radio list of `class_tiers` for a tiered class. Auto-selects the
 * default tier (or the first one) on mount. Surfaces the selected tier id and
 * the chosen tier's price to the parent via `onChange`.
 */
export function TierPicker({
  tiers,
  onChange,
}: {
  tiers: Tier[];
  onChange?: (selectedTierId: string | null, price: number | null) => void;
}) {
  const sorted = [...tiers].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const initial =
    sorted.find((t) => t.isDefault)?.id ?? sorted[0]?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(initial);

  useEffect(() => {
    const tier = sorted.find((t) => t.id === selectedId) ?? null;
    onChange?.(selectedId, tier?.price ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  if (sorted.length === 0) {
    return (
      <div style={{ fontSize: 12, color: "var(--pub-text-faint, #999)", fontStyle: "italic", padding: "8px 0" }}>
        No tiers configured for this class.
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
        Pick a tier
      </div>
      {sorted.map((tier) => {
        const checked = selectedId === tier.id;
        const timeLabel =
          tier.startTime && tier.endTime ? `${fmt12(tier.startTime)} – ${fmt12(tier.endTime)}` : null;
        return (
          <label
            key={tier.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              border: `1px solid ${checked ? "var(--plum-400, #b890b5)" : "var(--pub-border, #e0dcd6)"}`,
              borderRadius: 10,
              background: checked ? "var(--plum-50, #faf6f9)" : "white",
              cursor: "pointer",
              transition: "background 120ms, border-color 120ms",
            }}
          >
            <input
              type="radio"
              name="class-tier"
              checked={checked}
              onChange={() => setSelectedId(tier.id)}
              style={{ accentColor: "var(--plum-600, #8a4d83)", width: 14, height: 14, flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pub-text, #201d18)" }}>
                {tier.label}
              </div>
              {timeLabel && (
                <div style={{ fontSize: 11, color: "var(--pub-text-muted, #736d65)", marginTop: 1 }}>
                  {timeLabel}
                </div>
              )}
            </div>
            {tier.price != null && (
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--pub-text, #201d18)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatDollars(tier.price)}
              </div>
            )}
          </label>
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
