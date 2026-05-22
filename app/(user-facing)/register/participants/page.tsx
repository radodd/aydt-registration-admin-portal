"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/utils/supabase/client";
import { useRegistration } from "@/app/providers/RegistrationProvider";
import { CartRestoreGuard } from "../CartRestoreGuard";
import { useCart } from "@/app/providers/CartProvider";
import { useAuth } from "@/app/providers/AuthProvider";
import { createDancer } from "../actions/createDancer";
import {
  computeAge,
  newDancerSchema,
  type NewDancerInput,
} from "@/lib/schemas/registration";
import { detectTimeConflicts } from "@/utils/detectTimeConflicts";
import type { CartItem, ParticipantAssignment } from "@/types/public";
import type { ConflictDetail, Dancer, SessionScheduleInfo } from "@/types";
import { gaEvent } from "@/utils/analytics";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

type AgeStatus = "valid" | "warning" | "error" | "unchecked";

/**
 * Discipline icon mapping — must stay in sync with the cart page
 * ([app/(user-facing)/cart/CartPageContent.tsx]) so the family sees the
 * same shape + color treatment as they advance through the flow.
 */
type DisciplineKey =
  | "ballet" | "tap" | "broadway" | "hiphop" | "contemporary"
  | "technique" | "pointe" | "jazz" | "lyrical" | "acro" | "default";

const DISCIPLINE_STYLES: Record<DisciplineKey, { bg: string; fg: string }> = {
  ballet:       { bg: "#F7DDE6", fg: "#A8366B" },
  tap:          { bg: "#F0E0BC", fg: "#7A5010" },
  broadway:     { bg: "#ECDBF0", fg: "#6B3A78" },
  hiphop:       { bg: "#DCE2EA", fg: "#3A4858" },
  contemporary: { bg: "#E0DAF0", fg: "#4A3F8C" },
  technique:    { bg: "#D9E8CF", fg: "#3D6A3A" },
  pointe:       { bg: "#EAD0DC", fg: "#8E2D58" },
  jazz:         { bg: "#F8D6C0", fg: "#A8482A" },
  lyrical:      { bg: "#D2E8DD", fg: "#2E6A50" },
  acro:         { bg: "#CFEAEA", fg: "#2A6878" },
  default:      { bg: "#EBDFD9", fg: "#6D5A53" },
};

function getDisciplineKey(d?: string | null): DisciplineKey {
  if (!d) return "default";
  const s = d.toLowerCase().replace(/[\s_-]+/g, "");
  if (s.startsWith("ballet")) return "ballet";
  if (s.startsWith("tap")) return "tap";
  if (s.startsWith("broadway")) return "broadway";
  if (s.startsWith("hiphop") || s === "hip") return "hiphop";
  if (s.startsWith("contemp")) return "contemporary";
  if (s.startsWith("tech")) return "technique";
  if (s.startsWith("pointe")) return "pointe";
  if (s.startsWith("jazz")) return "jazz";
  if (s.startsWith("lyric")) return "lyrical";
  if (s.startsWith("acro")) return "acro";
  return "default";
}

function DisciplineMark({
  discipline,
  chipSize = 28,
  iconSize = 15,
  marginRight = 0,
}: {
  discipline: DisciplineKey;
  chipSize?: number;
  iconSize?: number;
  marginRight?: number;
}) {
  const { bg, fg } = DISCIPLINE_STYLES[discipline];
  const stroke = {
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
  };
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: chipSize,
        height: chipSize,
        borderRadius: 7,
        flex: "none",
        marginRight,
        background: bg,
        color: fg,
      }}
    >
      <svg viewBox="0 0 24 24" width={iconSize} height={iconSize}>
        {discipline === "ballet"       && <circle {...stroke} cx="12" cy="12" r="6" />}
        {discipline === "tap"          && <rect   {...stroke} x="6" y="6" width="12" height="12" rx="1.5" />}
        {discipline === "broadway"     && <path   {...stroke} d="M12 5 L 19 18 L 5 18 Z" />}
        {discipline === "hiphop"       && <path   {...stroke} d="M12 4.5 L 19.5 12 L 12 19.5 L 4.5 12 Z" />}
        {discipline === "contemporary" && <path   {...stroke} d="M12 4 L 19 8 L 19 16 L 12 20 L 5 16 L 5 8 Z" />}
        {discipline === "technique"    && <path   {...stroke} d="M12 4 L 19.5 9.5 L 16.5 18.5 L 7.5 18.5 L 4.5 9.5 Z" />}
        {discipline === "pointe"       && <><circle {...stroke} cx="12" cy="12" r="6.5" /><circle {...stroke} cx="12" cy="12" r="2.5" /></>}
        {discipline === "jazz"         && <path   {...stroke} d="M12 4 L 13.5 10.5 L 20 12 L 13.5 13.5 L 12 20 L 10.5 13.5 L 4 12 L 10.5 10.5 Z" />}
        {discipline === "lyrical"      && <path   {...stroke} d="M10 5 H 14 V 10 H 19 V 14 H 14 V 19 H 10 V 14 H 5 V 10 H 10 Z" />}
        {discipline === "acro"         && <path   {...stroke} d="M5 16 A 7 7 0 0 1 19 16 Z" />}
        {discipline === "default"      && <circle {...stroke} cx="12" cy="12" r="6" />}
      </svg>
    </span>
  );
}

