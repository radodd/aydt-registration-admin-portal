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
import type { ParticipantAssignment } from "@/types/public";
import type { ConflictDetail, Dancer, SessionScheduleInfo } from "@/types";
import { gaEvent } from "@/utils/analytics";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function getDisciplineAbbrev(name: string): string {
  const words = name.split(/[\s\-]+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0].slice(0, 3).toUpperCase()}\n${words[1].slice(0, 3).toUpperCase()}`;
  }
  const s = name.toUpperCase();
  return s.length <= 4 ? s : s.slice(0, 3);
}

function fmtTime(t: string | null): string {
  if (!t) return "";
  const parts = t.split(":");
  const h = parseInt(parts[0], 10);
  const m = parts[1] ?? "00";
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function fmtDay(d: string | null): string {
  if (!d) return "";
  return d.charAt(0).toUpperCase() + d.slice(1, 3);
}

function parseGrade(g: string | null): number | null {
  if (!g) return null;
  const s = g.trim().toLowerCase();
  if (s === "k" || s === "kindergarten") return 0;
  const n = parseInt(s, 10);
  return !isNaN(n) && n >= 1 && n <= 12 ? n : null;
}

/* -------------------------------------------------------------------------- */
/* DancerSelector — per-session dancer picker                                  */
/* -------------------------------------------------------------------------- */

interface DancerSelectorProps {
  sessionId: string;
  sessionName: string;
  existingDancers: Dancer[];
  assignment: ParticipantAssignment | undefined;
  onChange: (a: ParticipantAssignment) => void;
  onDancerCreated: (dancer: Dancer) => void;
  minAge?: number | null;
  maxAge?: number | null;
  minGrade?: number | null;
  maxGrade?: number | null;
  familyId: string | null;
  showSessionLabel: boolean;
}

function DancerSelector({
  sessionId,
  sessionName,
  existingDancers,
  assignment,
  onChange,
  onDancerCreated,
  minAge,
  maxAge,
  minGrade,
  maxGrade,
  familyId,
  showSessionLabel,
}: DancerSelectorProps) {
  const [mode, setMode] = useState<"select" | "create">(
    assignment?.dancerId
      ? "select"
      : existingDancers.length === 0
        ? "create"
        : "select",
  );
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NewDancerInput>({
    resolver: zodResolver(newDancerSchema),
  });

  // If new dancers are added externally (other sessions), switch to select mode
  useEffect(() => {
    if (existingDancers.length > 0 && mode === "create" && !assignment?.dancerId) {
      // Stay in create mode if user opened it; just ensure "select" is available
    }
  }, [existingDancers.length]);

  function validateEligibility(
    dob: string,
    gradeStr: string | null,
  ): "valid" | "warning" | "error" | "unchecked" {
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

  function handleSelectExisting(dancerId: string) {
    const dancer = existingDancers.find((d) => d.id === dancerId);
    const ageStatus = dancer?.birth_date
      ? validateEligibility(dancer.birth_date, dancer.grade ?? null)
      : "unchecked";
    onChange({ sessionId, dancerId, ageStatus });
  }

  async function onCreateSubmit(data: NewDancerInput) {
    if (!familyId) return;
    setCreating(true);
    setCreateError(null);
    const result = await createDancer(familyId, data);
    setCreating(false);
    if (result.error || !result.dancerId) {
      setCreateError(result.error ?? "Failed to create dancer");
      return;
    }
    const ageStatus = validateEligibility(data.dateOfBirth, null);
    const newDancer: Dancer = {
      id: result.dancerId,
      first_name: data.firstName,
      last_name: data.lastName,
      birth_date: data.dateOfBirth,
      gender: data.gender ?? null,
      grade: null,
      email: null,
      phone_number: null,
    };
    onDancerCreated(newDancer);
    onChange({ sessionId, dancerId: result.dancerId, newDancer: data, ageStatus });
    reset();
    setMode("select");
  }

  const ageStatus = assignment?.ageStatus ?? "unchecked";
  const hasCriteria = minAge != null || maxAge != null || minGrade != null || maxGrade != null;

  return (
    <div>
      {showSessionLabel && (
        <div className="reg-session-heading">For {sessionName}</div>
      )}

      {/* Eligibility criteria note */}
      {hasCriteria && (
        <p style={{ fontSize: 12, color: "var(--pub-text-faint)", marginBottom: 12 }}>
          {(minAge != null || maxAge != null) && (
            <span>
              Ages{" "}
              {minAge != null && maxAge != null
                ? `${minAge}–${maxAge}`
                : minAge != null
                  ? `${minAge}+`
                  : `up to ${maxAge}`}
            </span>
          )}
          {(minAge != null || maxAge != null) && (minGrade != null || maxGrade != null) && (
            <span> or </span>
          )}
          {(minGrade != null || maxGrade != null) && (
            <span>
              Grade{" "}
              {minGrade != null && maxGrade != null
                ? `${minGrade}–${maxGrade}`
                : minGrade != null
                  ? `${minGrade}+`
                  : `up to ${maxGrade}`}
            </span>
          )}
        </p>
      )}

      {/* Existing dancer cards */}
      {mode === "select" && existingDancers.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {existingDancers.map((d) => {
            const initials = (d.first_name[0] + (d.last_name[0] ?? "")).toUpperCase();
            const age = d.birth_date ? computeAge(d.birth_date) : null;
            const isSelected = assignment?.dancerId === d.id;
            return (
              <div
                key={d.id}
                className={`dancer-card${isSelected ? " selected" : ""}`}
                onClick={() => handleSelectExisting(d.id)}
              >
                <div className="dancer-avatar">{initials}</div>
                <div className="dancer-info">
                  <div className="dancer-name">
                    {d.first_name} {d.last_name}
                  </div>
                  {age !== null && (
                    <div className="dancer-meta">Age {age}</div>
                  )}
                </div>
                <div className="dancer-check">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3 8l4 4 6-6"
                      stroke="#fff"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state: no dancers yet */}
      {mode === "select" && existingDancers.length === 0 && (
        <div className="reg-empty-state">
          <div className="reg-empty-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"
                stroke="var(--plum)"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <path
                d="M3 21c0-4.4 4-8 9-8s9 3.6 9 8"
                stroke="var(--plum)"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="reg-empty-title">No dancers on your account yet</div>
          <div className="reg-empty-desc">
            Dancer profiles let you register faster each semester — we&apos;ll
            pre-fill their info everywhere it&apos;s needed.
          </div>
        </div>
      )}

      {/* Add dancer form */}
      {mode === "create" ? (
        <div className="reg-form-card">
          <div className="reg-form-card-header">
            <div className="reg-form-card-icon">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 3v10M3 8h10"
                  stroke="#fff"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div>
              <div className="reg-form-card-title">Add a dancer</div>
              <div className="reg-form-card-desc">
                Saved to your account and pre-filled in future registrations
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit(onCreateSubmit)} className="reg-form-card-body">
            <div className="reg-grid-2">
              <div className="reg-field">
                <label className="reg-label">First name</label>
                <input
                  {...register("firstName")}
                  className="reg-input"
                  placeholder="Sofia"
                />
                {errors.firstName && (
                  <span className="reg-error">{errors.firstName.message}</span>
                )}
              </div>
              <div className="reg-field">
                <label className="reg-label">Last name</label>
                <input
                  {...register("lastName")}
                  className="reg-input"
                  placeholder="Flores"
                />
                {errors.lastName && (
                  <span className="reg-error">{errors.lastName.message}</span>
                )}
              </div>
            </div>

            <div className="reg-field">
              <label className="reg-label">Date of birth</label>
              <input
                type="date"
                {...register("dateOfBirth")}
                className="reg-input"
              />
              <span className="reg-hint">
                Used to confirm age eligibility for each class.
              </span>
              {errors.dateOfBirth && (
                <span className="reg-error">{errors.dateOfBirth.message}</span>
              )}
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

            {createError && (
              <p style={{ fontSize: 12, color: "#C0392B" }}>{createError}</p>
            )}

            <div
              style={{
                paddingTop: 4,
                borderTop: "1px solid var(--pub-border-subtle)",
                display: "flex",
                gap: 10,
              }}
            >
              <button
                type="submit"
                disabled={creating}
                className="btn-continue"
                style={{
                  flex: 1,
                  fontSize: 14,
                  padding: "12px 22px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8 3v10M3 8h10"
                    stroke="#fff"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                {creating ? "Saving…" : "Add dancer"}
              </button>
              {existingDancers.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setMode("select");
                    reset();
                    setCreateError(null);
                  }}
                  className="btn-back"
                  style={{ padding: "12px 16px", fontSize: 13 }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setMode("create")}
          className="reg-add-dancer-btn"
          style={{ marginTop: existingDancers.length > 0 ? 8 : 0 }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 3v10M3 8h10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          Add new dancer
        </button>
      )}

      {/* Eligibility messages */}
      {assignment?.dancerId && ageStatus === "warning" && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 12px",
            background: "var(--plum-50)",
            border: "1px solid var(--plum-100)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--plum-700)",
          }}
        >
          This dancer is near the age limit. Please confirm eligibility.
        </div>
      )}
      {assignment?.dancerId && ageStatus === "error" && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 12px",
            background: "#FDE8E8",
            border: "1px solid #F5AEAE",
            borderRadius: 8,
            fontSize: 12,
            color: "#7A2018",
          }}
        >
          This dancer does not meet the{" "}
          {minGrade != null || maxGrade != null ? "age or grade" : "age"}{" "}
          requirement for this session.
        </div>
      )}
    </div>
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
  const { sessionIds, remove: removeFromCart } = useCart();
  const { state, setParticipants } = useRegistration();
  const { userRecord } = useAuth();

  const [dancers, setDancers] = useState<Dancer[]>([]);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fire once when the user reaches the participant assignment step
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

  // Load family and existing dancers
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

  // Fetch session schedule info for conflict detection and summary display
  useEffect(() => {
    if (sessionIds.length === 0) return;
    const supabase = createClient();
    supabase
      .from("class_sessions")
      .select(
        "id, day_of_week, start_time, end_time, classes(name, min_age, max_age, min_grade, max_grade)",
      )
      .in("id", sessionIds)
      .then(({ data }) => {
        if (!data) return;
        const map = new Map<string, SessionScheduleInfo>();
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
          });
        }
        setScheduleMap(map);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIds.length]);

  function handleAssignmentChange(assignment: ParticipantAssignment) {
    setAssignments((prev) => {
      const filtered = prev.filter((a) => a.sessionId !== assignment.sessionId);
      return [...filtered, assignment];
    });
  }

  function handleRemoveSession(sessionId: string) {
    removeFromCart(sessionId);
    setAssignments((prev) => prev.filter((a) => a.sessionId !== sessionId));
  }

  function handleDancerCreated(dancer: Dancer) {
    setDancers((prev) => [...prev, dancer]);
  }

  // Client-side conflict detection
  const conflictsByDancer = useMemo(() => {
    const result = new Map<string, ConflictDetail[]>();
    const dancerSessions = new Map<string, string[]>();
    for (const a of assignments) {
      if (!a.dancerId) continue;
      if (!dancerSessions.has(a.dancerId)) {
        dancerSessions.set(a.dancerId, []);
      }
      dancerSessions.get(a.dancerId)!.push(a.sessionId);
    }
    for (const [dancerId, sids] of dancerSessions) {
      if (sids.length < 2) continue;
      const { conflicts } = detectTimeConflicts(sids, scheduleMap);
      if (conflicts.length > 0) result.set(dancerId, conflicts);
    }
    return result;
  }, [assignments, scheduleMap]);

  const hasConflicts = conflictsByDancer.size > 0;

  const allAssigned = sessionIds.every((id) =>
    assignments.some((a) => a.sessionId === id && a.dancerId),
  );

  function handleContinue() {
    const enriched = assignments.map((a) => ({
      ...a,
      selectedDayIds: [],
    }));
    setParticipants(enriched);
    router.push(continueUrl);
  }

  const firstName = userRecord?.first_name ?? null;
  const showSessionLabel = sessionIds.length > 1;

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="reg-page-wrap" style={{ padding: "0 0 40px" }}>
        <div className="reg-page-layout">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div
              style={{
                height: 13,
                width: 72,
                background: "var(--pub-border)",
                borderRadius: 4,
                animation: "pulse 1.5s infinite",
              }}
            />
            <div
              style={{
                height: 30,
                width: 200,
                background: "var(--pub-border)",
                borderRadius: 8,
                animation: "pulse 1.5s infinite",
              }}
            />
            <div
              style={{
                height: 80,
                background: "var(--pub-border)",
                borderRadius: 10,
                animation: "pulse 1.5s infinite",
              }}
            />
            <div
              style={{
                height: 220,
                background: "var(--pub-border)",
                borderRadius: 14,
                animation: "pulse 1.5s infinite",
              }}
            />
          </div>
          <div
            style={{
              height: 200,
              background: "var(--pub-border)",
              borderRadius: 12,
              animation: "pulse 1.5s infinite",
            }}
          />
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <>
      <div className="reg-page-wrap" style={{ padding: "0 0 80px" }}>
        {/* Conflict banner */}
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
            <p style={{ fontWeight: 700, marginBottom: 6 }}>
              Schedule conflicts detected
            </p>
            {[...conflictsByDancer.values()].flat().map((c, i) => (
              <p key={i} style={{ fontSize: 12, marginTop: 4 }}>
                &ldquo;{c.sessionA.className}&rdquo; and &ldquo;
                {c.sessionB.className}&rdquo; overlap on {c.sessionA.dayOfWeek}.
                Remove one to continue.
              </p>
            ))}
          </div>
        )}

        <div className="reg-page-layout">
          {/* ── LEFT: main content ─────────────────────────────────────────── */}
          <div>
            <div className="reg-page-eyebrow">Step 2 of 4</div>
            <h1 className="reg-page-title">
              {firstName ? `${firstName}'s dancers` : "Assign dancers"}
            </h1>
            <p className="reg-page-desc">
              Select a dancer for each session in your cart.
            </p>

            {sessionIds.length === 0 ? (
              <div className="reg-empty-state">
                <div className="reg-empty-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
                      stroke="var(--plum)"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                    <polyline
                      points="9 22 9 12 15 12 15 22"
                      stroke="var(--plum)"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="reg-empty-title">Your cart is empty</div>
                <div className="reg-empty-desc">
                  Go back and add sessions to your cart before assigning
                  dancers.
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: showSessionLabel ? 36 : 0,
                }}
              >
                {sessionIds.map((sid) => {
                  const info = scheduleMap.get(sid);
                  return (
                    <div key={sid} style={{ position: "relative" }}>
                      <DancerSelector
                        sessionId={sid}
                        sessionName={info?.className ?? sid}
                        existingDancers={dancers}
                        assignment={assignments.find(
                          (a) => a.sessionId === sid,
                        )}
                        onChange={handleAssignmentChange}
                        onDancerCreated={handleDancerCreated}
                        familyId={familyId}
                        minAge={info?.minAge}
                        maxAge={info?.maxAge}
                        minGrade={info?.minGrade}
                        maxGrade={info?.maxGrade}
                        showSessionLabel={showSessionLabel}
                      />
                      {/* Remove session button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveSession(sid)}
                        style={{
                          position: "absolute",
                          top: showSessionLabel ? 26 : 0,
                          right: 0,
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--pub-text-faint)",
                          padding: 4,
                          borderRadius: 6,
                          transition: "color .12s",
                          lineHeight: 0,
                        }}
                        aria-label="Remove session"
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.color = "#7A2018")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.color = "var(--pub-text-faint)")
                        }
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── RIGHT: order summary ───────────────────────────────────────── */}
          <div>
            <div className="reg-summary-card">
              <div className="reg-summary-header">
                <div className="reg-summary-title">Your cart</div>
              </div>

              <div className="reg-summary-body">
                {sessionIds.length === 0 ? (
                  <div
                    style={{
                      padding: "16px 18px",
                      fontSize: 12,
                      color: "var(--pub-text-faint)",
                    }}
                  >
                    No sessions in cart.
                  </div>
                ) : (
                  sessionIds.map((sid) => {
                    const info = scheduleMap.get(sid);
                    const a = assignments.find((a) => a.sessionId === sid);
                    const assignedDancer = a?.dancerId
                      ? dancers.find((d) => d.id === a.dancerId)
                      : null;
                    const disc = info?.className
                      ? getDisciplineAbbrev(info.className)
                      : "?";

                    return (
                      <div key={sid} className="reg-summary-item">
                        <div className="reg-summary-disc">{disc}</div>
                        <div className="reg-summary-info">
                          <div className="reg-summary-class">
                            {info?.className ?? sid}
                          </div>
                          {info?.dayOfWeek && (
                            <div className="reg-summary-session">
                              {fmtDay(info.dayOfWeek)} &middot;{" "}
                              {fmtTime(info.startTime)} –{" "}
                              {fmtTime(info.endTime)}
                            </div>
                          )}
                          {assignedDancer ? (
                            <div className="reg-summary-dancer">
                              <svg
                                width="10"
                                height="10"
                                viewBox="0 0 16 16"
                                fill="none"
                              >
                                <path
                                  d="M3 8l4 4 6-6"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                              {assignedDancer.first_name}{" "}
                              {assignedDancer.last_name}
                            </div>
                          ) : (
                            <div className="reg-summary-dancer unassigned">
                              <svg
                                width="10"
                                height="10"
                                viewBox="0 0 16 16"
                                fill="none"
                                style={{ marginRight: 2 }}
                              >
                                <circle
                                  cx="8"
                                  cy="8"
                                  r="6.5"
                                  stroke="currentColor"
                                  strokeWidth="1.4"
                                />
                                <path
                                  d="M8 5v3.5M8 11h.01"
                                  stroke="currentColor"
                                  strokeWidth="1.4"
                                  strokeLinecap="round"
                                />
                              </svg>
                              No dancer assigned yet
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="reg-summary-total-row">
                <div className="reg-summary-total-label">
                  {sessionIds.length} session
                  {sessionIds.length !== 1 ? "s" : ""}
                </div>
                <div className="reg-summary-total-val">
                  {assignments.filter((a) => a.dancerId).length} /{" "}
                  {sessionIds.length} assigned
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Fixed bottom bar ───────────────────────────────────────────────── */}
      <div className="reg-bottom-bar">
        <div className="reg-bottom-inner">
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-back"
            style={{ flex: 1 }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path
                d="M10 3L5 8l5 5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back
          </button>
          <button
            type="button"
            onClick={handleContinue}
            disabled={!allAssigned || hasConflicts}
            className="btn-continue"
            style={{ flex: 2 }}
          >
            Continue to Information
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path
                d="M6 3l5 5-5 5"
                stroke="#fff"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
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
