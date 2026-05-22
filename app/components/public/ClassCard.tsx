"use client";

import { useMemo, useState } from "react";
import { useCart } from "@/app/providers/CartProvider";
import type { PublicSession } from "@/types/public";
import { GroupedClass } from "./SessionGrid";
import { TierPicker } from "./TierPicker";
import { DropInPicker } from "./DropInPicker";

/* -------------------------------------------------------------------------- */
/* Discipline → accent color                                                    */
/* -------------------------------------------------------------------------- */
const DISC_COLORS: Record<string, string> = {
  "ballet":        "#5A3A80",
  "broadway":      "#8E2A23",
  "hip hop":       "#4A3A80",
  "hip-hop":       "#4A3A80",
  "contemporary":  "#8A4A08",
  "tap":           "#1D6A50",
  "pre-ballet":    "#7A4A72",
};

function discColor(disc: string | null | undefined): string {
  if (!disc) return "var(--plum)";
  return DISC_COLORS[disc.toLowerCase()] ?? "var(--plum)";
}

/* -------------------------------------------------------------------------- */
/* Schedule grouping (sessions → enrollment options)                           */
/* -------------------------------------------------------------------------- */
type ScheduleGroup = {
  key: string;               // scheduleId or session.id
  sessions: PublicSession[]; // all occurrences in this schedule
  representative: PublicSession;
  daysLabel: string;         // e.g. "Mon · Wed"
};

const DAY_ABBREV: Record<string, string> = {
  sunday: "Sun", monday: "Mon", tuesday: "Tue",
  wednesday: "Wed", thursday: "Thu", friday: "Fri", saturday: "Sat",
};

function getDayOfWeek(dateStr: string): string {
  const idx = new Date(dateStr + "T00:00:00").getDay();
  const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return names[idx] ?? "";
}

function groupBySchedule(sessions: PublicSession[]): ScheduleGroup[] {
  const map = new Map<string, PublicSession[]>();

  for (const s of sessions) {
    // Drop-in (per_session) sessions render as one card per date so users
    // can pick individual dates with their own capacity/price. Full-schedule
    // sessions group by scheduleId so the user enrolls in the whole series.
    const key = s.pricingModel === "per_session" ? s.id : (s.scheduleId ?? s.id);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }

  const groups: ScheduleGroup[] = [];
  for (const [key, items] of map) {
    // Sort occurrences chronologically
    items.sort((a, b) => (a.scheduleDate ?? "").localeCompare(b.scheduleDate ?? ""));

    // Unique days of week in schedule order.
    // Prefer deriving from individual scheduleDates; fall back to the
    // schedule-level daysOfWeek array when schedule_date is not set.
    const seenDays = new Set<string>();
    const orderedDays: string[] = [];
    for (const s of items) {
      if (s.scheduleDate) {
        const dow = getDayOfWeek(s.scheduleDate);
        if (!seenDays.has(dow)) { seenDays.add(dow); orderedDays.push(dow); }
      } else if (s.daysOfWeek) {
        for (const dow of s.daysOfWeek) {
          const key = dow.toLowerCase();
          if (!seenDays.has(key)) { seenDays.add(key); orderedDays.push(key); }
        }
      }
    }

    const daysLabel = orderedDays
      .map((d) => DAY_ABBREV[d] ?? d)
      .join(" · ");

    groups.push({ key, sessions: items, representative: items[0]!, daysLabel });
  }

  return groups;
}

