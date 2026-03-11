"use client";

import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@/utils/supabase/client";
import {
  EmailDraft,
  EmailSelectionCriteria,
  EmailWizardAction,
  FamilyRecipient,
} from "@/types";
import { previewResolvedFamilies } from "../actions/previewResolvedFamilies";

type Props = {
  state: EmailDraft;
  dispatch: React.Dispatch<EmailWizardAction>;
  onNext: () => void;
  onBack: () => void;
};

// ── Tree data types ───────────────────────────────────────────────────

type SessionNode = {
  id: string;
  dayOfWeek: string;
  startTime: string | null;
  label: string;
  enrolledFamilyCount: number;
};

type ClassNode = {
  id: string;
  name: string;
  enrolledFamilyCount: number;
  sessions: SessionNode[];
};

type SemesterNode = {
  id: string;
  name: string;
  enrolledFamilyCount: number;
  classes: ClassNode[];
};

// ── User search ───────────────────────────────────────────────────────

type UserSearchResult = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  source: "portal" | "subscriber";
};

// ── Helpers ───────────────────────────────────────────────────────────

function formatTime(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  const min = m ?? "00";
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${min} ${ampm}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Main component ────────────────────────────────────────────────────

export default function RecipientsStep({
  state,
  dispatch,
  onNext,
  onBack,
}: Props) {
  const selections = state.recipients?.selections ?? [];
  const manualAdditions = state.recipients?.manualAdditions ?? [];
  const excludedFamilyIds = state.recipients?.excludedFamilyIds ?? [];
  const resolvedFamilies = state.recipients?.resolvedFamilies ?? [];
  const resolvedCount = state.recipients?.resolvedCount;

  const [semesterTree, setSemesterTree] = useState<SemesterNode[]>([]);
  const [expandedSemesters, setExpandedSemesters] = useState<Set<string>>(new Set());
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  const [isTreeLoading, setIsTreeLoading] = useState(true);

  const [instructorSearch, setInstructorSearch] = useState("");
  const [instructorResults, setInstructorResults] = useState<string[]>([]);
  const [isInstructorSearching, setIsInstructorSearching] = useState(false);
  const instructorSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [isReviewLoading, setIsReviewLoading] = useState(false);

  const reviewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load semester tree ──────────────────────────────────────────────

  useEffect(() => {
    async function loadTree() {
      setIsTreeLoading(true);
      const supabase = createClient();

      const { data: semesters } = await supabase
        .from("semesters")
        .select("id, name, classes(id, name, class_sessions(id, day_of_week, start_time))")
        .in("status", ["published", "archived"])
        .order("created_at", { ascending: false });

      if (!semesters) {
        setIsTreeLoading(false);
        return;
      }

      // Collect all session IDs for enrollment count queries
      const allSessionIds: string[] = (semesters as any[]).flatMap((sem: any) =>
        (sem.classes ?? []).flatMap((cls: any) =>
          (cls.class_sessions ?? []).map((cs: any) => cs.id),
        ),
      );

      // Fetch enrollment counts: distinct families per session
      const { data: regRows } = allSessionIds.length
        ? await supabase
            .from("registrations")
            .select("session_id, dancers!inner(family_id)")
            .in("session_id", allSessionIds)
            .neq("status", "cancelled")
        : { data: [] };

      // Build family count maps
      const sessionFamilies = new Map<string, Set<string>>();
      for (const row of regRows ?? []) {
        const dancer = Array.isArray((row as any).dancers) ? (row as any).dancers[0] : (row as any).dancers;
        const familyId = dancer?.family_id as string | undefined;
        const sessionId = (row as any).session_id as string;
        if (!familyId) continue;
        if (!sessionFamilies.has(sessionId)) sessionFamilies.set(sessionId, new Set());
        sessionFamilies.get(sessionId)!.add(familyId);
      }

      const tree: SemesterNode[] = (semesters as any[]).map((sem: any) => {
        const classes: ClassNode[] = (sem.classes ?? []).map((cls: any) => {
          const sessions: SessionNode[] = (cls.class_sessions ?? []).map((cs: any) => ({
            id: cs.id,
            dayOfWeek: cs.day_of_week,
            startTime: cs.start_time,
            label: `${capitalize(cs.day_of_week)}${cs.start_time ? ` ${formatTime(cs.start_time)}` : ""}`,
            enrolledFamilyCount: sessionFamilies.get(cs.id)?.size ?? 0,
          }));

          const classFamily = new Set<string>();
          for (const s of sessions) {
            for (const fid of sessionFamilies.get(s.id) ?? []) classFamily.add(fid);
          }

          return {
            id: cls.id,
            name: cls.name,
            enrolledFamilyCount: classFamily.size,
            sessions,
          };
        });

        const semFamily = new Set<string>();
        for (const cls of classes) {
          for (const s of cls.sessions) {
            for (const fid of sessionFamilies.get(s.id) ?? []) semFamily.add(fid);
          }
        }

        return {
          id: sem.id,
          name: sem.name,
          enrolledFamilyCount: semFamily.size,
          classes,
        };
      });

      setSemesterTree(tree);
      setIsTreeLoading(false);
    }

    loadTree();
  }, []);

  // ── Debounced recipient review ──────────────────────────────────────

  useEffect(() => {
    if (reviewDebounceRef.current) clearTimeout(reviewDebounceRef.current);
    reviewDebounceRef.current = setTimeout(async () => {
      setIsReviewLoading(true);
      try {
        const families = await previewResolvedFamilies(
          selections,
          manualAdditions,
          excludedFamilyIds,
        );
        dispatch({ type: "SET_RESOLVED_FAMILIES", payload: families });
      } catch {
        // silent
      } finally {
        setIsReviewLoading(false);
      }
    }, 600);
    return () => {
      if (reviewDebounceRef.current) clearTimeout(reviewDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selections.length, manualAdditions.length, excludedFamilyIds.length]);

  // ── Debounced user search ───────────────────────────────────────────

  useEffect(() => {
    if (!userSearch.trim()) {
      setUserResults([]);
      return;
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      const supabase = createClient();
      const [{ data: users }, { data: subs }] = await Promise.all([
        supabase
          .from("users")
          .select("id, email, first_name, last_name")
          .or(
            `email.ilike.%${userSearch}%,first_name.ilike.%${userSearch}%,last_name.ilike.%${userSearch}%`,
          )
          .limit(6),
        supabase
          .from("email_subscribers")
          .select("id, email, name")
          .or(`email.ilike.%${userSearch}%,name.ilike.%${userSearch}%`)
          .eq("is_subscribed", true)
          .limit(4),
      ]);

      const portalResults: UserSearchResult[] = (users ?? []).map((u: any) => ({
        id: u.id,
        email: u.email,
        first_name: u.first_name,
        last_name: u.last_name,
        source: "portal",
      }));

      const subscriberResults: UserSearchResult[] = (subs ?? []).map((s: any) => {
        const parts = (s.name ?? "").trim().split(/\s+/);
        return {
          id: s.id,
          email: s.email,
          first_name: parts[0] ?? "",
          last_name: parts.slice(1).join(" "),
          source: "subscriber",
        };
      });

      setUserResults([...portalResults, ...subscriberResults]);
      setIsSearching(false);
    }, 400);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [userSearch]);

  // ── Debounced instructor search ─────────────────────────────────────

  useEffect(() => {
    if (!instructorSearch.trim()) {
      setInstructorResults([]);
      return;
    }
    if (instructorSearchDebounceRef.current) clearTimeout(instructorSearchDebounceRef.current);
    instructorSearchDebounceRef.current = setTimeout(async () => {
      setIsInstructorSearching(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("class_sessions")
        .select("instructor_name")
        .ilike("instructor_name", `%${instructorSearch}%`)
        .not("instructor_name", "is", null)
        .limit(10);
      const unique = [
        ...new Set(
          (data ?? [])
            .map((s: { instructor_name: string | null }) => s.instructor_name)
            .filter(Boolean) as string[],
        ),
      ].sort();
      setInstructorResults(unique);
      setIsInstructorSearching(false);
    }, 400);
    return () => {
      if (instructorSearchDebounceRef.current) clearTimeout(instructorSearchDebounceRef.current);
    };
  }, [instructorSearch]);

  // ── Selection helpers ───────────────────────────────────────────────

  const hasSubscribedList = selections.some((s) => s.type === "subscribed_list");

  function isSelected(type: EmailSelectionCriteria["type"], id?: string): boolean {
    if (type === "subscribed_list") return hasSubscribedList;
    if (type === "semester") return selections.some((s) => s.type === "semester" && s.semesterId === id);
    if (type === "class") return selections.some((s) => s.type === "class" && s.classId === id);
    if (type === "session") return selections.some((s) => s.type === "session" && s.sessionId === id);
    return false;
  }

  function isSemesterCovered(semesterId: string): boolean {
    return selections.some((s) => s.type === "semester" && s.semesterId === semesterId);
  }

  function isClassCovered(classId: string, semesterId: string): boolean {
    return (
      isSemesterCovered(semesterId) ||
      selections.some((s) => s.type === "class" && s.classId === classId)
    );
  }

  function toggleSemester(sem: SemesterNode) {
    if (isSelected("semester", sem.id)) {
      const sel = selections.find((s) => s.type === "semester" && s.semesterId === sem.id);
      if (sel) dispatch({ type: "REMOVE_SELECTION", payload: sel.localId });
    } else {
      dispatch({
        type: "ADD_SELECTION",
        payload: {
          localId: uuidv4(),
          type: "semester",
          semesterId: sem.id,
          semesterName: sem.name,
        },
      });
    }
  }

  function toggleClass(cls: ClassNode, sem: SemesterNode) {
    if (isClassCovered(cls.id, sem.id)) {
      const sel = selections.find((s) => s.type === "class" && s.classId === cls.id);
      if (sel) dispatch({ type: "REMOVE_SELECTION", payload: sel.localId });
    } else {
      dispatch({
        type: "ADD_SELECTION",
        payload: {
          localId: uuidv4(),
          type: "class",
          semesterId: sem.id,
          semesterName: sem.name,
          classId: cls.id,
          className: cls.name,
        },
      });
    }
  }

  function toggleSession(session: SessionNode, cls: ClassNode, sem: SemesterNode) {
    if (isSelected("session", session.id) || isClassCovered(cls.id, sem.id)) {
      const sel = selections.find((s) => s.type === "session" && s.sessionId === session.id);
      if (sel) dispatch({ type: "REMOVE_SELECTION", payload: sel.localId });
    } else {
      dispatch({
        type: "ADD_SELECTION",
        payload: {
          localId: uuidv4(),
          type: "session",
          semesterId: sem.id,
          semesterName: sem.name,
          classId: cls.id,
          className: cls.name,
          sessionId: session.id,
          sessionName: session.label,
        },
      });
    }
  }

  function getClassSelection(classId: string): EmailSelectionCriteria | undefined {
    return selections.find((s) => s.type === "class" && s.classId === classId);
  }

  function addManualUser(user: UserSearchResult) {
    dispatch({
      type: "ADD_MANUAL_USER",
      payload:
        user.source === "subscriber"
          ? {
              subscriberId: user.id,
              email: user.email,
              firstName: user.first_name,
              lastName: user.last_name,
            }
          : {
              userId: user.id,
              email: user.email,
              firstName: user.first_name,
              lastName: user.last_name,
            },
    });
    setUserSearch("");
    setUserResults([]);
  }

  // ── Chip label ──────────────────────────────────────────────────────

  function selectionLabel(sel: EmailSelectionCriteria): string {
    if (sel.type === "subscribed_list") return "Subscribed list";
    if (sel.type === "semester") return sel.semesterName ?? "Semester";
    if (sel.type === "class") return `${sel.semesterName} › ${sel.className}`;
    if (sel.type === "session") return `${sel.semesterName} › ${sel.className} › ${sel.sessionName}`;
    if (sel.type === "instructor") return `Instructor: ${sel.instructorName}`;
    return "Selection";
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Recipients</h2>
        <p className="text-sm text-gray-500 mt-1">
          Select who receives this email. One email per family. Unsubscribed users are automatically excluded.
        </p>
      </div>

      {/* Subscribed list */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700">Subscribed list</p>
        <p className="text-xs text-gray-400">
          Targets all portal users who are subscribed plus any external subscribers.
        </p>
        <button
          onClick={() => {
            if (hasSubscribedList) {
              const sel = selections.find((s) => s.type === "subscribed_list");
              if (sel) dispatch({ type: "REMOVE_SELECTION", payload: sel.localId });
            } else {
              dispatch({
                type: "ADD_SELECTION",
                payload: { localId: uuidv4(), type: "subscribed_list" },
              });
            }
          }}
          className={`px-4 py-2 rounded-xl border text-sm font-medium transition ${
            hasSubscribedList
              ? "border-indigo-400 bg-indigo-100 text-indigo-800"
              : "border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
          }`}
        >
          {hasSubscribedList ? "Subscribed list added ✓" : "+ Add subscribed list"}
        </button>
      </div>

      {/* Hierarchical class selector */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700">Add by class or session</p>
        {isTreeLoading ? (
          <p className="text-sm text-gray-400">Loading classes…</p>
        ) : semesterTree.length === 0 ? (
          <p className="text-sm text-gray-400">No published semesters found.</p>
        ) : (
          <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
            {semesterTree.map((sem) => {
              const semSelected = isSelected("semester", sem.id);
              const semExpanded = expandedSemesters.has(sem.id);

              return (
                <div key={sem.id}>
                  {/* Semester row */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition">
                    <input
                      type="checkbox"
                      checked={semSelected}
                      onChange={() => toggleSemester(sem)}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <button
                      onClick={() =>
                        setExpandedSemesters((prev) => {
                          const next = new Set(prev);
                          next.has(sem.id) ? next.delete(sem.id) : next.add(sem.id);
                          return next;
                        })
                      }
                      className="flex-1 flex items-center justify-between text-left"
                    >
                      <span className="text-sm font-semibold text-gray-800">{sem.name}</span>
                      <span className="flex items-center gap-2 text-xs text-gray-400">
                        <span>{sem.enrolledFamilyCount} families</span>
                        <span>{semExpanded ? "▴" : "▾"}</span>
                      </span>
                    </button>
                  </div>

                  {/* Classes */}
                  {semExpanded && (
                    <div className="divide-y divide-gray-100">
                      {sem.classes.map((cls) => {
                        const classCovered = isClassCovered(cls.id, sem.id);
                        const classExpanded = expandedClasses.has(cls.id);
                        const classSel = getClassSelection(cls.id);

                        return (
                          <div key={cls.id}>
                            {/* Class row */}
                            <div className="flex items-center gap-3 pl-8 pr-4 py-2.5 bg-white hover:bg-gray-50 transition">
                              <input
                                type="checkbox"
                                checked={classCovered}
                                disabled={semSelected}
                                onChange={() => toggleClass(cls, sem)}
                                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                              />
                              <button
                                onClick={() =>
                                  setExpandedClasses((prev) => {
                                    const next = new Set(prev);
                                    next.has(cls.id) ? next.delete(cls.id) : next.add(cls.id);
                                    return next;
                                  })
                                }
                                className="flex-1 flex items-center justify-between text-left"
                              >
                                <span className="text-sm text-gray-700">{cls.name}</span>
                                <span className="flex items-center gap-2 text-xs text-gray-400">
                                  <span>{cls.enrolledFamilyCount} families</span>
                                  <span>{classExpanded ? "▴" : "▾"}</span>
                                </span>
                              </button>

                              {/* Include instructors toggle — only shown when class is selected */}
                              {classSel && !semSelected && (
                                <button
                                  onClick={() =>
                                    dispatch({
                                      type: "TOGGLE_INSTRUCTOR_INCLUSION",
                                      payload: classSel.localId,
                                    })
                                  }
                                  title="Include class instructor(s)"
                                  className={`text-xs px-2 py-1 rounded-lg border transition ${
                                    classSel.includeInstructors
                                      ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                                      : "border-gray-200 text-gray-400 hover:text-gray-600"
                                  }`}
                                >
                                  + instructor
                                </button>
                              )}
                            </div>

                            {/* Sessions */}
                            {classExpanded && (
                              <div className="divide-y divide-gray-50">
                                {cls.sessions.map((session) => {
                                  const sessionCovered =
                                    classCovered || isSelected("session", session.id);

                                  return (
                                    <div
                                      key={session.id}
                                      className="flex items-center gap-3 pl-14 pr-4 py-2 bg-white hover:bg-gray-50 transition"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={sessionCovered}
                                        disabled={classCovered}
                                        onChange={() => toggleSession(session, cls, sem)}
                                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                                      />
                                      <span className="text-sm text-gray-600 flex-1">
                                        {session.label}
                                      </span>
                                      <span className="text-xs text-gray-400">
                                        {session.enrolledFamilyCount} families
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add by instructor */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700">Add by instructor</p>
        <p className="text-xs text-gray-400">
          Targets all families enrolled in any class taught by this instructor.
        </p>
        <div className="relative max-w-sm">
          <input
            type="text"
            value={instructorSearch}
            onChange={(e) => setInstructorSearch(e.target.value)}
            placeholder="Search instructor name…"
            className="w-full border border-gray-300 text-slate-500 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          {(instructorResults.length > 0 || isInstructorSearching) && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
              {isInstructorSearching ? (
                <div className="px-4 py-3 text-sm text-gray-400">Searching…</div>
              ) : (
                instructorResults.map((name) => {
                  const alreadyAdded = selections.some(
                    (s) => s.type === "instructor" && s.instructorName === name,
                  );
                  return (
                    <button
                      key={name}
                      disabled={alreadyAdded}
                      onClick={() => {
                        if (alreadyAdded) return;
                        dispatch({
                          type: "ADD_SELECTION",
                          payload: {
                            localId: uuidv4(),
                            type: "instructor",
                            instructorName: name,
                          },
                        });
                        setInstructorSearch("");
                        setInstructorResults([]);
                      }}
                      className="w-full text-left px-4 py-2.5 text-slate-600 text-sm hover:bg-gray-50 flex justify-between items-center disabled:opacity-50"
                    >
                      <span>{name}</span>
                      {alreadyAdded && (
                        <span className="text-xs text-gray-400">Added</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Selected criteria chips */}
      {selections.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Selected groups</p>
          <div className="flex flex-wrap gap-2">
            {selections.map((sel) => (
              <div
                key={sel.localId}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-full text-sm text-indigo-800"
              >
                <span>{selectionLabel(sel)}</span>
                {sel.includeInstructors && (
                  <span className="text-xs text-emerald-600 font-medium">+instructor</span>
                )}
                <button
                  onClick={() =>
                    dispatch({ type: "REMOVE_SELECTION", payload: sel.localId })
                  }
                  className="text-indigo-400 hover:text-indigo-700 leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual user search */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700">Add individual</p>
        <div className="relative max-w-sm">
          <input
            type="text"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full border border-gray-300 text-slate-500 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          {(userResults.length > 0 || isSearching) && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
              {isSearching ? (
                <div className="px-4 py-3 text-sm text-gray-400">Searching…</div>
              ) : (
                userResults.map((u) => {
                  const isAlreadyAdded =
                    u.source === "subscriber"
                      ? manualAdditions.some((m) => m.subscriberId === u.id)
                      : manualAdditions.some((m) => m.userId === u.id);
                  return (
                    <button
                      key={`${u.source}-${u.id}`}
                      onClick={() => !isAlreadyAdded && addManualUser(u)}
                      disabled={isAlreadyAdded}
                      className="w-full text-left px-4 py-2.5 text-slate-600 text-sm hover:bg-gray-50 flex justify-between items-center disabled:opacity-50"
                    >
                      <span>
                        {u.first_name} {u.last_name}
                        <span className="text-gray-400 ml-2">{u.email}</span>
                        {u.source === "subscriber" && (
                          <span className="ml-2 text-xs text-indigo-500 font-medium">
                            Subscriber
                          </span>
                        )}
                      </span>
                      {isAlreadyAdded && (
                        <span className="text-xs text-gray-400">Added</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Manual additions chips */}
        {manualAdditions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {manualAdditions.map((u) => {
              const key = u.subscriberId ?? u.userId ?? u.email;
              return (
                <div
                  key={key}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-full text-sm text-gray-700"
                >
                  <span>
                    {u.firstName} {u.lastName}
                    {u.subscriberId && (
                      <span className="ml-1 text-xs text-indigo-500 font-medium">
                        Subscriber
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() =>
                      dispatch({
                        type: "REMOVE_MANUAL_USER",
                        payload: u.subscriberId ?? u.userId ?? "",
                      })
                    }
                    className="text-gray-400 hover:text-gray-700 leading-none"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recipient review panel */}
      {(selections.length > 0 || manualAdditions.length > 0) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">
              Recipient review
              {!isReviewLoading && resolvedFamilies.length > 0 && (
                <span className="ml-2 text-gray-400 font-normal">
                  ({resolvedFamilies.length} {resolvedFamilies.length === 1 ? "family" : "families"})
                </span>
              )}
            </p>
            {isReviewLoading && (
              <span className="text-xs text-gray-400">Calculating…</span>
            )}
          </div>

          {!isReviewLoading && resolvedFamilies.length === 0 && (
            <p className="text-sm text-gray-400 italic">
              No eligible recipients matched. Check selections and subscription status.
            </p>
          )}

          {resolvedFamilies.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1fr_1fr_auto] text-xs font-medium text-gray-500 bg-gray-50 px-4 py-2 border-b border-gray-100">
                <span>Email / Parent</span>
                <span>Dancer(s) & Classes</span>
                <span />
              </div>
              <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                {resolvedFamilies.map((family: FamilyRecipient) => (
                  <FamilyRow
                    key={family.familyId}
                    family={family}
                    isExcluded={excludedFamilyIds.includes(family.familyId)}
                    onToggle={() =>
                      dispatch({
                        type: "TOGGLE_FAMILY_EXCLUSION",
                        payload: family.familyId,
                      })
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {excludedFamilyIds.length > 0 && (
            <p className="text-xs text-gray-400">
              {excludedFamilyIds.length} {excludedFamilyIds.length === 1 ? "family" : "families"} manually removed.{" "}
              <button
                onClick={() => {
                  for (const fid of excludedFamilyIds) {
                    dispatch({ type: "TOGGLE_FAMILY_EXCLUSION", payload: fid });
                  }
                }}
                className="underline hover:text-gray-600"
              >
                Restore all
              </button>
            </p>
          )}
        </div>
      )}

      {/* Count summary */}
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
        <p className="text-sm text-gray-600">
          Estimated recipients:{" "}
          {isReviewLoading ? (
            <span className="text-gray-400">Calculating…</span>
          ) : (
            <span className="font-semibold text-gray-900">{resolvedCount ?? 0} families</span>
          )}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          One email per family. Unsubscribed users are automatically excluded. Recipient list is finalized at send/schedule time.
        </p>
      </div>

      <div className="flex justify-between pt-6 border-t border-gray-200">
        <button
          onClick={onBack}
          className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

// ── FamilyRow sub-component ───────────────────────────────────────────

function FamilyRow({
  family,
  isExcluded,
  onToggle,
}: {
  family: FamilyRecipient;
  isExcluded: boolean;
  onToggle: () => void;
}) {
  const dancerSummary = family.dancers
    .map((d) => {
      const classList = d.classes.map((c) => `${c.className} (${c.sessionLabel})`).join(", ");
      return `${d.dancerName}${classList ? `: ${classList}` : ""}`;
    })
    .join(" · ");

  return (
    <div
      className={`grid grid-cols-[1fr_1fr_auto] items-start px-4 py-3 gap-3 transition ${
        isExcluded ? "opacity-40 bg-red-50" : "hover:bg-gray-50"
      }`}
    >
      <div>
        <p className="text-sm text-gray-800 font-medium">
          {family.primaryParentFirstName} {family.primaryParentLastName}
          {family.isInstructor && (
            <span className="ml-1.5 text-xs text-emerald-600 font-normal">instructor</span>
          )}
        </p>
        <p className="text-xs text-gray-400 truncate max-w-xs">{family.primaryEmail}</p>
      </div>

      <div className="text-xs text-gray-500 leading-relaxed">
        {dancerSummary || <span className="text-gray-300 italic">No enrollment context</span>}
      </div>

      <button
        onClick={onToggle}
        title={isExcluded ? "Restore this family" : "Remove this family"}
        className={`text-sm leading-none transition ${
          isExcluded
            ? "text-indigo-500 hover:text-indigo-700"
            : "text-gray-300 hover:text-red-500"
        }`}
      >
        {isExcluded ? "↩" : "×"}
      </button>
    </div>
  );
}
