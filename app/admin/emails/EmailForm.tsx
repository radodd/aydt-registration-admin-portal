"use client";

import {
  EmailDraft,
  EmailSelectionCriteria,
  EmailStatus,
  EmailWizardAction,
  ManualUserEntry,
} from "@/types";
import { useRouter, useSearchParams } from "next/navigation";
import { JSX, useEffect, useReducer, useRef, useState } from "react";
import { updateEmailDraft } from "./actions/updateEmailDraft";
import { sendEmailNow } from "./actions/sendEmailNow";
import { scheduleEmail } from "./actions/scheduleEmail";
import { revertToDraft } from "./actions/revertToDraft";
import { EmailStatusBadge } from "./EmailStatusBadge";
import SetupStep from "./steps/SetupStep";
import RecipientsStep from "./steps/RecipientsStep";
import DesignStep from "./steps/DesignStep";
import PreviewScheduleStep from "./steps/PreviewScheduleStep";
import { createEmailTemplate } from "./actions/createEmailTemplate";

const STEPS = [
  { key: "setup", label: "Setup" },
  { key: "recipients", label: "Recipients" },
  { key: "design", label: "Design" },
  { key: "previewSchedule", label: "Preview & Schedule" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

function emailReducer(
  state: EmailDraft,
  action: EmailWizardAction,
): EmailDraft {
  switch (action.type) {
    case "SET_ID":
      return { ...state, id: action.payload };

    case "SET_SETUP":
      return { ...state, setup: action.payload };

    case "SET_RECIPIENTS":
      return { ...state, recipients: action.payload };

    case "ADD_SELECTION": {
      const existing = state.recipients?.selections ?? [];
      if (existing.some((s) => s.localId === action.payload.localId))
        return state;
      return {
        ...state,
        recipients: {
          selections: [...existing, action.payload],
          manualAdditions: state.recipients?.manualAdditions ?? [],
          exclusions: state.recipients?.exclusions ?? [],
          resolvedCount: state.recipients?.resolvedCount,
        },
      };
    }

    case "REMOVE_SELECTION":
      return {
        ...state,
        recipients: {
          ...state.recipients,
          selections: (state.recipients?.selections ?? []).filter(
            (s) => s.localId !== action.payload,
          ),
          manualAdditions: state.recipients?.manualAdditions ?? [],
          exclusions: state.recipients?.exclusions ?? [],
        },
      };

    case "ADD_MANUAL_USER": {
      const existing = state.recipients?.manualAdditions ?? [];
      if (existing.some((u) => u.userId === action.payload.userId))
        return state;
      return {
        ...state,
        recipients: {
          ...state.recipients,
          selections: state.recipients?.selections ?? [],
          manualAdditions: [...existing, action.payload],
          exclusions: state.recipients?.exclusions ?? [],
        },
      };
    }

    case "REMOVE_MANUAL_USER":
      return {
        ...state,
        recipients: {
          ...state.recipients,
          selections: state.recipients?.selections ?? [],
          manualAdditions: (state.recipients?.manualAdditions ?? []).filter(
            (u) => u.userId !== action.payload,
          ),
          exclusions: state.recipients?.exclusions ?? [],
        },
      };

    case "TOGGLE_EXCLUSION": {
      const exclusions = state.recipients?.exclusions ?? [];
      const isExcluded = exclusions.includes(action.payload);
      return {
        ...state,
        recipients: {
          ...state.recipients,
          selections: state.recipients?.selections ?? [],
          manualAdditions: state.recipients?.manualAdditions ?? [],
          exclusions: isExcluded
            ? exclusions.filter((id) => id !== action.payload)
            : [...exclusions, action.payload],
        },
      };
    }

    case "SET_RESOLVED_COUNT":
      return {
        ...state,
        recipients: {
          selections: state.recipients?.selections ?? [],
          manualAdditions: state.recipients?.manualAdditions ?? [],
          exclusions: state.recipients?.exclusions ?? [],
          resolvedCount: action.payload,
        },
      };

    case "SET_DESIGN":
      return { ...state, design: action.payload };

    case "SET_SCHEDULE":
      return { ...state, schedule: action.payload };

    case "RESET":
      return {};

    default:
      return state;
  }
}

type Props = {
  initialState: EmailDraft;
  isSuperAdmin: boolean;
  /** Current persisted status of this email (drives header action buttons). */
  emailStatus?: EmailStatus;
};

export default function EmailForm({
  initialState,
  isSuperAdmin,
  emailStatus = "draft",
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, dispatch] = useReducer(emailReducer, initialState);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const persistedSnapshotRef = useRef<string>(
    JSON.stringify(initialState ?? {}),
  );

  console.log("STATE", state);

  // Header action state
  const [headerSaving, setHeaderSaving] = useState(false);
  const [headerSaved, setHeaderSaved] = useState(false);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [headerScheduledAt, setHeaderScheduledAt] = useState("");

  const stepParam = searchParams.get("step") as StepKey | null;
  const currentStepKey: StepKey =
    STEPS.find((s) => s.key === stepParam)?.key ?? "setup";
  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStepKey);
  const basePath = `/admin/emails/${state.id}/edit`;

  const isDirty = JSON.stringify(state) !== persistedSnapshotRef.current;

  // Block browser/tab close when there are unsaved changes.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  async function navigateToList() {
    if (isDirty && state.id) {
      try {
        await updateEmailDraft(state.id, state);
        persistedSnapshotRef.current = JSON.stringify(state);
      } catch {
        // Non-fatal — navigate anyway
      }
    }
    router.push("/admin/emails");
  }

  async function handleHeaderSave() {
    if (!state.id) return;
    setHeaderSaving(true);
    setHeaderError(null);
    setHeaderSaved(false);
    try {
      await updateEmailDraft(state.id, state);
      persistedSnapshotRef.current = JSON.stringify(state);
      setHeaderSaved(true);
      setTimeout(() => setHeaderSaved(false), 2000);
    } catch (err) {
      setHeaderError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setHeaderSaving(false);
    }
  }

  async function handleHeaderSendNow() {
    if (!state.id || !confirm("Send this email now to all recipients?")) return;
    setHeaderSaving(true);
    setHeaderError(null);
    try {
      await sendEmailNow(state.id, state);
      router.push("/admin/emails");
    } catch (err) {
      setHeaderError(err instanceof Error ? err.message : "Send failed");
      setHeaderSaving(false);
    }
  }

  async function handleHeaderSaveAsTemplate() {
    if (!state.id) return;
    setHeaderSaving(true);
    setHeaderError(null);
    setHeaderSaved(false);
    try {
      await createEmailTemplate(state);
      router.push("/admin/emails");
    } catch (err) {
      setHeaderError(err instanceof Error ? err.message : "Template error");
      setHeaderSaving(false);
    }
  }

  async function handleHeaderSchedule() {
    if (!state.id || !headerScheduledAt) return;
    setHeaderSaving(true);
    setHeaderError(null);
    try {
      await scheduleEmail(
        state.id,
        new Date(headerScheduledAt).toISOString(),
        state,
      );
      router.push("/admin/emails");
    } catch (err) {
      setHeaderError(err instanceof Error ? err.message : "Schedule failed");
      setHeaderSaving(false);
    }
  }

  async function handleHeaderRevertToDraft() {
    if (
      !state.id ||
      !confirm(
        "Revert this email to draft? The schedule and recipient snapshot will be cleared.",
      )
    )
      return;
    setHeaderSaving(true);
    setHeaderError(null);
    try {
      await revertToDraft(state.id);
      router.refresh();
    } catch (err) {
      setHeaderError(err instanceof Error ? err.message : "Revert failed");
      setHeaderSaving(false);
    }
  }

  const minDatetime = new Date(Date.now() + 5 * 60 * 1000)
    .toISOString()
    .slice(0, 16);

  async function navigateToStep(index: number) {
    const bounded = Math.max(0, Math.min(index, STEPS.length - 1));
    setIsSaving(true);
    setSaveError(null);
    try {
      if (state.id) {
        await updateEmailDraft(state.id, state);
        persistedSnapshotRef.current = JSON.stringify(state);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
      setIsSaving(false);
      return;
    }
    setIsSaving(false);
    router.push(`${basePath}?step=${STEPS[bounded].key}`);
  }

  const nextStep = () => navigateToStep(currentStepIndex + 1);
  const previousStep = () => navigateToStep(currentStepIndex - 1);

  const stepRenderers: Record<StepKey, JSX.Element> = {
    setup: <SetupStep state={state} dispatch={dispatch} onNext={nextStep} />,
    recipients: (
      <RecipientsStep
        state={state}
        dispatch={dispatch}
        onNext={nextStep}
        onBack={previousStep}
      />
    ),
    design: (
      <DesignStep
        state={state}
        dispatch={dispatch}
        onNext={nextStep}
        onBack={previousStep}
        emailId={state.id!}
      />
    ),
    previewSchedule: (
      <PreviewScheduleStep
        state={state}
        dispatch={dispatch}
        onBack={previousStep}
        emailId={state.id!}
        isSuperAdmin={isSuperAdmin}
      />
    ),
  };

  return (
    <div>
      {/* Lifecycle header */}
      <div className="flex items-center justify-between gap-4 mb-6 pb-5 border-b border-gray-200">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={navigateToList}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors shrink-0"
          >
            ← All Emails
          </button>
          <span className="text-gray-300">|</span>
          <EmailStatusBadge status={emailStatus} />
          <span className="text-sm text-gray-500 truncate max-w-xs">
            {state.setup?.subject || "(no subject)"}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {headerError && (
            <span className="text-xs text-red-600">{headerError}</span>
          )}

          {/* Draft actions */}
          {emailStatus === "draft" && (
            <>
              <button
                onClick={handleHeaderSave}
                disabled={headerSaving}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
              >
                {headerSaving
                  ? "Saving…"
                  : headerSaved
                    ? "Saved ✓"
                    : "Save Draft"}
              </button>

              {isSuperAdmin && (
                <button
                  onClick={handleHeaderSaveAsTemplate}
                  disabled={headerSaving}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                >
                  Save as template
                </button>
              )}

              {isSuperAdmin && (
                <button
                  onClick={handleHeaderSendNow}
                  disabled={headerSaving}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                >
                  Send Now
                </button>
              )}

              {isSuperAdmin && (
                <div className="relative">
                  <button
                    onClick={() => setShowSchedulePicker((v) => !v)}
                    disabled={headerSaving}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50"
                  >
                    Schedule ▾
                  </button>
                  {showSchedulePicker && (
                    <div className="absolute right-0 top-full mt-2 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-4 space-y-3 w-64">
                      <p className="text-xs font-medium text-gray-700">
                        Schedule send
                      </p>
                      <input
                        type="datetime-local"
                        value={headerScheduledAt}
                        min={minDatetime}
                        onChange={(e) => setHeaderScheduledAt(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowSchedulePicker(false)}
                          className="flex-1 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            setShowSchedulePicker(false);
                            handleHeaderSchedule();
                          }}
                          disabled={!headerScheduledAt}
                          className="flex-1 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-40"
                        >
                          Confirm
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Scheduled / failed actions */}
          {(emailStatus === "scheduled" || emailStatus === "failed") &&
            isSuperAdmin && (
              <button
                onClick={handleHeaderRevertToDraft}
                disabled={headerSaving}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
              >
                {headerSaving ? "Reverting…" : "Revert to Draft"}
              </button>
            )}
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-8 flex-wrap">
        {STEPS.map((step, i) => {
          const isActive = i === currentStepIndex;
          const isPast = i < currentStepIndex;
          return (
            <button
              key={step.key}
              onClick={() => navigateToStep(i)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${isActive ? "bg-indigo-600 text-white" : ""}
                ${isPast && !isActive ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200" : ""}
                ${!isActive && !isPast ? "bg-gray-100 text-gray-500 hover:bg-gray-200" : ""}
              `}
            >
              {i + 1}. {step.label}
            </button>
          );
        })}
      </div>

      {/* Save error — inline, stays in document flow */}
      {saveError && (
        <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {saveError}
        </div>
      )}

      {/* Unsaved changes toast — fixed, does not affect layout */}
      {isDirty && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl shadow-lg animate-fade-in">
          <span className="text-amber-700 text-sm font-medium">
            {isSaving ? "Saving…" : "Unsaved changes"}
          </span>
          {!isSaving && (
            <button
              onClick={() => navigateToStep(currentStepIndex)}
              className="text-sm text-amber-700 font-semibold underline"
            >
              Save Now
            </button>
          )}
        </div>
      )}

      {stepRenderers[currentStepKey]}
    </div>
  );
}