/* -------------------------------------------------------------------------- */
/* ScCard — individual schedule option card inside the accordion               */
/* -------------------------------------------------------------------------- */
function ScCard({
  group,
  discStripeColor,
  spotsThreshold,
}: {
  group: ScheduleGroup;
  discStripeColor: string;
  spotsThreshold: number;
}) {
  const { add, remove, sessionIds } = useCart();
  const rep = group.representative;

  // Use representative session's ID for cart operations
  const inCart = sessionIds.includes(rep.id);
  const isFull = rep.spotsRemaining <= 0;

  // Availability badge
  let badgeClass = "sem-badge-sage";
  let badgeLabel = "Open";
  if (isFull && !rep.waitlistEnabled) {
    badgeClass = "sem-badge-rose";
    badgeLabel = "Full";
  } else if (isFull && rep.waitlistEnabled) {
    badgeClass = "sem-badge-rose";
    badgeLabel = "Waitlist";
  } else if (rep.spotsRemaining <= spotsThreshold) {
    badgeClass = "sem-badge-amber";
    badgeLabel = `${rep.spotsRemaining} spot${rep.spotsRemaining !== 1 ? "s" : ""} left`;
  }

  // Price display
  let priceDisplay = "";
  let priceSub = "";
  if (rep.pricingModel === "full_schedule" && rep.priceTiers && rep.priceTiers.length > 0) {
    const defaultTier = rep.priceTiers.find((t) => t.isDefault) ?? rep.priceTiers[0]!;
    priceDisplay = formatDollars(defaultTier.amount);
    priceSub = `${group.sessions.length} session${group.sessions.length !== 1 ? "s" : ""}`;
  } else if (rep.dropInPrice != null) {
    priceDisplay = formatDollars(rep.dropInPrice);
    priceSub = "per session";
  }

  const cardClasses = [
    "sem-sc",
    isFull && !rep.waitlistEnabled ? "full" : "",
    inCart ? "in-cart" : "",
  ].filter(Boolean).join(" ");

  function handleClick() {
    if (isFull && !rep.waitlistEnabled) return;
    if (inCart) remove(rep.id);
    else add(rep.id);
  }

  return (
    <div className={cardClasses} onClick={handleClick} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(); }}
    >
      {/* Discipline top stripe */}
      <style>{`.sem-sc[data-key="${group.key}"]::before { background: ${discStripeColor}; opacity: 0.85; }`}</style>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: discStripeColor, opacity: 0.85 }} />

      <div className="sem-sc-top">
        <div>
          <div className="sem-sc-days">{group.daysLabel || "—"}</div>
          {rep.startTime && (
            <div className="sem-sc-time">
              {fmtTime(rep.startTime)}{rep.endTime ? ` – ${fmtTime(rep.endTime)}` : ""}
            </div>
          )}
        </div>
        <span className={`sem-badge ${badgeClass}`}>
          <span className="sem-badge-dot" />
          {badgeLabel}
        </span>
      </div>

      <div className="sem-sc-meta">
        {rep.location && (
          <div className="sem-sc-meta-row">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
              <path d="M8 2C5.8 2 4 3.8 4 6c0 3 4 8 4 8s4-5 4-8c0-2.2-1.8-4-4-4z" stroke="currentColor" strokeWidth="1.3"/>
            </svg>
            {rep.location}
          </div>
        )}
        {group.sessions.length > 0 && group.sessions[0].scheduleDate && (
          <div className="sem-sc-meta-row">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            {fmtDateShort(group.sessions[0].scheduleDate)}
            {group.sessions.length > 1 && group.sessions[group.sessions.length - 1].scheduleDate
              ? ` – ${fmtDateShort(group.sessions[group.sessions.length - 1].scheduleDate!)}`
              : ""}
            {" · "}{group.sessions.length} class{group.sessions.length !== 1 ? "es" : ""}
          </div>
        )}
        {rep.instructorName && (
          <div className="sem-sc-meta-row">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
              <path d="M8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            {rep.instructorName}
          </div>
        )}
      </div>


      <div className="sem-sc-footer">
        <div>
          {priceDisplay && (
            <>
              <div className="sem-sc-price">{priceDisplay}</div>
              {priceSub && <span className="sem-sc-price-sub">{priceSub}</span>}
            </>
          )}
        </div>

        {isFull && !rep.waitlistEnabled ? (
          <button className="sem-atc waitlist" disabled onClick={(e) => e.stopPropagation()}>
            Full
          </button>
        ) : isFull && rep.waitlistEnabled ? (
          <button
            className="sem-atc waitlist"
            onClick={(e) => { e.stopPropagation(); add(rep.id); }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <line x1="23" y1="11" x2="17" y2="11"/>
            </svg>
            Join Waitlist
          </button>
        ) : inCart ? (
          <button
            className="sem-atc incart"
            onClick={(e) => { e.stopPropagation(); remove(rep.id); }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            In Cart
          </button>
        ) : (
          <button
            className="sem-atc"
            onClick={(e) => { e.stopPropagation(); add(rep.id); }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="9" cy="21" r="1"/>
              <circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
            Add to Cart
          </button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ClassCard — accordion                                                        */
/* -------------------------------------------------------------------------- */
export function ClassCard({ group, spotsThreshold = 0 }: { group: GroupedClass; spotsThreshold?: number }) {
  const { sessionIds } = useCart();
  const cartCount = group.sessions.filter((s) => sessionIds.includes(s.id)).length;
  const [isOpen, setIsOpen] = useState(cartCount > 0);

  const scheduleGroups = groupBySchedule(group.sessions);
  const stripeColor = discColor(group.discipline);

  // Overall availability for the class header badge
  const allFull = scheduleGroups.every(
    (sg) => sg.representative.spotsRemaining <= 0 && !sg.representative.waitlistEnabled
  );
  const anyLow = spotsThreshold > 0 && !allFull && scheduleGroups.some(
    (sg) => sg.representative.spotsRemaining > 0 && sg.representative.spotsRemaining <= spotsThreshold
  );

  let headerBadgeClass = "sem-badge-sage";
  let headerBadgeLabel = "Spots available";
  if (allFull) {
    headerBadgeClass = "sem-badge-rose";
    headerBadgeLabel = "All sessions full";
  } else if (anyLow) {
    headerBadgeClass = "sem-badge-amber";
    headerBadgeLabel = "Filling fast";
  }

  // Age range label
  let ageLabel = "";
  if (group.minAge != null && group.maxAge != null) ageLabel = `Ages ${group.minAge}–${group.maxAge}`;
  else if (group.minAge != null) ageLabel = `Ages ${group.minAge}+`;
  else if (group.maxAge != null) ageLabel = `Ages up to ${group.maxAge}`;

  // Grade range label (only shown when grade params set, not age)
  let gradeLabel = "";
  if (group.minGrade != null || group.maxGrade != null) {
    if (group.minGrade != null && group.maxGrade != null)
      gradeLabel = `Grades ${numToGrade(group.minGrade)}–${numToGrade(group.maxGrade)}`;
    else if (group.minGrade != null)
      gradeLabel = `Grades ${numToGrade(group.minGrade)}+`;
    else
      gradeLabel = `Grades up to ${numToGrade(group.maxGrade!)}`;
  }

  // Preview details derived from first schedule group
  const firstSG = scheduleGroups[0];
  const firstRep = firstSG?.representative;
  const firstGroupDates = (firstSG?.sessions ?? [])
    .map((s) => s.scheduleDate)
    .filter(Boolean)
    .sort() as string[];
  const previewStart = firstGroupDates[0];
  const previewEnd = firstGroupDates[firstGroupDates.length - 1];
  const previewCount = firstSG?.sessions.length ?? 0;
  const previewTime = firstRep?.startTime
    ? `${fmtTime(firstRep.startTime)}${firstRep.endTime ? ` – ${fmtTime(firstRep.endTime)}` : ""}`
    : "";
  const allInstructors = [
    ...new Set(
      scheduleGroups
        .map((sg) => sg.representative.instructorName)
        .filter((n): n is string => Boolean(n))
    ),
  ];
  const instructorLabel =
    allInstructors.length === 1 ? allInstructors[0]! : allInstructors.length > 1 ? "Multiple instructors" : "";

  const cardClasses = ["sem-class-card", isOpen ? "open" : ""].filter(Boolean).join(" ");

  return (
    <div className={cardClasses}>
      {/* Accordion header */}
      <button type="button" className="sem-class-card-top" onClick={() => setIsOpen((o) => !o)}>
        <div className="sem-disc-stripe" style={{ background: stripeColor }} />

        <div className="sem-class-info">
          <div className="sem-class-name">{stripDaySuffix(group.name)}</div>
          <div className="sem-class-meta-row">
            {group.location && (
              <span className="sem-class-meta-item">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2C5.8 2 4 3.8 4 6c0 3 4 8 4 8s4-5 4-8c0-2.2-1.8-4-4-4z" stroke="currentColor" strokeWidth="1.4"/>
                </svg>
                {group.location}
              </span>
            )}
            {ageLabel && (
              <span className="sem-badge" style={{ background: "var(--plum-50)", color: "var(--plum-700)" }}>
                {ageLabel}
              </span>
            )}
            {gradeLabel && (
              <span className="sem-badge" style={{ background: "var(--plum-50)", color: "var(--plum-700)" }}>
                {gradeLabel}
              </span>
            )}
            <span className={`sem-badge ${headerBadgeClass}`}>
              <span className="sem-badge-dot" />
              {headerBadgeLabel}
            </span>
            {cartCount > 0 && (
              <span className="sem-badge" style={{ background: "var(--plum-50)", color: "var(--plum-700)" }}>
                {cartCount} in cart
              </span>
            )}
          </div>

          {/* Schedule preview row */}
          {(firstSG?.daysLabel || previewStart || instructorLabel) && (
            <div className="sem-class-meta-row" style={{ marginTop: 5 }}>
              {firstSG?.daysLabel && (
                <span className="sem-class-meta-item">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  {firstSG.daysLabel}{previewTime && ` · ${previewTime}`}
                </span>
              )}
              {previewStart && (
                <span className="sem-class-meta-item">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  {fmtDateShort(previewStart)}{previewEnd && previewEnd !== previewStart ? ` – ${fmtDateShort(previewEnd)}` : ""}
                  {previewCount > 0 && ` · ${previewCount} class${previewCount !== 1 ? "es" : ""}`}
                </span>
              )}
              {instructorLabel && (
                <span className="sem-class-meta-item">
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <path d="M8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                  {instructorLabel}
                </span>
              )}
              {scheduleGroups.length > 1 && (
                <span style={{ fontSize: 10, color: "var(--pub-text-faint)" }}>
                  +{scheduleGroups.length - 1} more option{scheduleGroups.length > 2 ? "s" : ""}
                </span>
              )}
            </div>
          )}

        </div>

        <div className="sem-class-right">
          <div className="sem-session-count">
            <div className="sem-session-num">{scheduleGroups.length}</div>
            <div className="sem-session-label">option{scheduleGroups.length !== 1 ? "s" : ""}</div>
          </div>
          <div className="sem-chevron">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M4 6l4 4 4-4" stroke="var(--pub-text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </button>

      {/* Expanded sessions grid */}
      {isOpen && (
        <div className="sem-sessions-body">
          {group.description && (
            <div className="sem-class-desc" style={{ padding: "10px 0 4px", borderBottom: "1px solid var(--pub-border-subtle)", marginBottom: 4 }}>
              {group.description}
            </div>
          )}
          {group.prerequisites && group.prerequisites.length > 0 && (
            <div className="sem-prereq-block">
              {group.prerequisites.map((req) => (
                <div key={req.id} className="sem-prereq-row">
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M8 5v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    <circle cx="8" cy="11.5" r="0.75" fill="currentColor"/>
                  </svg>
                  <span>{req.description}</span>
                </div>
              ))}
            </div>
          )}
          {group.registrationNote && (
            <div className="sem-reg-note">
              {group.registrationNote}
            </div>
          )}
          <div className="sem-sessions-intro">
            <span className="sem-sessions-intro-label">
              {group.isTiered
                ? `${(group.classTiers ?? []).length} tier${(group.classTiers ?? []).length !== 1 ? "s" : ""} available`
                : group.isDropIn
                ? `${group.sessions.length} drop-in date${group.sessions.length !== 1 ? "s" : ""}`
                : `${scheduleGroups.length} available option${scheduleGroups.length !== 1 ? "s" : ""}`}
              {group.location ? ` · ${group.location}` : ""}
            </span>
          </div>
          {group.isTiered ? (
            <TieredBookingBlock group={group} />
          ) : group.isDropIn ? (
            <DropInBookingBlock group={group} />
          ) : (
            <div className="sem-sessions-grid">
              {scheduleGroups.map((sg) => (
                <ScCard key={sg.key} group={sg} discStripeColor={stripeColor} spotsThreshold={spotsThreshold} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Phase 3b-i UI shell — Tiered + Drop-in booking blocks                        */
/* -------------------------------------------------------------------------- */
/* These render inside the accordion body when the class is tiered or drop-in.  */
/* They are UI-shell only: the Register button is a stub that surfaces the      */
/* selection but does NOT touch cart state or write to any persistence layer.   */
/* -------------------------------------------------------------------------- */

function TieredBookingBlock({ group }: { group: GroupedClass }) {
  const tiers = group.classTiers ?? [];
  const { items, add, removeItem, updateItem, semesterId } = useCart();
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);

  const selectedTier = tiers.find((t) => t.id === selectedTierId) ?? null;

  const cartItem = items.find((it) => it.classId === group.classId && it.mode === "tiered");
  const inCart = !!cartItem;

  const repSession = group.sessions.find((s) => !s.isDropIn) ?? group.sessions[0];

  function handleClick() {
    if (!selectedTier || !repSession) return;
    if (inCart) {
      updateItem(cartItem!.id, {
        classTierId: selectedTier.id,
        tierLabel: selectedTier.label,
        priceSnapshot: selectedTier.price ?? undefined,
      });
    } else {
      add({
        semesterId,
        classId: group.classId,
        sessionId: repSession.id,
        className: group.name,
        mode: "tiered",
        classTierId: selectedTier.id,
        tierLabel: selectedTier.label,
        priceSnapshot: selectedTier.price ?? undefined,
      });
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "8px 4px 4px" }}>
      <TierPicker
        tiers={tiers}
        initialTierId={cartItem?.classTierId ?? null}
        onChange={(id, price) => {
          setSelectedTierId(id);
          setSelectedPrice(price);
        }}
      />
      <BookingFooter
        priceLabel={selectedPrice != null ? formatDollars(selectedPrice) : "—"}
        priceSub="per term"
        buttonLabel={
          inCart && selectedTier && selectedTier.id === cartItem!.classTierId
            ? `In Cart · ${cartItem!.tierLabel ?? ""}`
            : inCart && selectedTier
              ? `Update to · ${selectedTier.label}`
              : selectedTier
                ? `Register · ${selectedTier.label}`
                : "Pick a tier"
        }
        disabled={!selectedTier}
        onClick={handleClick}
        secondaryLabel={inCart ? "Remove from cart" : undefined}
        onSecondaryClick={inCart ? () => removeItem(cartItem!.id) : undefined}
      />
    </div>
  );
}

function DropInBookingBlock({ group }: { group: GroupedClass }) {
  const { items, add, removeItem, updateItem, semesterId } = useCart();
  // Stable identity across renders so DropInPicker's internal memo over `sessions`
  // doesn't churn — otherwise its effect that calls onChange re-fires every
  // render and creates an update loop with our setSelectedIds below.
  const dropInSessions = useMemo(
    () => group.sessions.filter((s) => s.isDropIn),
    [group.sessions],
  );

  const cartItem = items.find((it) => it.classId === group.classId && it.mode === "drop-in");
  const inCart = !!cartItem;

  const [selectedIds, setSelectedIds] = useState<string[]>(cartItem?.selectedDateIds ?? []);
  const [total, setTotal] = useState<number>(cartItem?.priceSnapshot ?? 0);

  function handleClick() {
    if (selectedIds.length === 0) return;
    const repSessionId = selectedIds[0]!;

    if (inCart) {
      updateItem(cartItem!.id, {
        sessionId: repSessionId,
        selectedDateIds: selectedIds,
        priceSnapshot: total,
      });
    } else {
      add({
        semesterId,
        classId: group.classId,
        sessionId: repSessionId,
        className: group.name,
        mode: "drop-in",
        selectedDateIds: selectedIds,
        priceSnapshot: total,
      });
    }
  }

  // "Same as cart" check: arrays equal ignoring order
  const cartIds = cartItem?.selectedDateIds ?? [];
  const sameAsCart =
    inCart &&
    selectedIds.length === cartIds.length &&
    selectedIds.every((id) => cartIds.includes(id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "8px 4px 4px" }}>
      <DropInPicker
        sessions={dropInSessions}
        initialSelectedIds={cartItem?.selectedDateIds ?? []}
        onChange={(ids, sum) => {
          setSelectedIds(ids);
          setTotal(sum);
        }}
      />
      <BookingFooter
        priceLabel={formatDollars(total)}
        priceSub={`${selectedIds.length} session${selectedIds.length !== 1 ? "s" : ""}`}
        buttonLabel={
          selectedIds.length === 0
            ? "Pick at least one date"
            : inCart && sameAsCart
              ? `In Cart · ${selectedIds.length} session${selectedIds.length !== 1 ? "s" : ""}`
              : inCart
                ? `Update · ${selectedIds.length} session${selectedIds.length !== 1 ? "s" : ""}`
                : `Register · ${selectedIds.length} session${selectedIds.length !== 1 ? "s" : ""}`
        }
        disabled={selectedIds.length === 0}
        onClick={handleClick}
        secondaryLabel={inCart ? "Remove from cart" : undefined}
        onSecondaryClick={inCart ? () => removeItem(cartItem!.id) : undefined}
      />
    </div>
  );
}

function BookingFooter({
  priceLabel,
  priceSub,
  buttonLabel,
  disabled,
  onClick,
  secondaryLabel,
  onSecondaryClick,
}: {
  priceLabel: string;
  priceSub: string;
  buttonLabel: string;
  disabled: boolean;
  onClick: () => void;
  secondaryLabel?: string;
  onSecondaryClick?: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 12px",
        borderTop: "1px dashed var(--pub-border, #e0dcd6)",
        marginTop: 4,
      }}
    >
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--pub-text, #201d18)", lineHeight: 1.1 }}>
          {priceLabel}
        </div>
        {priceSub && (
          <div style={{ fontSize: 11, color: "var(--pub-text-faint, #999)", marginTop: 1 }}>
            {priceSub}
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {secondaryLabel && onSecondaryClick && (
          <button
            type="button"
            onClick={onSecondaryClick}
            style={{
              fontSize: 11,
              color: "var(--pub-text-muted, #736d65)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "4px 6px",
              textDecoration: "underline",
            }}
          >
            {secondaryLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className="sem-atc"
          style={{
            opacity: disabled ? 0.4 : 1,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Utilities                                                                    */
/* -------------------------------------------------------------------------- */

function numToGrade(n: number): string {
  return n === 0 ? "K" : String(n);
}

/** Strip trailing parenthetical like " (Monday)" or " (Mon/Wed)" from display names. */
function stripDaySuffix(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/**
 * Formats a NUMERIC dollar amount (e.g. 25 → "$25", 25.5 → "$25.50") for display.
 * `class_sessions.drop_in_price` and `section_price_tiers.amount` are NUMERIC(10,2)
 * dollars in the DB — not cents — so no /100 conversion is needed.
 */
function formatDollars(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function fmtDateShort(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const period = h! >= 12 ? "PM" : "AM";
  const hour = h! % 12 || 12;
  return m === 0 ? `${hour} ${period}` : `${hour}:${String(m).padStart(2, "0")} ${period}`;
}
