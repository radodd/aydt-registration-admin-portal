"use client";

import { SemesterAction, SemesterDraft } from "@/types";
import { useRouter, useSearchParams } from "next/navigation";
import { JSX, useEffect, useReducer, useRef, useState } from "react";
import DetailsStep from "./steps/DetailsStep";
import SessionsStep from "./steps/SessionsStep";
import PaymentStep from "./steps/PaymentStep";
import DiscountsStep from "./steps/DiscountsStep";
import ReviewStep from "./steps/ReviewStep";
import SessionsGroupsStep from "./steps/SessionGroupsStep";
import ConfirmationEmailStep from "./steps/ConfirmationEmailStep";
import WaitlistStep from "./steps/WaitlistStep";
import {
  publishSemesterNow,
  saveSemesterDraft,
  scheduleSemester,
} from "./actions/semesterLifecycle";
import { persistSemesterDraft } from "./actions/persistSemesterDraft";
import RegistrationFormStep from "./steps/RegistrationFormStep";
import Link from "next/link";
import { ChevronLeft, Eye } from "lucide-react";
import { Badge } from "@/app/components/ui";
import type { BadgeStatus } from "@/app/components/ui";

function semesterReducer(
  state: SemesterDraft,
  action: SemesterAction,
): SemesterDraft {
  let nextState: SemesterDraft;

  switch (action.type) {
    case "SET_ID":
      nextState = { ...state, id: action.payload };
      break;

    case "SET_DETAILS":
      nextState = { ...state, details: action.payload };
      break;

    case "SET_SESSIONS":
      nextState = { ...state, sessions: action.payload };
      break;

    case "SET_SESSION_GROUPS":
      nextState = { ...state, sessionGroups: action.payload };
      break;

    case "SET_PAYMENT":
      nextState = { ...state, paymentPlan: action.payload };
      break;

    case "SET_DISCOUNTS":
      nextState = { ...state, discounts: action.payload };
      break;

    case "SET_REGISTRATION_FORM":
      nextState = { ...state, registrationForm: action.payload };
      break;

    case "SET_CONFIRMATION_EMAIL":
      nextState = { ...state, confirmationEmail: action.payload };
      break;

    case "SET_WAITLIST":
      nextState = { ...state, waitlist: action.payload };
      break;

    case "SET_TUITION_RATE_BANDS":
      nextState = { ...state, tuitionRateBands: action.payload };
      break;

    case "SET_FEE_CONFIG":
      nextState = { ...state, feeConfig: action.payload };
      break;

    case "SET_SPECIAL_PROGRAM_TUITION":
      nextState = { ...state, specialProgramTuition: action.payload };
      break;

    case "SET_COUPONS":
      nextState = { ...state, coupons: action.payload };
      break;

    case "ADD_FORM_ELEMENT":
      nextState = {
        ...state,
        registrationForm: {
          elements: [
            ...(state.registrationForm?.elements ?? []),
            action.payload,
          ],
        },
      };
      break;

    case "UPDATE_FORM_ELEMENT":
      nextState = {
        ...state,
        registrationForm: {
          elements: (state.registrationForm?.elements ?? []).map((el) =>
            el.id === action.payload.id ? action.payload : el,
          ),
        },
      };
      break;

    case "REMOVE_FORM_ELEMENT":
      nextState = {
        ...state,
        registrationForm: {
          elements: (state.registrationForm?.elements ?? []).filter(
            (el) => el.id !== action.payload,
          ),
        },
      };
      break;

    case "REORDER_FORM_ELEMENTS":
      nextState = {
        ...state,
        registrationForm: {
          elements: action.payload,
        },
      };
      break;

    case "RESET":
      nextState = {};
      break;

    default:
      nextState = state;
  }

  return nextState;
}

/* -------------------------------------------------------------------------- */
/* Step Configuration                                                         */
/* -------------------------------------------------------------------------- */