/** Saturated stripe color for the left edge of each class card — mirrors ClassCard.tsx. */
const DISC_STRIPE_COLORS: Record<string, string> = {
  ballet: "#5A3A80",
  broadway: "#8E2A23",
  "hip hop": "#4A3A80",
  "hip-hop": "#4A3A80",
  contemporary: "#8A4A08",
  tap: "#1D6A50",
  "pre-ballet": "#7A4A72",
};

function discStripeColor(disc?: string | null): string {
  if (!disc) return "var(--plum)";
  return DISC_STRIPE_COLORS[disc.toLowerCase()] ?? "var(--plum)";
}

function fmtTime(t: string | null | undefined): string {
  if (!t) return "";
  const parts = t.split(":");
  const h = parseInt(parts[0], 10);
  const m = parts[1] ?? "00";
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function fmtDay(d: string | null | undefined): string {
  if (!d) return "";
  return d.charAt(0).toUpperCase() + d.slice(1, 3);
}

function fmtDateLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function parseGrade(g: string | null): number | null {
  if (!g) return null;
  const s = g.trim().toLowerCase();
  if (s === "k" || s === "kindergarten") return 0;
  const n = parseInt(s, 10);
  return !isNaN(n) && n >= 1 && n <= 12 ? n : null;
}

function initials(d: Dancer): string {
  return ((d.first_name[0] ?? "") + (d.last_name[0] ?? "")).toUpperCase();
}

function validateEligibility(
  dob: string | null | undefined,
  gradeStr: string | null,
  minAge: number | null | undefined,
  maxAge: number | null | undefined,
  minGrade: number | null | undefined,
  maxGrade: number | null | undefined,
): AgeStatus {
  const hasCriteria =
    minAge != null || maxAge != null || minGrade != null || maxGrade != null;
  if (!hasCriteria) return "valid";

  let ageOk: boolean | null = null;
  const hasAgeCriteria = minAge != null || maxAge != null;
  if (dob && hasAgeCriteria) {
    const age = computeAge(dob);
    ageOk = true;
    if (minAge != null && age < minAge) ageOk = false;
    if (maxAge != null && age > maxAge) ageOk = false;
  }

  let gradeOk: boolean | null = null;
  const hasGradeCriteria = minGrade != null || maxGrade != null;
  const gradeNum = parseGrade(gradeStr);
  if (gradeNum !== null && hasGradeCriteria) {
    gradeOk = true;
    if (minGrade != null && gradeNum < minGrade) gradeOk = false;
    if (maxGrade != null && gradeNum > maxGrade) gradeOk = false;
  }

  if (ageOk === true || gradeOk === true) {
    if (
      dob &&
      minAge != null &&
      computeAge(dob) < minAge + 1 &&
      gradeOk !== true
    ) {
      return "warning";
    }
    return "valid";
  }
  if (ageOk === false || gradeOk === false) return "error";
  if (dob && minAge != null && computeAge(dob) < minAge + 1) return "warning";
  return "unchecked";
}

function eligibilityReqLabel(
  minAge: number | null | undefined,
  maxAge: number | null | undefined,
  minGrade: number | null | undefined,
  maxGrade: number | null | undefined,
): string | null {
  const agePart =
    minAge != null && maxAge != null
      ? `Ages ${minAge}–${maxAge}`
      : minAge != null
        ? `Ages ${minAge}+`
        : maxAge != null
          ? `Ages up to ${maxAge}`
          : null;
  const gradePart =
    minGrade != null && maxGrade != null
      ? `Grade ${minGrade}–${maxGrade}`
      : minGrade != null
        ? `Grade ${minGrade}+`
        : maxGrade != null
          ? `Grade up to ${maxGrade}`
          : null;
  return [agePart, gradePart].filter(Boolean).join(" · ") || null;
}

/* -------------------------------------------------------------------------- */
/* AddDancerForm — inline new-dancer form                                     */
/* -------------------------------------------------------------------------- */

interface AddDancerFormProps {
  familyId: string | null;
  onCancel: () => void;
  onCreated: (dancer: Dancer) => void;
  showCancel: boolean;
}

function AddDancerForm({
  familyId,
  onCancel,
  onCreated,
  showCancel,
}: AddDancerFormProps) {
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NewDancerInput>({ resolver: zodResolver(newDancerSchema) });

  async function onSubmit(data: NewDancerInput) {
    if (!familyId) return;
    setCreating(true);
    setCreateError(null);
    const result = await createDancer(familyId, data);
    setCreating(false);
    if (result.error || !result.dancerId) {
      setCreateError(result.error ?? "Failed to create dancer");
      return;
    }
    const newDancer = {
      id: result.dancerId,
      first_name: data.firstName,
      last_name: data.lastName,
      birth_date: data.dateOfBirth,
      gender: data.gender ?? null,
      grade: null,
      email: null,
      phone_number: null,
    } as unknown as Dancer;
    onCreated(newDancer);
    reset();
  }

  return (
    <div className="reg-form-card" style={{ marginTop: 10 }}>
      <div className="reg-form-card-header">
        <div className="reg-form-card-icon">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <div className="reg-form-card-title">Add a dancer</div>
          <div className="reg-form-card-desc">
            Saved to your account and pre-filled in future registrations
          </div>
        </div>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="reg-form-card-body">
        <div className="reg-grid-2">
          <div className="reg-field">
            <label className="reg-label">First name</label>
            <input {...register("firstName")} className="reg-input" placeholder="Sofia" />
            {errors.firstName && <span className="reg-error">{errors.firstName.message}</span>}
          </div>
          <div className="reg-field">
            <label className="reg-label">Last name</label>
            <input {...register("lastName")} className="reg-input" placeholder="Flores" />
            {errors.lastName && <span className="reg-error">{errors.lastName.message}</span>}
          </div>
        </div>
        <div className="reg-field">
          <label className="reg-label">Date of birth</label>
          <input type="date" {...register("dateOfBirth")} className="reg-input" />
          <span className="reg-hint">Used to confirm age eligibility for each class.</span>
          {errors.dateOfBirth && <span className="reg-error">{errors.dateOfBirth.message}</span>}
        </div>
        <div className="reg-field">
          <label className="reg-label">
            Gender <span className="reg-label-opt">optional</span>
          </label>
          <select {...register("gender")} className="reg-input">
            <option value="">Prefer not to say</option>
            <option value="female">Girl</option>
            <option value="male">Boy</option>
            <option value="non_binary">Non-binary</option>
            <option value="prefer_not_to_say">Other</option>
          </select>
        </div>
        {createError && <p style={{ fontSize: 12, color: "#C0392B" }}>{createError}</p>}
        <div style={{ display: "flex", gap: 10, paddingTop: 4, borderTop: "1px solid var(--pub-border-subtle)" }}>
          <button type="submit" disabled={creating} className="btn-continue" style={{ flex: 1, fontSize: 13, padding: "10px 18px", justifyContent: "center" }}>
            {creating ? "Saving…" : "Add dancer"}
          </button>
          {showCancel && (
            <button type="button" onClick={onCancel} className="btn-back" style={{ padding: "10px 16px", fontSize: 13 }}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* TierClassSection — multi-dancer pick for standard / tiered classes         */
/* -------------------------------------------------------------------------- */

interface TierClassSectionProps {
  item: CartItem;
  info: SessionScheduleInfo | undefined;
  discipline: DisciplineKey;
  stripeColor: string;
  dancers: Dancer[];
  assignments: ParticipantAssignment[];
  onToggleDancer: (sessionId: string, dancerId: string, ageStatus: AgeStatus) => void;
  onDancerCreated: (dancer: Dancer) => void;
  onRemove: () => void;
  familyId: string | null;
}

function TierClassSection({
  item,
  info,
  discipline,
  stripeColor,
  dancers,
  assignments,
  onToggleDancer,
  onDancerCreated,
  onRemove,
  familyId,
}: TierClassSectionProps) {
  const [showAdd, setShowAdd] = useState(false);
  const selectedIds = new Set(
    assignments
      .filter((a) => a.sessionId === item.sessionId && a.dancerId)
      .map((a) => a.dancerId as string),
  );

  const minAge = info?.minAge;
  const maxAge = info?.maxAge;
  const minGrade = info?.minGrade;
  const maxGrade = info?.maxGrade;
  const reqLabel = eligibilityReqLabel(minAge, maxAge, minGrade, maxGrade);

  const formatLabel = item.mode === "tiered" ? (item.tierLabel ?? "Tier") : "Full Term";
  const metaParts: string[] = [];
  if (info?.dayOfWeek) metaParts.push(fmtDay(info.dayOfWeek));
  if (info?.startTime && info?.endTime) {
    metaParts.push(`${fmtTime(info.startTime)} – ${fmtTime(info.endTime)}`);
  }

  const selectedCount = selectedIds.size;
  const hasError = assignments.some(
    (a) => a.sessionId === item.sessionId && a.dancerId && a.ageStatus === "error",
  );

  return (
    <section className={`reg-class-section${hasError ? " has-error" : ""}`} data-format="tier" data-discipline={discipline}>
      <div className="reg-class-section-stripe" style={{ background: stripeColor }} />
      <div className="reg-class-section-body">
        <div className="reg-class-section-head">
          <div className="reg-class-section-title-row">
            <DisciplineMark discipline={discipline} />
            <span className="reg-class-section-title">
              {item.className || info?.className || "Class"}
            </span>
            <span className="reg-format-pill reg-format-pill-tier">{formatLabel}</span>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="reg-class-remove-btn"
            aria-label="Remove this class from cart"
            title="Remove class"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {metaParts.length > 0 && (
          <div className="reg-class-section-meta">{metaParts.join(" · ")}</div>
        )}

        {reqLabel && (
          <div className="reg-age-chip">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 21s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
            {reqLabel}
          </div>
        )}

        <div className="reg-section-instruction">
          {dancers.length > 0 ? "Select dancers — multiple allowed" : "Add a dancer to continue"}
        </div>

        {dancers.length > 0 && (
          <div className="reg-dancer-grid">
            {dancers.map((d) => {
              const isSelected = selectedIds.has(d.id);
              const status = validateEligibility(
                d.birth_date,
                d.grade,
                minAge,
                maxAge,
                minGrade,
                maxGrade,
              );
              const age = d.birth_date ? computeAge(d.birth_date) : null;
              return (
                <div
                  key={d.id}
                  className={`dancer-card${isSelected ? " selected" : ""}`}
                  onClick={() => onToggleDancer(item.sessionId, d.id, status)}
                >
                  <div className="dancer-avatar">{initials(d)}</div>
                  <div className="dancer-info">
                    <div className="dancer-name">
                      {d.first_name} {d.last_name}
                    </div>
                    {age !== null && <div className="dancer-meta">Age {age}</div>}
                    {reqLabel && status === "error" && (
                      <span className="reg-dancer-eligibility fail">Outside requirement</span>
                    )}
                    {reqLabel && status === "warning" && (
                      <span className="reg-dancer-eligibility warn">Near limit</span>
                    )}
                    {reqLabel && status === "valid" && (
                      <span className="reg-dancer-eligibility">Eligible</span>
                    )}
                  </div>
                  <div className="dancer-check">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8l4 4 6-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {showAdd ? (
          <AddDancerForm
            familyId={familyId}
            onCancel={() => setShowAdd(false)}
            onCreated={(newDancer) => {
              onDancerCreated(newDancer);
              setShowAdd(false);
            }}
            showCancel={dancers.length > 0}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="reg-add-dancer-btn"
            style={{ marginTop: 8 }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Add new dancer
          </button>
        )}

        <div
          className={`reg-selection-summary${selectedCount > 0 ? " has-selection" : ""}`}
        >
          {selectedCount > 0 ? (
            <span>
              <strong>
                {selectedCount} dancer{selectedCount !== 1 ? "s" : ""}
              </strong>{" "}
              selected
            </span>
          ) : (
            <span>
              <strong>No dancers</strong> selected yet
            </span>
          )}
        </div>

        {hasError && (
          <div className="reg-eligibility-error">
            One or more selected dancers do not meet the requirements for this class.
          </div>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* DropInClassSection — per-date dancer pick for drop-in classes              */
/* -------------------------------------------------------------------------- */

interface DropInClassSectionProps {
  item: CartItem;
  dateInfos: { sessionId: string; info: SessionScheduleInfo | undefined }[];
  representativeInfo: SessionScheduleInfo | undefined;
  discipline: DisciplineKey;
  stripeColor: string;
  dancers: Dancer[];
  assignments: ParticipantAssignment[];
  onAssign: (sessionId: string, dancerId: string | null, ageStatus: AgeStatus) => void;
  onDancerCreated: (dancer: Dancer) => void;
  onRemove: () => void;
  onRemoveDate: (sessionId: string) => void;
  familyId: string | null;
}

function DropInClassSection({
  item,
  dateInfos,
  representativeInfo,
  discipline,
  stripeColor,
  dancers,
  assignments,
  onAssign,
  onDancerCreated,
  onRemove,
  onRemoveDate,
  familyId,
}: DropInClassSectionProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [bulkDancerId, setBulkDancerId] = useState("");

  const minAge = representativeInfo?.minAge;
  const maxAge = representativeInfo?.maxAge;
  const minGrade = representativeInfo?.minGrade;
  const maxGrade = representativeInfo?.maxGrade;
  const reqLabel = eligibilityReqLabel(minAge, maxAge, minGrade, maxGrade);

  const totalSessions = dateInfos.length;
  const assignedCount = dateInfos.filter((di) =>
    assignments.some((a) => a.sessionId === di.sessionId && a.dancerId),
  ).length;

  function applyBulk() {
    if (!bulkDancerId) return;
    const dancer = dancers.find((d) => d.id === bulkDancerId);
    const status = dancer
      ? validateEligibility(
          dancer.birth_date,
          dancer.grade,
          minAge,
          maxAge,
          minGrade,
          maxGrade,
        )
      : "unchecked";
    for (const di of dateInfos) {
      onAssign(di.sessionId, bulkDancerId, status);
    }
  }

  function handleRowChange(sessionId: string, dancerId: string) {
    if (!dancerId) {
      onAssign(sessionId, null, "unchecked");
      return;
    }
    const dancer = dancers.find((d) => d.id === dancerId);
    const status = dancer
      ? validateEligibility(
          dancer.birth_date,
          dancer.grade,
          minAge,
          maxAge,
          minGrade,
          maxGrade,
        )
      : "unchecked";
    onAssign(sessionId, dancerId, status);
  }

  const hasErrorAssignment = assignments.some(
    (a) =>
      dateInfos.some((di) => di.sessionId === a.sessionId) &&
      a.dancerId &&
      a.ageStatus === "error",
  );

  return (
    <section
      className={`reg-class-section${hasErrorAssignment ? " has-error" : ""}`}
      data-format="dropin"
      data-discipline={discipline}
    >
      <div className="reg-class-section-stripe" style={{ background: stripeColor }} />
      <div className="reg-class-section-body">
        <div className="reg-class-section-head">
          <div className="reg-class-section-title-row">
            <DisciplineMark discipline={discipline} />
            <span className="reg-class-section-title">
              {item.className || representativeInfo?.className || "Drop-in class"}
            </span>
            <span className="reg-format-pill reg-format-pill-dropin">
              Drop-in · {totalSessions} session{totalSessions !== 1 ? "s" : ""}
            </span>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="reg-class-remove-btn"
            aria-label="Remove this class from cart"
            title="Remove class"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {reqLabel && (
          <div className="reg-age-chip">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 21s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
            {reqLabel}
          </div>
        )}

        <div className="reg-section-instruction">Assign dancer per session</div>

        {dancers.length > 0 && (
          <div className="reg-bulk-assign">
            <span className="reg-bulk-assign-label">
              Assign one dancer to all {totalSessions} sessions:
            </span>
            <select
              className="reg-bulk-assign-select"
              value={bulkDancerId}
              onChange={(e) => setBulkDancerId(e.target.value)}
            >
              <option value="">Choose a dancer…</option>
              {dancers.map((d) => {
                const age = d.birth_date ? computeAge(d.birth_date) : null;
                return (
                  <option key={d.id} value={d.id}>
                    {d.first_name} {d.last_name}
                    {age !== null ? ` · Age ${age}` : ""}
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              className="reg-bulk-apply-btn"
              onClick={applyBulk}
              disabled={!bulkDancerId}
            >
              Apply
            </button>
          </div>
        )}

        <div className="reg-session-list">
          {dateInfos.map((di) => {
            const a = assignments.find((x) => x.sessionId === di.sessionId);
            const isAssigned = !!a?.dancerId;
            return (
              <div
                key={di.sessionId}
                className={`reg-session-row${isAssigned ? " is-assigned" : ""}`}
              >
                <div className="reg-session-row-date-block">
                  <div className="reg-session-row-date">
                    {fmtDateLabel(di.info?.scheduleDate ?? null) || di.info?.className || di.sessionId}
                  </div>
                  {(di.info?.startTime || di.info?.endTime) && (
                    <div className="reg-session-row-time">
                      {fmtTime(di.info?.startTime)} – {fmtTime(di.info?.endTime)}
                    </div>
                  )}
                </div>
                <select
                  className={`reg-session-dancer-select${isAssigned ? " assigned" : " unassigned"}`}
                  value={a?.dancerId ?? ""}
                  onChange={(e) => handleRowChange(di.sessionId, e.target.value)}
                >
                  <option value="">Choose a dancer…</option>
                  {dancers.map((d) => {
                    const age = d.birth_date ? computeAge(d.birth_date) : null;
                    return (
                      <option key={d.id} value={d.id}>
                        {d.first_name} {d.last_name}
                        {age !== null ? ` · Age ${age}` : ""}
                      </option>
                    );
                  })}
                </select>
                <div className="reg-session-status">
                  <span className="dot" />
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveDate(di.sessionId)}
                  className="reg-session-remove-btn"
                  aria-label="Remove this date"
                  title="Remove date"
                  disabled={totalSessions <= 1}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>

        {showAdd ? (
          <AddDancerForm
            familyId={familyId}
            onCancel={() => setShowAdd(false)}
            onCreated={(newDancer) => {
              onDancerCreated(newDancer);
              setShowAdd(false);
            }}
            showCancel={dancers.length > 0}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="reg-add-dancer-btn"
            style={{ marginTop: 8 }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Add new dancer
          </button>
        )}

        <div
          className={`reg-selection-summary${assignedCount === totalSessions && totalSessions > 0 ? " has-selection" : ""}`}
        >
          <span>
            <strong>
              {assignedCount} of {totalSessions}
            </strong>{" "}
            session{totalSessions !== 1 ? "s" : ""} assigned
          </span>
        </div>

        {hasErrorAssignment && (
          <div className="reg-eligibility-error">
            One or more selected dancers do not meet the requirements for this class.
          </div>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Page content                                                                */
/* -------------------------------------------------------------------------- */

export function ParticipantsContent({
  semesterId,
  continueUrl,
}: {
  semesterId: string;
  continueUrl: string;
}) {
  const router = useRouter();
  const { items: cartItems, sessionIds, remove: removeBySession, removeItem } = useCart();
  const { state, setParticipants } = useRegistration();
  const { userRecord } = useAuth();

  const [dancers, setDancers] = useState<Dancer[]>([]);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const registrationStartedFired = useRef(false);
  useEffect(() => {
    if (registrationStartedFired.current) return;
    registrationStartedFired.current = true;
    gaEvent("registration_started", { semester_id: semesterId });
  }, [semesterId]);

  const [assignments, setAssignments] = useState<ParticipantAssignment[]>(
    state.participants,
  );

  const [scheduleMap, setScheduleMap] = useState<
    Map<string, SessionScheduleInfo>
  >(new Map());
  const [disciplineBySession, setDisciplineBySession] = useState<
    Map<string, DisciplineKey>
  >(new Map());
  const [disciplineRawBySession, setDisciplineRawBySession] = useState<
    Map<string, string | null>
  >(new Map());

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        setLoading(false);
        return;
      }
      const { data: userRow } = await supabase
        .from("users")
        .select("family_id")
        .eq("id", user.id)
        .single();

      if (userRow?.family_id) {
        setFamilyId(userRow.family_id);
        const { data: dancerRows } = await supabase
          .from("dancers")
          .select("id, first_name, last_name, birth_date, gender, grade")
          .eq("family_id", userRow.family_id)
          .order("first_name");
        setDancers((dancerRows as Dancer[]) ?? []);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (sessionIds.length === 0) return;
    const supabase = createClient();
    supabase
      .from("class_meetings")
      .select(
        "id, day_of_week, start_time, end_time, schedule_date, classes(name, discipline, min_age, max_age, min_grade, max_grade)",
      )
      .in("id", sessionIds)
      .then(({ data }) => {
        if (!data) return;
        const map = new Map<string, SessionScheduleInfo>();
        const disc = new Map<string, DisciplineKey>();
        const discRaw = new Map<string, string | null>();
        for (const row of data) {
          const cls = Array.isArray(row.classes) ? row.classes[0] : row.classes;
          map.set(row.id, {
            sessionId: row.id,
            className: (cls as any)?.name ?? row.id,
            dayOfWeek: row.day_of_week,
            startTime: row.start_time,
            endTime: row.end_time,
            minAge: (cls as any)?.min_age ?? null,
            maxAge: (cls as any)?.max_age ?? null,
            minGrade: (cls as any)?.min_grade ?? null,
            maxGrade: (cls as any)?.max_grade ?? null,
            scheduleDate: (row as any).schedule_date ?? null,
          });
          disc.set(row.id, getDisciplineKey((cls as any)?.discipline));
          discRaw.set(row.id, (cls as any)?.discipline ?? null);
        }
        setScheduleMap(map);
        setDisciplineBySession(disc);
        setDisciplineRawBySession(discRaw);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIds.length]);

  function toggleTierDancer(sessionId: string, dancerId: string, ageStatus: AgeStatus) {
    setAssignments((prev) => {
      const exists = prev.some((a) => a.sessionId === sessionId && a.dancerId === dancerId);
      if (exists) {
        return prev.filter((a) => !(a.sessionId === sessionId && a.dancerId === dancerId));
      }
      return [...prev, { sessionId, dancerId, ageStatus }];
    });
  }

  function assignDropInDate(sessionId: string, dancerId: string | null, ageStatus: AgeStatus) {
    setAssignments((prev) => {
      const filtered = prev.filter((a) => a.sessionId !== sessionId);
      if (!dancerId) return filtered;
      return [...filtered, { sessionId, dancerId, ageStatus }];
    });
  }

  function handleDancerCreated(dancer: Dancer) {
    setDancers((prev) => [...prev, dancer]);
  }

  function handleRemoveCartItem(item: CartItem) {
    const affected =
      item.mode === "drop-in"
        ? new Set(item.selectedDateIds ?? [])
        : new Set([item.sessionId]);
    setAssignments((prev) => prev.filter((a) => !affected.has(a.sessionId)));
    removeItem(item.id);
  }

  function handleRemoveDropInDate(sessionId: string) {
    setAssignments((prev) => prev.filter((a) => a.sessionId !== sessionId));
    removeBySession(sessionId);
  }

  // Map each sessionId → the cart item it belongs to, so conflict detection can
  // skip intra-class pairs (drop-in dates of the same class are intentional
  // co-bookings, not conflicts).
  const sessionToCartItemId = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of cartItems) {
      if (it.mode === "drop-in") {
        for (const sid of it.selectedDateIds ?? []) m.set(sid, it.id);
      } else if (it.sessionId) {
        m.set(it.sessionId, it.id);
      }
    }
    return m;
  }, [cartItems]);

  const conflictsByDancer = useMemo(() => {
    const result = new Map<string, ConflictDetail[]>();
    const dancerSessions = new Map<string, string[]>();
    for (const a of assignments) {
      if (!a.dancerId) continue;
      if (!dancerSessions.has(a.dancerId)) dancerSessions.set(a.dancerId, []);
      dancerSessions.get(a.dancerId)!.push(a.sessionId);
    }
    for (const [dancerId, sids] of dancerSessions) {
      if (sids.length < 2) continue;
      const { conflicts } = detectTimeConflicts(sids, scheduleMap);
      // Filter out conflicts between two sessions of the same cart item.
      const filtered = conflicts.filter((c) => {
        const aItem = sessionToCartItemId.get(c.sessionA.sessionId);
        const bItem = sessionToCartItemId.get(c.sessionB.sessionId);
        return !aItem || !bItem || aItem !== bItem;
      });
      if (filtered.length > 0) result.set(dancerId, filtered);
    }
    return result;
  }, [assignments, scheduleMap, sessionToCartItemId]);

  const hasConflicts = conflictsByDancer.size > 0;
  const hasEligibilityError = assignments.some(
    (a) => a.dancerId && a.ageStatus === "error",
  );

  function itemIsComplete(item: CartItem): boolean {
    if (item.mode === "drop-in") {
      const dates = item.selectedDateIds ?? [];
      if (dates.length === 0) return false;
      return dates.every((sid) =>
        assignments.some((a) => a.sessionId === sid && a.dancerId),
      );
    }
    return assignments.some(
      (a) => a.sessionId === item.sessionId && a.dancerId,
    );
  }

  const allAssigned = cartItems.every(itemIsComplete);

  function handleContinue() {
    const enriched = assignments
      .filter((a) => a.dancerId)
      .map((a) => ({ ...a, selectedDayIds: [] }));
    setParticipants(enriched);
    router.push(continueUrl);
  }

  const firstName = userRecord?.first_name ?? null;

  if (loading) {
    return (
      <div className="reg-page-wrap" style={{ padding: "0 0 40px" }}>
        <div className="reg-page-layout">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ height: 13, width: 72, background: "var(--pub-border)", borderRadius: 4, animation: "pulse 1.5s infinite" }} />
            <div style={{ height: 30, width: 200, background: "var(--pub-border)", borderRadius: 8, animation: "pulse 1.5s infinite" }} />
            <div style={{ height: 80, background: "var(--pub-border)", borderRadius: 10, animation: "pulse 1.5s infinite" }} />
            <div style={{ height: 220, background: "var(--pub-border)", borderRadius: 14, animation: "pulse 1.5s infinite" }} />
          </div>
          <div style={{ height: 200, background: "var(--pub-border)", borderRadius: 12, animation: "pulse 1.5s infinite" }} />
        </div>
      </div>
    );
  }

  // ── Right-rail summary helpers ────────────────────────────────────────────
  function itemStatus(item: CartItem): { state: "complete" | "partial" | "empty"; label: string } {
    if (item.mode === "drop-in") {
      const dates = item.selectedDateIds ?? [];
      const total = dates.length;
      const assigned = dates.filter((sid) =>
        assignments.some((a) => a.sessionId === sid && a.dancerId),
      ).length;
      if (assigned === 0) return { state: "empty", label: "No dancers assigned" };
      if (assigned < total) {
        return { state: "partial", label: `${assigned} of ${total} sessions assigned` };
      }
      return { state: "complete", label: `${total} session${total !== 1 ? "s" : ""} assigned` };
    }
    const dancerCount = assignments.filter(
      (a) => a.sessionId === item.sessionId && a.dancerId,
    ).length;
    if (dancerCount === 0) return { state: "empty", label: "No dancers assigned" };
    return { state: "complete", label: `${dancerCount} dancer${dancerCount !== 1 ? "s" : ""} assigned` };
  }

  // Progress: total assigned "slots" / total required slots
  let totalSlots = 0;
  let assignedSlots = 0;
  for (const it of cartItems) {
    if (it.mode === "drop-in") {
      const dates = it.selectedDateIds ?? [];
      totalSlots += dates.length;
      assignedSlots += dates.filter((sid) =>
        assignments.some((a) => a.sessionId === sid && a.dancerId),
      ).length;
    } else {
      totalSlots += 1;
      if (assignments.some((a) => a.sessionId === it.sessionId && a.dancerId)) {
        assignedSlots += 1;
      }
    }
  }
  const progressPct = totalSlots > 0 ? Math.round((assignedSlots / totalSlots) * 100) : 0;

  return (
    <>
      <div className="reg-page-wrap" style={{ padding: "0 0 80px", maxWidth: 1180 }}>
        {hasConflicts && (
          <div
            style={{
              background: "#FDE8E8",
              border: "1px solid #F5AEAE",
              borderRadius: 10,
              padding: "12px 16px",
              fontSize: 13,
              color: "#7A2018",
              marginBottom: 24,
            }}
          >
            <p style={{ fontWeight: 700, marginBottom: 6 }}>Schedule conflicts detected</p>
            {[...conflictsByDancer.values()].flat().map((c, i) => (
              <p key={i} style={{ fontSize: 12, marginTop: 4 }}>
                &ldquo;{c.sessionA.className}&rdquo; and &ldquo;{c.sessionB.className}&rdquo; overlap on{" "}
                {c.sessionA.dayOfWeek}. Remove one to continue.
              </p>
            ))}
          </div>
        )}

        <div className="reg-page-layout" style={{ gridTemplateColumns: "1fr 340px", gap: 36 }}>
          <div>
            <div className="reg-page-eyebrow">Step 3 of 6 — Dancer Info</div>
            <h1 className="reg-page-title">
              {firstName ? `${firstName}'s dancers` : "Assign dancers"}
            </h1>
            <p className="reg-page-desc">
              Add one or more dancers per class. For drop-in sessions, you can
              assign a single dancer to all dates or pick a different one for
              each.
            </p>

            {cartItems.length === 0 ? (
              <div className="reg-empty-state">
                <div className="reg-empty-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="var(--plum)" strokeWidth="1.6" strokeLinecap="round" />
                    <polyline points="9 22 9 12 15 12 15 22" stroke="var(--plum)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="reg-empty-title">Your cart is empty</div>
                <div className="reg-empty-desc">
                  Go back and add sessions to your cart before assigning dancers.
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {cartItems.map((item) => {
                  if (item.mode === "drop-in") {
                    const dates = item.selectedDateIds ?? [];
                    const dateInfos = dates.map((sid) => ({
                      sessionId: sid,
                      info: scheduleMap.get(sid),
                    }));
                    const repSid = dates[0] ?? item.sessionId;
                    const repInfo = scheduleMap.get(repSid);
                    const disc = disciplineBySession.get(repSid) ?? "default";
                    const stripe = discStripeColor(disciplineRawBySession.get(repSid));
                    return (
                      <DropInClassSection
                        key={item.id}
                        item={item}
                        dateInfos={dateInfos}
                        representativeInfo={repInfo}
                        discipline={disc}
                        stripeColor={stripe}
                        dancers={dancers}
                        assignments={assignments}
                        onAssign={assignDropInDate}
                        onDancerCreated={handleDancerCreated}
                        onRemove={() => handleRemoveCartItem(item)}
                        onRemoveDate={handleRemoveDropInDate}
                        familyId={familyId}
                      />
                    );
                  }
                  const info = scheduleMap.get(item.sessionId);
                  const disc = disciplineBySession.get(item.sessionId) ?? "default";
                  const stripe = discStripeColor(disciplineRawBySession.get(item.sessionId));
                  return (
                    <TierClassSection
                      key={item.id}
                      item={item}
                      info={info}
                      discipline={disc}
                      stripeColor={stripe}
                      dancers={dancers}
                      assignments={assignments}
                      onToggleDancer={toggleTierDancer}
                      onDancerCreated={handleDancerCreated}
                      onRemove={() => handleRemoveCartItem(item)}
                      familyId={familyId}
                    />
                  );
                })}

                <a
                  href={`/semester/${semesterId}`}
                  className="reg-add-class-link"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Add another class
                </a>
              </div>
            )}
          </div>

          {/* ── Right rail ─────────────────────────────────────────────── */}
          <div>
            <div className="reg-summary-card">
              <div className="reg-summary-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div className="reg-summary-title">Your cart</div>
                <span className="reg-rail-count">{cartItems.length}</span>
              </div>

              {totalSlots > 0 && (
                <div className="reg-rail-progress-banner">
                  <span className="reg-rail-progress-text">
                    <strong>
                      {assignedSlots} of {totalSlots}
                    </strong>{" "}
                    assignments complete
                  </span>
                  <div className="reg-rail-progress-bar">
                    <div className="reg-rail-progress-bar-fill" style={{ width: `${progressPct}%` }} />
                  </div>
                </div>
              )}

              <div className="reg-summary-body" style={{ padding: "10px 14px" }}>
                {cartItems.length === 0 ? (
                  <div style={{ padding: "12px 4px", fontSize: 12, color: "var(--pub-text-faint)" }}>
                    No sessions in cart.
                  </div>
                ) : (
                  cartItems.map((item) => {
                    const status = itemStatus(item);
                    const format = item.mode === "drop-in" ? "dropin" : "tier";
                    const repSid =
                      item.mode === "drop-in"
                        ? (item.selectedDateIds ?? [])[0] ?? item.sessionId
                        : item.sessionId;
                    const disc = disciplineBySession.get(repSid) ?? "default";
                    const stripe = discStripeColor(disciplineRawBySession.get(repSid));
                    return (
                      <div
                        key={item.id}
                        className="reg-rail-item"
                        data-format={format}
                        data-discipline={disc}
                      >
                        <div className="reg-rail-item-stripe" style={{ background: stripe }} />
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            margin: "9px 0 9px 9px",
                            alignSelf: "flex-start",
                            flexShrink: 0,
                          }}
                        >
                          <DisciplineMark discipline={disc} chipSize={22} iconSize={12} />
                        </span>
                        <div className="reg-rail-item-body">
                          <div className="reg-rail-item-name">
                            {item.className || "Class"}
                          </div>
                          <div className={`reg-rail-item-status ${status.state}`}>
                            {status.label}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="reg-summary-total-row">
                <div className="reg-summary-total-label">
                  {cartItems.length} class{cartItems.length !== 1 ? "es" : ""}
                </div>
                <div className="reg-summary-total-val">
                  {assignedSlots} / {totalSlots} assigned
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="reg-bottom-bar">
        <div className="reg-bottom-inner" style={{ maxWidth: 1180 }}>
          <button type="button" onClick={() => router.back()} className="btn-back" style={{ flex: 1 }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>
          <button
            type="button"
            onClick={handleContinue}
            disabled={!allAssigned || hasConflicts || hasEligibilityError}
            className="btn-continue"
            style={{ flex: 2 }}
          >
            Continue to Registration Info
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M6 3l5 5-5 5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

function ParticipantsPageInner() {
  const params = useSearchParams();
  const semesterId = params.get("semester") ?? "";

  return (
    <CartRestoreGuard semesterId={semesterId}>
      <ParticipantsContent
        semesterId={semesterId}
        continueUrl={`/register/form?semester=${semesterId}`}
      />
    </CartRestoreGuard>
  );
}

export default function ParticipantsPage() {
  return (
    <Suspense>
      <ParticipantsPageInner />
    </Suspense>
  );
}
