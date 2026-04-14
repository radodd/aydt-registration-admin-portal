"use client";

import type { FamilyDetailDancer } from "@/types";

/** First 2 letters of first name + first letter of last name, e.g. "Maya Abady" → "MYA" */
function dancerInitials(first: string, last: string) {
  const f = first.slice(0, 2).toUpperCase();
  const l = (last[0] ?? "").toUpperCase();
  return `${f}${l}`;
}

function calcAge(birthDate: string | null): string {
  if (!birthDate) return "";
  const dob = new Date(birthDate + "T00:00:00");
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return `Age ${age}`;
}

function fmtDOB(birthDate: string | null): string {
  if (!birthDate) return "";
  return new Date(birthDate + "T00:00:00").toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

export function DancerCard({
  dancer,
  isSelected,
  onClick,
}: {
  dancer: FamilyDetailDancer;
  isSelected?: boolean;
  onClick?: () => void;
}) {
  const activeRegs = dancer.registrations.filter((r) => r.status !== "cancelled");
  const age = calcAge(dancer.birth_date);
  const dob = fmtDOB(dancer.birth_date);

  // Derive division from the first enrolled class
  const division =
    dancer.grade ||
    activeRegs[0]?.class_sessions?.classes?.division ||
    null;

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all ${
        onClick ? "cursor-pointer" : ""
      } ${
        isSelected
          ? "border-primary-600 ring-2 ring-primary-600 bg-white"
          : "border-neutral-200 bg-neutral-50 hover:bg-white"
      }`}
    >
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 bg-emerald-100 text-emerald-700">
        {dancerInitials(dancer.first_name, dancer.last_name)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-neutral-900 text-sm truncate">
          {dancer.first_name} {dancer.last_name}
        </p>
        {(age || dob) && (
          <p className="text-xs text-neutral-500 truncate">
            {age}{age && dob ? " · " : ""}
            {dob ? `DOB ${dob}` : ""}
          </p>
        )}
      </div>

      {/* Badges */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        {division && (
          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 whitespace-nowrap">
            {division}
          </span>
        )}
        {activeRegs.length > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-neutral-100 text-neutral-600 whitespace-nowrap">
            {activeRegs.length} enrollment{activeRegs.length !== 1 ? "s" : ""}
          </span>
        )}
        {dancer.secondary_email && (
          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600 whitespace-nowrap">
            student email
          </span>
        )}
      </div>
    </div>
  );
}
