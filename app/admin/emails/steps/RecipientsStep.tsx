"use client";

import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@/utils/supabase/client";
import { EmailDraft, EmailSelectionCriteria, EmailWizardAction } from "@/types";
import { previewRecipientCount } from "../actions/previewRecipientCount";

type Props = {
  state: EmailDraft;
  dispatch: React.Dispatch<EmailWizardAction>;
  onNext: () => void;
  onBack: () => void;
};

type SemesterOption = {
  id: string;
  name: string;
  // Flattened class_sessions with display labels built client-side
  sessions: { id: string; name: string }[];
};

type UserSearchResult = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  source: "portal" | "subscriber";
};

export default function RecipientsStep({
  state,
  dispatch,
  onNext,
  onBack,
}: Props) {
  const selections = state.recipients?.selections ?? [];
  const manualAdditions = state.recipients?.manualAdditions ?? [];
  const exclusions = state.recipients?.exclusions ?? [];
  const resolvedCount = state.recipients?.resolvedCount;

  const [semesters, setSemesters] = useState<SemesterOption[]>([]);
  const [selectedSemesterId, setSelectedSemesterId] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCountLoading, setIsCountLoading] = useState(false);

  const countDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load semesters for picker
  useEffect(() => {
    createClient()
      .from("semesters")
      .select("id, name, classes(id, name, class_sessions(id, day_of_week, start_time))")
      .in("status", ["published", "archived"])
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        // Flatten classes → class_sessions with display labels
        const mapped: SemesterOption[] = data.map((sem: any) => ({
          id: sem.id,
          name: sem.name,
          sessions: (sem.classes ?? []).flatMap((cls: any) =>
            (cls.class_sessions ?? []).map((cs: any) => ({
              id: cs.id,
              name: `${cls.name} — ${(cs.day_of_week as string).charAt(0).toUpperCase() + (cs.day_of_week as string).slice(1)}${cs.start_time ? ` ${cs.start_time}` : ""}`,
            })),
          ),
        }));
        setSemesters(mapped);
      });
  }, []);

  // Debounced recipient count preview
  useEffect(() => {
    if (countDebounceRef.current) clearTimeout(countDebounceRef.current);
    countDebounceRef.current = setTimeout(async () => {
      setIsCountLoading(true);
      try {
        const count = await previewRecipientCount(
          selections,
          manualAdditions,
          exclusions,
        );
        dispatch({ type: "SET_RESOLVED_COUNT", payload: count });
      } catch {
        // silent
      } finally {
        setIsCountLoading(false);
      }
    }, 600);
    return () => {
      if (countDebounceRef.current) clearTimeout(countDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selections.length, manualAdditions.length, exclusions.length]);

  // Debounced user search
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

  const activeSemester = semesters.find((s) => s.id === selectedSemesterId);

  const hasSubscribedList = selections.some((s) => s.type === "subscribed_list");

  function addSemesterOrSession() {
    if (!selectedSemesterId) return;
    const semester = semesters.find((s) => s.id === selectedSemesterId);
    if (!semester) return;

    const criteria: EmailSelectionCriteria = selectedSessionId
      ? {
          localId: uuidv4(),
          type: "session",
          semesterId: selectedSemesterId,
          semesterName: semester.name,
          sessionId: selectedSessionId,
          sessionName: semester.sessions.find((s) => s.id === selectedSessionId)
            ?.name,
        }
      : {
          localId: uuidv4(),
          type: "semester",
          semesterId: selectedSemesterId,
          semesterName: semester.name,
        };

    dispatch({ type: "ADD_SELECTION", payload: criteria });
    setSelectedSemesterId("");
    setSelectedSessionId("");
  }

  function addSubscribedList() {
    if (hasSubscribedList) return;
    dispatch({
      type: "ADD_SELECTION",
      payload: { localId: uuidv4(), type: "subscribed_list" },
    });
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

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Recipients</h2>
        <p className="text-sm text-gray-500 mt-1">
          Select who receives this email. Unsubscribed users are automatically
          excluded.
        </p>
      </div>

      {/* Subscribed list group */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700">Subscribed list</p>
        <p className="text-xs text-gray-400">
          Targets all portal users who are subscribed plus any external subscribers added by admins.
        </p>
        <button
          onClick={addSubscribedList}
          disabled={hasSubscribedList}
          className="px-4 py-2 rounded-xl border border-indigo-300 bg-indigo-50 text-indigo-700 text-sm font-medium hover:bg-indigo-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {hasSubscribedList ? "Subscribed list added" : "+ Add subscribed list"}
        </button>
      </div>

      {/* Semester / Session picker */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700">
          Add by semester or session
        </p>
        <div className="flex gap-3 flex-wrap">
          <select
            value={selectedSemesterId}
            onChange={(e) => {
              setSelectedSemesterId(e.target.value);
              setSelectedSessionId("");
            }}
            className="border border-gray-300 text-slate-500 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none min-w-48"
          >
            <option value="">Select semester…</option>
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {activeSemester && activeSemester.sessions.length > 0 && (
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="border border-gray-300 text-slate-500 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none min-w-48"
            >
              <option value="">All sessions (entire semester)</option>
              {activeSemester.sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={addSemesterOrSession}
            disabled={!selectedSemesterId}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add
          </button>
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
                <span>
                  {sel.type === "subscribed_list"
                    ? "Subscribed list"
                    : sel.sessionName
                      ? `${sel.semesterName} › ${sel.sessionName}`
                      : sel.semesterName}
                </span>
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
        <p className="text-sm font-medium text-gray-700">Add individual user</p>
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
                <div className="px-4 py-3 text-sm text-gray-400">
                  Searching…
                </div>
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

        {/* Manual additions list */}
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

      {/* Exclusions */}
      {exclusions.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">
            Excluded users{" "}
            <span className="text-gray-400 font-normal">
              ({exclusions.length})
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {exclusions.map((userId) => (
              <div
                key={userId}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-full text-sm text-red-700"
              >
                <span className="font-mono text-xs">{userId.slice(0, 8)}…</span>
                <button
                  onClick={() =>
                    dispatch({ type: "TOGGLE_EXCLUSION", payload: userId })
                  }
                  className="text-red-400 hover:text-red-700 leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recipient count */}
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
        <p className="text-sm text-gray-600">
          Estimated recipients:{" "}
          {isCountLoading ? (
            <span className="text-gray-400">Calculating…</span>
          ) : (
            <span className="font-semibold text-gray-900">
              {resolvedCount ?? 0}
            </span>
          )}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Unsubscribed users are automatically excluded. Recipient list is
          finalized at send/schedule time.
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
