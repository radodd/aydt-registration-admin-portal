"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/utils/supabase/client";
import { RegistrationProvider, useRegistration } from "@/app/providers/RegistrationProvider";
import { CartRestoreGuard } from "../CartRestoreGuard";
import { useCart } from "@/app/providers/CartProvider";
import { createDancer } from "../actions/createDancer";
import { computeAge, newDancerSchema, type NewDancerInput } from "@/lib/schemas/registration";
import { detectTimeConflicts } from "@/utils/detectTimeConflicts";
import type { ParticipantAssignment } from "@/types/public";
import type { ConflictDetail, Dancer, SessionScheduleInfo } from "@/types";

/* -------------------------------------------------------------------------- */
/* Dancer row — select existing or create new                                  */
/* -------------------------------------------------------------------------- */

interface DancerSelectorProps {
  sessionId: string;
  sessionName: string;
  existingDancers: Dancer[];
  assignment: ParticipantAssignment | undefined;
  onChange: (a: ParticipantAssignment) => void;
  minAge?: number | null;
  maxAge?: number | null;
  familyId: string | null;
}

function DancerSelector({
  sessionId,
  sessionName,
  existingDancers,
  assignment,
  onChange,
  minAge,
  maxAge,
  familyId,
}: DancerSelectorProps) {
  const [mode, setMode] = useState<"select" | "create">(
    assignment?.dancerId ? "select" : existingDancers.length === 0 ? "create" : "select",
  );
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<NewDancerInput>({
    resolver: zodResolver(newDancerSchema),
  });

  const dobValue = watch("dateOfBirth");

  function validateAge(dob: string): "valid" | "warning" | "error" | "unchecked" {
    if (!dob) return "unchecked";
    const age = computeAge(dob);
    if (minAge != null && age < minAge) return "error";
    if (maxAge != null && age > maxAge) return "error";
    if (minAge != null && age < minAge + 1) return "warning";
    return "valid";
  }

  function handleSelectExisting(dancerId: string) {
    const dancer = existingDancers.find((d) => d.id === dancerId);
    const ageStatus = dancer?.birth_date
      ? validateAge(dancer.birth_date)
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
    const ageStatus = validateAge(data.dateOfBirth);
    onChange({
      sessionId,
      dancerId: result.dancerId,
      newDancer: data,
      ageStatus,
    });
    setMode("select");
  }

  const ageStatus =
    assignment?.dancerId && dobValue
      ? validateAge(dobValue)
      : assignment?.ageStatus ?? "unchecked";

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <h3 className="font-semibold text-gray-900 mb-1">{sessionName}</h3>
      {(minAge != null || maxAge != null) && (
        <p className="text-xs text-gray-400 mb-3">
          Ages{" "}
          {minAge != null && maxAge != null
            ? `${minAge}–${maxAge}`
            : minAge != null
              ? `${minAge}+`
              : `up to ${maxAge}`}
        </p>
      )}

      {/* Mode toggle */}
      {existingDancers.length > 0 && (
        <div className="flex gap-2 mb-4">
          {(["select", "create"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                mode === m
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {m === "select" ? "Select dancer" : "Add new dancer"}
            </button>
          ))}
        </div>
      )}

      {/* Select existing */}
      {mode === "select" && existingDancers.length > 0 && (
        <select
          value={assignment?.dancerId ?? ""}
          onChange={(e) => handleSelectExisting(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="">— Select a dancer —</option>
          {existingDancers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.first_name} {d.last_name}
              {d.birth_date ? ` (age ${computeAge(d.birth_date)})` : ""}
            </option>
          ))}
        </select>
      )}

      {/* Create new dancer form */}
      {mode === "create" && (
        <form onSubmit={handleSubmit(onCreateSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                First name
              </label>
              <input
                {...register("firstName")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              {errors.firstName && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.firstName.message}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Last name
              </label>
              <input
                {...register("lastName")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              {errors.lastName && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.lastName.message}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Date of birth
            </label>
            <input
              type="date"
              {...register("dateOfBirth")}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            {errors.dateOfBirth && (
              <p className="text-xs text-red-600 mt-1">
                {errors.dateOfBirth.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Gender (optional)
            </label>
            <select
              {...register("gender")}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">Prefer not to say</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="non_binary">Non-binary</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </select>
          </div>

          {createError && (
            <p className="text-xs text-red-600">{createError}</p>
          )}

          <button
            type="submit"
            disabled={creating}
            className="w-full bg-gray-900 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-black transition-colors disabled:opacity-50"
          >
            {creating ? "Saving…" : "Add dancer"}
          </button>
        </form>
      )}

      {/* Age warning */}
      {assignment?.dancerId && ageStatus === "warning" && (
        <p className="mt-3 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
          This dancer is near the age limit. Please confirm eligibility.
        </p>
      )}
      {assignment?.dancerId && ageStatus === "error" && (
        <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
          This dancer does not meet the age requirement for this session.
        </p>
      )}

      {/* Assigned badge */}
      {assignment?.dancerId && (
        <p className="mt-3 text-xs text-green-600 font-medium">
          ✓ Dancer assigned
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page content                                                                */
/* -------------------------------------------------------------------------- */

function ParticipantsContent({ semesterId }: { semesterId: string }) {
  const router = useRouter();
  const { items } = useCart();
  const { state, setParticipants } = useRegistration();

  const [dancers, setDancers] = useState<Dancer[]>([]);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [assignments, setAssignments] = useState<ParticipantAssignment[]>(
    state.participants,
  );

  // Session schedule info fetched from DB — used for client-side conflict detection
  const [scheduleMap, setScheduleMap] = useState<Map<string, SessionScheduleInfo>>(
    new Map(),
  );

  // Load existing dancers for this family
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      console.log("[Participants] Auth user:", user ? user.id : "NOT LOGGED IN");
      if (!user) {
        console.warn("[Participants] No authenticated user — dancer list will be empty.");
        setLoading(false);
        return;
      }
      const { data: userRecord, error: userError } = await supabase
        .from("users")
        .select("family_id")
        .eq("id", user.id)
        .single();

      console.log("[Participants] userRecord:", userRecord, "error:", userError?.message ?? null);

      if (userRecord?.family_id) {
        setFamilyId(userRecord.family_id);
        const { data: dancerRows, error: dancerError } = await supabase
          .from("dancers")
          .select("id, first_name, last_name, birth_date, gender")
          .eq("family_id", userRecord.family_id)
          .order("first_name");
        console.log("[Participants] Dancers loaded:", dancerRows?.length ?? 0, "error:", dancerError?.message ?? null);
        setDancers((dancerRows as Dancer[]) ?? []);
      } else {
        console.warn("[Participants] No family_id on userRecord — can't load dancers.");
      }
      setLoading(false);
    });
  }, []);

  // Fetch session schedule info for conflict detection (runs when cart items are ready)
  useEffect(() => {
    if (items.length === 0) return;
    const sessionIds = items.map((i) => i.sessionId);
    const supabase = createClient();
    supabase
      .from("class_sessions")
      .select("id, day_of_week, start_time, end_time, classes(name)")
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
          });
        }
        setScheduleMap(map);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  function handleAssignmentChange(assignment: ParticipantAssignment) {
    setAssignments((prev) => {
      const filtered = prev.filter((a) => a.sessionId !== assignment.sessionId);
      return [...filtered, assignment];
    });
  }

  // Client-side conflict detection — re-runs on every assignment change
  const conflictsByDancer = useMemo(() => {
    const result = new Map<string, ConflictDetail[]>();

    // Group assigned sessions by dancerId
    const dancerSessions = new Map<string, string[]>();
    for (const a of assignments) {
      if (!a.dancerId) continue;
      if (!dancerSessions.has(a.dancerId)) {
        dancerSessions.set(a.dancerId, []);
      }
      dancerSessions.get(a.dancerId)!.push(a.sessionId);
    }

    // Only check dancers with 2+ sessions
    for (const [dancerId, sids] of dancerSessions) {
      if (sids.length < 2) continue;
      const { conflicts } = detectTimeConflicts(sids, scheduleMap);
      if (conflicts.length > 0) {
        result.set(dancerId, conflicts);
      }
    }

    return result;
  }, [assignments, scheduleMap]);

  const hasConflicts = conflictsByDancer.size > 0;

  const allAssigned = items.every((item) =>
    assignments.some(
      (a) => a.sessionId === item.sessionId && a.dancerId,
    ),
  );

  function handleContinue() {
    console.log("[Participants] handleContinue — assignments:", assignments);
    console.log("[Participants] allAssigned:", allAssigned, "hasConflicts:", hasConflicts, "cartItems:", items.length);
    setParticipants(assignments);
    router.push(`/register/form?semester=${semesterId}`);
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2].map((i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5 h-40" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Assign participants
        </h1>
        <p className="text-gray-500 text-sm">
          Select a dancer for each session in your cart.
        </p>
      </div>

      {/* Schedule conflict banner — hard block, user must remove a session */}
      {hasConflicts && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <p className="font-semibold mb-2">Schedule conflicts detected</p>
          {[...conflictsByDancer.values()].flat().map((conflict, i) => (
            <p key={i} className="text-xs mt-1">
              "{conflict.sessionA.className}" and "{conflict.sessionB.className}" overlap on{" "}
              {conflict.sessionA.dayOfWeek}. Please go back and remove one session to continue.
            </p>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {items.map((item) => (
          <DancerSelector
            key={item.sessionId}
            sessionId={item.sessionId}
            sessionName={item.sessionName}
            existingDancers={dancers}
            assignment={assignments.find((a) => a.sessionId === item.sessionId)}
            onChange={handleAssignmentChange}
            familyId={familyId}
            minAge={item.minAge}
            maxAge={item.maxAge}
          />
        ))}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors text-sm font-medium"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={handleContinue}
          disabled={!allAssigned || hasConflicts}
          className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
    </div>
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
      <RegistrationProvider semesterId={semesterId}>
        <ParticipantsContent semesterId={semesterId} />
      </RegistrationProvider>
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
