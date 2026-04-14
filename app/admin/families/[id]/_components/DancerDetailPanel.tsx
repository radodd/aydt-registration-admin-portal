"use client";

import type { FamilyDetailDancer } from "@/types";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function calcAgeText(birthDate: string | null): string | null {
  if (!birthDate) return null;
  const dob = new Date(birthDate + "T00:00:00");
  const today = new Date();
  let years = today.getFullYear() - dob.getFullYear();
  let months = today.getMonth() - dob.getMonth();
  if (today.getDate() < dob.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  if (years === 0) return `${months} mo`;
  if (months === 0) return `${years} yr${years !== 1 ? "s" : ""}`;
  return `${years} yr${years !== 1 ? "s" : ""}, ${months} mo`;
}

function calcAgeYears(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const dob = new Date(birthDate + "T00:00:00");
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

function fmtDOB(birthDate: string | null): string {
  if (!birthDate) return "";
  return new Date(birthDate + "T00:00:00").toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function fmtDivision(division: string | null): string {
  if (!division) return "";
  return division
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtGrade(grade: string | null): string {
  if (!grade) return "—";
  const n = parseInt(grade, 10);
  if (isNaN(n)) return grade; // e.g. "K", "Pre-K"
  const suffix = n === 11 || n === 12 || n === 13 ? "th"
    : n % 10 === 1 ? "st"
    : n % 10 === 2 ? "nd"
    : n % 10 === 3 ? "rd"
    : "th";
  return `${n}${suffix}`;
}

function genderLabel(g: string | null): string {
  if (!g) return "—";
  const map: Record<string, string> = {
    female: "Female",
    male: "Male",
    non_binary: "Non-binary",
    prefer_not_to_say: "Prefer not to say",
  };
  return map[g] ?? g;
}

function dancerInitials(first: string, last: string) {
  const f = first.slice(0, 2).toUpperCase();
  const l = (last[0] ?? "").toUpperCase();
  return `${f}${l}`;
}

const REG_BADGE: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700",
  pending_payment: "bg-yellow-100 text-yellow-700",
  cancelled: "bg-neutral-100 text-neutral-500",
  waitlisted: "bg-blue-100 text-blue-700",
};

/* -------------------------------------------------------------------------- */
/* DancerDetailPanel                                                           */
/* -------------------------------------------------------------------------- */

export function DancerDetailPanel({
  dancer,
  onEdit,
  onRemove,
}: {
  dancer: FamilyDetailDancer;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const ageText = calcAgeText(dancer.birth_date);
  const ageYears = calcAgeYears(dancer.birth_date);
  const dob = fmtDOB(dancer.birth_date);
  const activeRegs = dancer.registrations.filter((r) => r.status !== "cancelled");
  const cancelledRegs = dancer.registrations.filter((r) => r.status === "cancelled");

  // Deduplicate active registrations by class name — show each class once
  const seenClasses = new Set<string>();
  const uniqueActiveRegs = activeRegs.filter((r) => {
    const name = r.class_sessions?.classes?.name ?? r.id;
    if (seenClasses.has(name)) return false;
    seenClasses.add(name);
    return true;
  });

  const subtitle = [
    "Dancer",
    ageYears !== null ? `Age ${ageYears}` : null,
    dob ? `DOB ${dob}` : null,
    dancer.grade ? fmtGrade(dancer.grade) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="rounded-2xl border border-neutral-200 overflow-hidden">
      {/* ── Dark green header bar ──────────────────────────────────────── */}
      <div className="bg-[#2c5540] text-white px-6 py-4 flex items-center gap-4">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-sm font-semibold shrink-0">
          {dancerInitials(dancer.first_name, dancer.last_name)}
        </div>

        {/* Name + subtitle */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white leading-tight">
            {dancer.first_name} {dancer.last_name}
          </p>
          <p className="text-xs text-white/70 mt-0.5">{subtitle}</p>
        </div>

        {/* Edit */}
        <button
          onClick={onEdit}
          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-white/15 hover:bg-white/25 text-white transition-colors shrink-0"
        >
          Edit
        </button>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="divide-y divide-neutral-100">

        {/* Info grid */}
        <div className="px-6 py-5 grid grid-cols-4 gap-x-6 gap-y-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 mb-1">
              Age today
            </p>
            <p className="text-sm text-neutral-700">{ageText ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 mb-1">
              Grade
            </p>
            <p className="text-sm text-neutral-700">{fmtGrade(dancer.grade)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 mb-1">
              Gender
            </p>
            <p className="text-sm text-neutral-700">{genderLabel(dancer.gender)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 mb-1">
              Active classes
            </p>
            <p className="text-sm text-neutral-700">{uniqueActiveRegs.length}</p>
          </div>
          {dancer.school && (
            <div className="col-span-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 mb-1">
                School
              </p>
              <p className="text-sm text-neutral-700">{dancer.school}</p>
            </div>
          )}
          {dancer.secondary_email && (
            <div className="col-span-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 mb-1">
                Student email
              </p>
              <p className="text-sm text-neutral-700">{dancer.secondary_email}</p>
            </div>
          )}
        </div>

        {/* Current enrollments */}
        <div className="px-6 py-5 space-y-3">
          <p className="text-sm font-semibold text-neutral-900">Current enrollments</p>

          {uniqueActiveRegs.length === 0 ? (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-6 text-sm text-neutral-400 text-center">
              Not enrolled in any classes.
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-200 overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_1fr_auto] gap-4 px-4 py-2 bg-neutral-50 border-b border-neutral-200 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                <span>Class</span>
                <span>Schedule</span>
                <span>Status</span>
              </div>
              {/* Rows */}
              {uniqueActiveRegs.map((reg) => {
                const cs = reg.class_sessions;
                const dayStr = cs?.day_of_week
                  ? cs.day_of_week.charAt(0).toUpperCase() + cs.day_of_week.slice(1)
                  : "";
                const timeStr = cs?.start_time
                  ? `${fmtTime(cs.start_time)}${cs.end_time ? `–${fmtTime(cs.end_time)}` : ""}`
                  : "";
                const schedule = [dayStr, timeStr].filter(Boolean).join(" · ");

                return (
                  <div
                    key={reg.id}
                    className="grid grid-cols-[1fr_1fr_auto] gap-4 items-center px-4 py-3 border-b border-neutral-100 last:border-b-0 bg-white text-sm"
                  >
                    <div>
                      <p className="font-medium text-neutral-900">
                        {cs?.classes?.name ?? "—"}
                      </p>
                      {cs?.classes?.division && (
                        <p className="text-xs text-neutral-400 mt-0.5">
                          {fmtDivision(cs.classes.division)}
                        </p>
                      )}
                    </div>
                    <p className="text-neutral-600">{schedule || "—"}</p>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                        REG_BADGE[reg.status] ?? "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {reg.status.replace("_", " ")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Enrollment history */}
        {cancelledRegs.length > 0 && (
          <div className="px-6 py-5 space-y-3">
            <p className="text-sm font-semibold text-neutral-900">Enrollment history</p>
            <div className="rounded-xl border border-neutral-200 overflow-hidden">
              <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-2 bg-neutral-50 border-b border-neutral-200 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                <span>Class</span>
                <span>Status</span>
              </div>
              {cancelledRegs.map((reg) => (
                <div
                  key={reg.id}
                  className="grid grid-cols-[1fr_auto] gap-4 items-center px-4 py-3 border-b border-neutral-100 last:border-b-0 bg-white text-sm"
                >
                  <p className="text-neutral-500">
                    {reg.class_sessions?.classes?.name ?? "—"}
                  </p>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-neutral-100 text-neutral-500">
                    cancelled
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Remove dancer */}
        <div className="px-6 py-4 flex justify-end">
          <button
            onClick={onRemove}
            className="text-xs text-neutral-400 hover:text-red-600 font-medium transition-colors"
          >
            Remove dancer
          </button>
        </div>
      </div>
    </div>
  );
}
