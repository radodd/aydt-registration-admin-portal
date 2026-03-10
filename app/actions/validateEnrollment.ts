"use server";

import { createClient } from "@/utils/supabase/server";
import type {
  EnrollmentValidationIssue,
  EnrollmentValidationResult,
  SessionScheduleInfo,
} from "@/types";
import { validateWeeklyLimit } from "@/utils/tuitionEngine";

export interface ValidateEnrollmentInput {
  semesterId: string;
  participants: Array<{
    dancerId: string;
    sessionId: string;
  }>;
}

/**
 * Server-side enrollment validation (Phase 3 — Layer 2).
 *
 * Checks:
 *   1. Time conflicts — same day_of_week + overlapping start/end times.
 *   2. Class requirements — prerequisite_completed, concurrent_enrollment,
 *      teacher_recommendation, skill_qualification, audition_required.
 *      Skipped if an admin has granted a requirement_waiver.
 *
 * Returns a structured result with each issue typed as soft_warn or
 * hard_block. The caller decides whether to proceed or reject.
 */
export async function validateEnrollment(
  input: ValidateEnrollmentInput,
): Promise<EnrollmentValidationResult> {
  const supabase = await createClient();
  const issues: EnrollmentValidationIssue[] = [];

  console.log("Participants:", input.participants);

  const sessionIds = [...new Set(input.participants.map((p) => p.sessionId))];

  /* ---------------------------------------------------------------------- */
  /* 1. Fetch schedule info for all sessions                                  */
  /* ---------------------------------------------------------------------- */
  const { data: sessionRows, error: sessionError } = await supabase
    .from("class_sessions")
    .select("id, day_of_week, schedule_date, start_time, end_time, class_id, classes(name, division)")
    .in("id", sessionIds);

  if (sessionError || !sessionRows) {
    return {
      valid: false,
      hasHardBlock: true,
      issues: [
        {
          type: "time_conflict",
          enforcement: "hard_block",
          message: "Could not validate session schedules. Please try again.",
          dancerId: "",
          isWaivable: false,
        },
      ],
    };
  }

  type SessionInfo = SessionScheduleInfo & { classId: string; division: string };
  const sessionMap = new Map<string, SessionInfo>();
  for (const row of sessionRows) {
    const cls = Array.isArray(row.classes) ? row.classes[0] : row.classes;
    sessionMap.set(row.id, {
      sessionId: row.id,
      className: (cls as any)?.name ?? row.id,
      dayOfWeek: row.day_of_week,
      scheduleDate: (row as any).schedule_date ?? null,
      startTime: row.start_time,
      endTime: row.end_time,
      classId: row.class_id,
      division: (cls as any)?.division ?? "junior",
    });
  }

  /* ---------------------------------------------------------------------- */
  /* 2. Group participants by dancer                                          */
  /* ---------------------------------------------------------------------- */
  const dancerSessions = new Map<string, string[]>();
  for (const p of input.participants) {
    if (!dancerSessions.has(p.dancerId)) {
      dancerSessions.set(p.dancerId, []);
    }
    dancerSessions.get(p.dancerId)!.push(p.sessionId);
  }

  console.log("Dancer sessions map:", dancerSessions);

  /* ---------------------------------------------------------------------- */
  /* 3. Weekly class limit check per dancer per division                      */
  /* ---------------------------------------------------------------------- */
  for (const [dancerId, sids] of dancerSessions) {
    // Count unique class_ids per division (each class_id = one weekly time slot).
    const divisionClassCount = new Map<string, Set<string>>();
    for (const sid of sids) {
      const info = sessionMap.get(sid);
      if (!info) continue;
      if (!divisionClassCount.has(info.division)) {
        divisionClassCount.set(info.division, new Set());
      }
      divisionClassCount.get(info.division)!.add(info.classId);
    }
    for (const [division, classIdSet] of divisionClassCount) {
      const limitError = validateWeeklyLimit(division, classIdSet.size);
      if (limitError) {
        issues.push({
          type: "time_conflict",
          enforcement: "hard_block",
          message: limitError,
          dancerId,
          isWaivable: false,
        });
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 4. Time conflict check per dancer                                        */
  /* ---------------------------------------------------------------------- */
  for (const [dancerId, sids] of dancerSessions) {
    for (let i = 0; i < sids.length; i++) {
      for (let j = i + 1; j < sids.length; j++) {
        const a = sessionMap.get(sids[i]);
        const b = sessionMap.get(sids[j]);

        if (!a || !b) continue;
        if (!a.startTime || !a.endTime || !b.startTime || !b.endTime) continue;

        // Per-day sessions conflict only on same calendar date; legacy on same day-of-week.
        const aIsPerDay = !!a.scheduleDate;
        const bIsPerDay = !!b.scheduleDate;
        let sameDay: boolean;
        if (aIsPerDay && bIsPerDay) {
          sameDay = a.scheduleDate === b.scheduleDate;
        } else if (!aIsPerDay && !bIsPerDay) {
          sameDay = a.dayOfWeek === b.dayOfWeek;
        } else {
          continue; // mixed types — incomparable
        }
        if (!sameDay) continue;

        if (a.startTime < b.endTime && a.endTime > b.startTime) {
          const dayLabel = aIsPerDay ? a.scheduleDate! : a.dayOfWeek;
          issues.push({
            type: "time_conflict",
            enforcement: "hard_block",
            message: `Schedule conflict: "${a.className}" and "${b.className}" overlap on ${dayLabel}.`,
            dancerId,
            sessionId: sids[i],
            isWaivable: false,
          });
        }
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 4. Class requirements check                                              */
  /* ---------------------------------------------------------------------- */
  const classIds = [
    ...new Set(
      [...sessionMap.values()]
        .map((s) => s.classId)
        .filter(Boolean) as string[],
    ),
  ];

  if (classIds.length > 0) {
    const { data: requirements } = await supabase
      .from("class_requirements")
      .select("*")
      .in("class_id", classIds);

    if (requirements && requirements.length > 0) {
      for (const [dancerId, sids] of dancerSessions) {
        const dancerClassIds = sids
          .map((sid) => sessionMap.get(sid)?.classId)
          .filter(Boolean) as string[];

        for (const req of requirements) {
          if (!dancerClassIds.includes(req.class_id)) continue;

          // Check for an admin-granted waiver
          const { count: waiverCount } = await supabase
            .from("requirement_waivers")
            .select("id", { count: "exact", head: true })
            .eq("class_requirement_id", req.id)
            .eq("dancer_id", dancerId);

          if ((waiverCount ?? 0) > 0) continue;

          if (req.requirement_type === "prerequisite_completed") {
            // Check if dancer has a confirmed registration in a class
            // matching the required discipline + level in a PRIOR semester.
            const { data: priorRegs } = await supabase
              .from("registrations")
              .select(
                "id, class_sessions(semester_id, classes(discipline, level))",
              )
              .eq("dancer_id", dancerId)
              .eq("status", "confirmed");

            const hasCompleted = (priorRegs ?? []).some((reg: any) => {
              const session = Array.isArray(reg.class_sessions)
                ? reg.class_sessions[0]
                : reg.class_sessions;
              if (!session || session.semester_id === input.semesterId)
                return false;
              const cls = Array.isArray(session.classes)
                ? session.classes[0]
                : session.classes;
              if (!cls) return false;
              if (
                req.required_discipline &&
                cls.discipline !== req.required_discipline
              )
                return false;
              if (req.required_level && cls.level !== req.required_level)
                return false;
              return true;
            });

            if (!hasCompleted) {
              issues.push({
                type: "prerequisite_completed",
                enforcement: req.enforcement,
                message: req.description,
                dancerId,
                requirementId: req.id,
                isWaivable: req.is_waivable,
              });
            }
          } else if (req.requirement_type === "concurrent_enrollment") {
            // Check if the required class is also being enrolled in this batch.
            const isEnrolled =
              req.required_class_id &&
              dancerClassIds.includes(req.required_class_id);

            if (!isEnrolled) {
              issues.push({
                type: "concurrent_enrollment",
                enforcement: req.enforcement,
                message: req.description,
                dancerId,
                requirementId: req.id,
                isWaivable: req.is_waivable,
              });
            }
          } else if (
            req.requirement_type === "teacher_recommendation" ||
            req.requirement_type === "skill_qualification" ||
            req.requirement_type === "audition_required"
          ) {
            // These always require an admin waiver to bypass (already checked above).
            issues.push({
              type: req.requirement_type as EnrollmentValidationIssue["type"],
              enforcement: req.enforcement,
              message: req.description,
              dancerId,
              requirementId: req.id,
              isWaivable: req.is_waivable,
            });
          }
        }
      }
    }
  }

  const hasHardBlock = issues.some((i) => i.enforcement === "hard_block");

  return {
    valid: !hasHardBlock,
    hasHardBlock,
    issues,
  };
}