const STEPS = [
  { key: "details",           label: "Details" },
  { key: "sessions",          label: "Classes & offerings" },
  { key: "sessionGroups",     label: "Class groups" },
  { key: "payment",           label: "Payment" },
  { key: "discounts",         label: "Discounts" },
  { key: "registrationForm",  label: "Registration form" },
  { key: "confirmationEmail", label: "Confirmation email" },
  { key: "waitlist",          label: "Waitlist" },
  { key: "review",            label: "Review & publish" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

function isStepKey(value: string | null): value is StepKey {
  return STEPS.some((step) => step.key === value);
}

type SemesterFormProps = {
  mode: "create" | "edit";
  basePath: string;
  initialState?: SemesterDraft;
  isLocked?: boolean;
  semesterStatus?: string;
};

export default function SemesterForm({
  mode,
  basePath,
  initialState,
  isLocked = false,
  semesterStatus,
}: SemesterFormProps) {
  const [state, dispatch] = useReducer(
    semesterReducer,
    initialState ?? ({} as SemesterDraft),
  );

  // stateRef always holds the most recent state, even within the same event loop tick
  // before React has processed the queued dispatch and re-rendered. This is critical
  // for navigateToStep: steps call dispatch(action) + onNext() in the same event
  // handler, so 'state' from the closure is still the pre-dispatch value when
  // navigateToStep runs. Reading stateRef.current instead of state ensures we
  // always persist the latest data.
  const stateRef = useRef<SemesterDraft>(initialState ?? ({} as SemesterDraft));
  stateRef.current = state; // keep in sync after every render

  // Wrapped dispatch: synchronously applies the action to stateRef so that
  // navigateToStep (called immediately after dispatch in step handleSubmit
  // functions) sees the updated state without waiting for a React re-render.
  function dispatchAndSync(action: SemesterAction) {
    stateRef.current = semesterReducer(stateRef.current, action);
    dispatch(action);
  }

  const router = useRouter();
  const searchParams = useSearchParams();
  const stepParam = searchParams.get("step");
  const activeStepKey: StepKey = isStepKey(stepParam) ? stepParam : "details";
  const activeStepIndex = STEPS.findIndex((step) => step.key === activeStepKey);

  /* ----------------------------- Dirty State ----------------------------- */

  const persistedSnapshotRef = useRef<string>(
    JSON.stringify(initialState ?? {}),
  );
  const isDirty = JSON.stringify(state) !== persistedSnapshotRef.current;
  const [isSaving, setIsSaving] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  /* ----------------------------- Navigation ------------------------------ */

  async function navigateToStep(index: number) {
    const boundedIndex = Math.min(Math.max(index, 0), STEPS.length - 1);
    const current = stateRef.current;

    setIsSaving(true);
    try {
      const { semesterId } = await persistSemesterDraft(current);
      if (!current.id) dispatch({ type: "SET_ID", payload: semesterId });
      persistedSnapshotRef.current = JSON.stringify({
        ...current,
        id: current.id ?? semesterId,
      });
    } catch {
      // persist failure — navigate anyway, retry on next transition
    } finally {
      setIsSaving(false);
    }

    router.push(`${basePath}?step=${STEPS[boundedIndex].key}`);
  }

  function nextStep() {
    navigateToStep(activeStepIndex + 1);
  }

  function previousStep() {
    navigateToStep(activeStepIndex - 1);
  }

  /* ------------------------- Step Submit Handler ------------------------- */

  // Each step can register its own submit handler (validation + dispatch + navigate).
  // If none is registered for the current step, the footer Next button falls back
  // to calling nextStep() directly.
  const stepSubmitRef = useRef<(() => void) | undefined>();

  useEffect(() => {
    stepSubmitRef.current = undefined;
  }, [activeStepKey]);

  function registerStepSubmit(fn: () => void) {
    stepSubmitRef.current = fn;
  }

  function handleFooterNext() {
    if (stepSubmitRef.current) {
      stepSubmitRef.current();
    } else {
      nextStep();
    }
  }

  /* ----------------------- Manual Save (top bar) ------------------------- */

  async function handleSaveDraft() {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const current = stateRef.current;
      const { semesterId } = await persistSemesterDraft(current);
      if (!current.id) dispatch({ type: "SET_ID", payload: semesterId });
      persistedSnapshotRef.current = JSON.stringify({
        ...current,
        id: current.id ?? semesterId,
      });
    } catch {
      // silent
    } finally {
      setIsSaving(false);
    }
  }

  /* ------------------------- Exit with Save ------------------------------ */

  async function handleExitConfirm() {
    setShowExitModal(false);
    setIsSaving(true);
    try {
      const current = stateRef.current;
      const { semesterId } = await persistSemesterDraft(current);
      if (!current.id) dispatch({ type: "SET_ID", payload: semesterId });
      persistedSnapshotRef.current = JSON.stringify({
        ...current,
        id: current.id ?? semesterId,
      });
    } catch {
      // silent — navigate regardless
    } finally {
      setIsSaving(false);
    }
    router.push("/admin/semesters");
  }

  /* ------------------------- Dev Test Data Fill -------------------------- */

  async function fillTestData() {
    const { TEST_SEMESTER_FIXTURE } = await import(
      "./dev/semesterTestFixture"
    );
    dispatchAndSync({ type: "SET_DETAILS", payload: TEST_SEMESTER_FIXTURE.details });
    dispatchAndSync({ type: "SET_SESSIONS", payload: TEST_SEMESTER_FIXTURE.sessions });
    dispatchAndSync({ type: "SET_SESSION_GROUPS", payload: TEST_SEMESTER_FIXTURE.sessionGroups });
    dispatchAndSync({ type: "SET_PAYMENT", payload: TEST_SEMESTER_FIXTURE.paymentPlan });
    dispatchAndSync({ type: "SET_TUITION_RATE_BANDS", payload: TEST_SEMESTER_FIXTURE.tuitionRateBands! });
    dispatchAndSync({ type: "SET_FEE_CONFIG", payload: TEST_SEMESTER_FIXTURE.feeConfig! });
    dispatchAndSync({ type: "SET_DISCOUNTS", payload: TEST_SEMESTER_FIXTURE.discounts });
    dispatchAndSync({ type: "SET_COUPONS", payload: TEST_SEMESTER_FIXTURE.coupons! });
    dispatchAndSync({ type: "SET_REGISTRATION_FORM", payload: TEST_SEMESTER_FIXTURE.registrationForm });
    dispatchAndSync({ type: "SET_CONFIRMATION_EMAIL", payload: TEST_SEMESTER_FIXTURE.confirmationEmail });
    dispatchAndSync({ type: "SET_WAITLIST", payload: TEST_SEMESTER_FIXTURE.waitlist });
  }

  /* ---------------------------- Step Render ------------------------------ */

  const stepRenderers: Record<StepKey, JSX.Element> = {
    details: (
      <DetailsStep
        state={state}
        dispatch={dispatchAndSync}
        onNext={nextStep}
        onRegisterSubmit={registerStepSubmit}
      />
    ),
    sessions: (
      <SessionsStep
        state={state}
        dispatch={dispatchAndSync}
        onNext={nextStep}
        onBack={previousStep}
        isLocked={isLocked}
      />
    ),
    sessionGroups: (
      <SessionsGroupsStep
        state={state}
        dispatch={dispatchAndSync}
        onNext={nextStep}
        onBack={previousStep}
      />
    ),
    payment: (
      <PaymentStep
        state={state}
        dispatch={dispatchAndSync}
        onNext={nextStep}
        onBack={previousStep}
        isLocked={isLocked}
      />
    ),
    discounts: (
      <DiscountsStep
        state={state}
        dispatch={dispatchAndSync}
        onNext={nextStep}
        onBack={previousStep}
        isLocked={isLocked}
      />
    ),
    registrationForm: (
      <RegistrationFormStep
        state={state}
        dispatch={dispatchAndSync}
        onNext={nextStep}
        onBack={previousStep}
        isLocked={isLocked}
        semesterId={state.id}
      />
    ),
    confirmationEmail: (
      <ConfirmationEmailStep
        state={state}
        dispatch={dispatchAndSync}
        onNext={nextStep}
        onBack={previousStep}
        isLocked={isLocked}
      />
    ),
    waitlist: (
      <WaitlistStep
        state={state}
        dispatch={dispatchAndSync}
        onNext={nextStep}
        onBack={previousStep}
        isLocked={isLocked}
        semesterId={state.id}
      />
    ),
    review: (
      <ReviewStep
        state={state}
        onBack={previousStep}
        onPublishNow={async () => {
          const current = stateRef.current;
          const { semesterId } = await persistSemesterDraft(current);
          dispatch({ type: "SET_ID", payload: semesterId });
          persistedSnapshotRef.current = JSON.stringify({
            ...current,
            id: semesterId,
          });
          await publishSemesterNow(semesterId);
          router.push("/admin/semesters");
        }}
        onSaveDraft={async () => {
          const current = stateRef.current;
          const { semesterId } = await persistSemesterDraft(current);
          dispatch({ type: "SET_ID", payload: semesterId });
          persistedSnapshotRef.current = JSON.stringify({
            ...current,
            id: semesterId,
          });
          await saveSemesterDraft(semesterId);
          router.push("/admin/semesters");
        }}
        onSchedule={async (date) => {
          const current = stateRef.current;
          const { semesterId } = await persistSemesterDraft(current);
          dispatch({ type: "SET_ID", payload: semesterId });
          persistedSnapshotRef.current = JSON.stringify({
            ...current,
            id: semesterId,
          });
          await scheduleSemester(semesterId, date);
          router.push("/admin/semesters");
        }}
      />
    ),
  };

  /* ------------------------------ Status --------------------------------- */

  const statusLabel = semesterStatus
    ? semesterStatus.charAt(0).toUpperCase() + semesterStatus.slice(1)
    : mode === "create"
    ? "Draft"
    : "Draft";

  const statusBadge: BadgeStatus =
    (semesterStatus as BadgeStatus) ?? "draft";

  const semesterTitle =
    state.details?.name ||
    (mode === "create" ? "New Semester" : "Edit Semester");

  /* ------------------------------ Render --------------------------------- */

  return (
    // Break out of admin layout's px-8 py-8 and take over the full viewport
    // (left: 52px accounts for the collapsed admin sidebar)
    <div
      className="fixed inset-0 flex"
      style={{ zIndex: 40 }}
    >
      {/* ── Left wizard sidebar ─────────────────────────────────────── */}
      <aside
        className="shrink-0 flex flex-col overflow-y-auto"
        style={{
          width: "var(--admin-sidebar-width)",
          background: "var(--admin-sidebar-bg)",
          borderRight: "1px solid var(--admin-sidebar-border)",
        }}
      >
        <div className="flex flex-col gap-0.5 px-2 py-6">
          {STEPS.map((step, index) => {
            const isActive = index === activeStepIndex;
            return (
              <button
                key={step.key}
                onClick={() => navigateToStep(index)}
                className="flex items-center gap-2 px-2 py-2 rounded-lg text-left w-full transition-colors hover:bg-white/5"
              >
                <span
                  className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
                  style={
                    isActive
                      ? { background: "var(--admin-sidebar-active)", color: "#fff" }
                      : { background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.35)" }
                  }
                >
                  {index + 1}
                </span>
                <span
                  className="text-sm font-medium leading-tight transition-colors"
                  style={
                    isActive
                      ? { color: "#fff" }
                      : { color: "var(--admin-sidebar-text)", opacity: 0.7 }
                  }
                >
                  {step.label}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── Right: main content ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <div
          className="shrink-0 flex items-center justify-between px-6"
          style={{
            height: 52,
            background: "var(--admin-surface)",
            borderBottom: "1px solid var(--admin-border)",
          }}
        >
          <button
            onClick={() => setShowExitModal(true)}
            className="flex items-center gap-1 text-sm transition-colors hover:opacity-80"
            style={{ color: "var(--admin-text-faint)" }}
          >
            <ChevronLeft size={15} strokeWidth={2} />
            Semesters
          </button>

          <div className="flex items-center gap-2">
            <span
              className="text-sm font-semibold"
              style={{ color: "var(--admin-text)" }}
            >
              {semesterTitle}
            </span>
            <Badge status={statusBadge}>{statusLabel}</Badge>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={state.id ? `/preview/semester/${state.id}` : "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm rounded-lg px-3 py-1.5 transition-colors hover:bg-neutral-50"
              style={{
                border: "1px solid var(--admin-border)",
                color: "var(--admin-text-faint)",
              }}
              onClick={(e) => !state.id && e.preventDefault()}
            >
              <Eye size={13} strokeWidth={2} />
              Preview semester
            </Link>

            <button
              onClick={handleSaveDraft}
              disabled={isSaving}
              className="relative inline-flex items-center justify-center text-sm font-medium text-white rounded-lg px-4 py-1.5 transition-colors hover:opacity-90 disabled:opacity-60"
              style={{ background: "var(--admin-sidebar-active)" }}
            >
              <span className={isSaving ? "invisible" : ""}>Save draft</span>
              {isSaving && (
                <span className="absolute inset-0 flex items-center justify-center">Saving…</span>
              )}
            </button>
          </div>
        </div>

        {/* Content area */}
        <div
          className="flex-1 overflow-y-auto p-8"
          style={{ background: "var(--admin-page-bg)" }}
        >
          {/* Step indicator */}
          <p
            className="text-[11px] font-semibold uppercase tracking-widest mb-5"
            style={{ color: "var(--admin-text-faint)" }}
          >
            Step {activeStepIndex + 1} of {STEPS.length}
          </p>

          {/* DEV: Fill test data */}
          {process.env.NODE_ENV === "development" && (
            <div className="mb-6 flex items-center gap-3 rounded-lg border border-dashed border-blue-200 bg-blue-50 px-3 py-2">
              <span className="inline-flex items-center bg-blue-600 text-white text-[10px] font-bold rounded px-1.5 py-0.5 uppercase tracking-wide">
                DEV
              </span>
              <button
                type="button"
                onClick={fillTestData}
                className="text-sm font-medium text-blue-700 hover:text-blue-900 transition-colors"
              >
                Fill test data
              </button>
              <span className="text-xs text-blue-500">
                Populates all {STEPS.length} steps with a complete test semester fixture
              </span>
            </div>
          )}

          {/* Step content */}
          {stepRenderers[activeStepKey]}
        </div>

        {/* Footer navigation */}
        <div
          className="shrink-0 flex items-center justify-between px-6 py-4"
          style={{
            background: "var(--admin-surface)",
            borderTop: "1px solid var(--admin-border)",
          }}
        >
          <span
            className="text-sm"
            style={{ color: "var(--admin-text-faint)" }}
          >
            Step {activeStepIndex + 1} of {STEPS.length} —{" "}
            {STEPS[activeStepIndex].label}
          </span>

          <div className="flex items-center gap-3">
            {activeStepIndex > 0 && (
              <button
                onClick={previousStep}
                className="text-sm rounded-lg px-4 py-2 transition-colors hover:bg-neutral-50"
                style={{
                  border: "1px solid var(--admin-border)",
                  color: "var(--admin-text-faint)",
                }}
              >
                ← Back
              </button>
            )}

            {activeStepIndex < STEPS.length - 1 && (
              <button
                onClick={handleFooterNext}
                disabled={isSaving}
                className="inline-flex items-center gap-2 text-sm font-semibold text-white rounded-xl px-5 py-2.5 transition-colors hover:opacity-90 disabled:opacity-60"
                style={{ background: "var(--admin-sidebar-active)" }}
              >
                Next — {STEPS[activeStepIndex + 1].label} →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Exit confirmation modal ──────────────────────────────────── */}
      {showExitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div
            className="w-full max-w-md rounded-2xl p-8 space-y-5 shadow-xl"
            style={{ background: "var(--admin-surface)" }}
          >
            <div>
              <h2
                className="text-lg font-semibold"
                style={{ color: "var(--admin-text)" }}
              >
                {mode === "create" ? "Save and exit?" : "Save changes and exit?"}
              </h2>
              <p
                className="text-sm mt-1.5"
                style={{ color: "var(--admin-text-muted)" }}
              >
                {mode === "create"
                  ? "Your progress will be saved as a draft. You can continue setting up this semester any time from the Semesters list."
                  : "Your changes will be saved as a draft. This semester will not be published until you complete and publish the edit flow."}
              </p>
            </div>

            <div
              className="rounded-xl px-4 py-3 text-sm"
              style={{
                background: "var(--admin-surface-sub)",
                color: "var(--admin-text-muted)",
                border: "0.5px solid var(--admin-border)",
              }}
            >
              The semester will remain in <strong>Draft</strong> status until
              you publish it from the Review &amp; publish step.
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <button
                onClick={() => setShowExitModal(false)}
                className="px-4 py-2 text-sm rounded-lg transition-colors hover:bg-neutral-100"
                style={{ color: "var(--admin-text-muted)" }}
              >
                Keep editing
              </button>
              <button
                onClick={handleExitConfirm}
                disabled={isSaving}
                className="px-5 py-2 text-sm font-medium text-white rounded-lg transition-colors hover:opacity-90 disabled:opacity-60"
                style={{ background: "var(--admin-sidebar-active)" }}
              >
                {isSaving ? "Saving…" : "Save draft & exit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
