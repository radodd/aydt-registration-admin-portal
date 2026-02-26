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
  { key: "details", label: "Details" },
  { key: "sessions", label: "Sessions" },
  { key: "sessionGroups", label: "Session Groups" },
  { key: "payment", label: "Payment" },
  { key: "discounts", label: "Discounts" },
  { key: "registrationForm", label: "Registration Form" },
  { key: "confirmationEmail", label: "Confirmation Email" },
  { key: "waitlist", label: "Waitlist" },
  { key: "review", label: "Review" },
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
};

export default function SemesterForm({
  mode,
  basePath,
  initialState,
  isLocked = false,
}: SemesterFormProps) {
  const [state, dispatch] = useReducer(
    semesterReducer,
    initialState ?? ({} as SemesterDraft),
  );

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

    setIsSaving(true);
    try {
      const { semesterId } = await persistSemesterDraft(state);
      if (!state.id) dispatch({ type: "SET_ID", payload: semesterId });
      persistedSnapshotRef.current = JSON.stringify({
        ...state,
        id: state.id ?? semesterId,
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

  /* ---------------------------- Step Render ------------------------------ */

  const stepRenderers: Record<StepKey, JSX.Element> = {
    details: (
      <DetailsStep state={state} dispatch={dispatch} onNext={nextStep} />
    ),
    sessions: (
      <SessionsStep
        state={state}
        dispatch={dispatch}
        onNext={nextStep}
        onBack={previousStep}
        isLocked={isLocked}
      />
    ),
    sessionGroups: (
      <SessionsGroupsStep
        state={state}
        dispatch={dispatch}
        onNext={nextStep}
        onBack={previousStep}
      />
    ),
    payment: (
      <PaymentStep
        state={state}
        dispatch={dispatch}
        onNext={nextStep}
        onBack={previousStep}
        isLocked={isLocked}
      />
    ),
    discounts: (
      <DiscountsStep
        state={state}
        dispatch={dispatch}
        onNext={nextStep}
        onBack={previousStep}
        isLocked={isLocked}
      />
    ),
    registrationForm: (
      <RegistrationFormStep
        state={state}
        dispatch={dispatch}
        onNext={nextStep}
        onBack={previousStep}
        isLocked={isLocked}
        semesterId={state.id}
      />
    ),
    confirmationEmail: (
      <ConfirmationEmailStep
        state={state}
        dispatch={dispatch}
        onNext={nextStep}
        onBack={previousStep}
        isLocked={isLocked}
      />
    ),
    waitlist: (
      <WaitlistStep
        state={state}
        dispatch={dispatch}
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
          const { semesterId } = await persistSemesterDraft(state);
          dispatch({ type: "SET_ID", payload: semesterId });
          persistedSnapshotRef.current = JSON.stringify({
            ...state,
            id: semesterId,
          });
          await publishSemesterNow(semesterId);
          router.push("/admin/semesters");
        }}
        onSaveDraft={async () => {
          const { semesterId } = await persistSemesterDraft(state);
          dispatch({ type: "SET_ID", payload: semesterId });
          persistedSnapshotRef.current = JSON.stringify({
            ...state,
            id: semesterId,
          });
          await saveSemesterDraft(semesterId);
          router.push("/admin/semesters");
        }}
        onSchedule={async (date) => {
          const { semesterId } = await persistSemesterDraft(state);
          dispatch({ type: "SET_ID", payload: semesterId });
          persistedSnapshotRef.current = JSON.stringify({
            ...state,
            id: semesterId,
          });
          await scheduleSemester(semesterId, date);
          router.push("/admin/semesters");
        }}
      />
    ),
  };

  return (
    <>
      <div className="relative mx-auto max-w-5xl p-6 text-slate-700">
        <h1 className="mb-4 text-2xl font-semibold">
          {mode === "create" ? "Create New" : "Edit"} Semester
        </h1>

        {/* Step Indicator */}
        <div className="mb-8 flex flex-wrap gap-2">
          {STEPS.map((step, index) => (
            <button
              key={step.key}
              onClick={() => navigateToStep(index)}
              className={`text-sm px-3 py-1 rounded-lg transition-colors ${
                index === activeStepIndex
                  ? "font-semibold text-indigo-700 bg-indigo-50"
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
              }`}
            >
              {index + 1}. {step.label}
            </button>
          ))}
        </div>

        {/* Step Content */}
        {stepRenderers[activeStepKey]}

        {/* Unsaved changes toast — fixed, does not affect layout */}
        {isDirty && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl shadow-lg animate-fade-in">
            <span className="text-amber-700 text-sm font-medium">
              {isSaving ? "Saving…" : "Unsaved changes"}
            </span>
            {!isSaving && (
              <button
                onClick={() => navigateToStep(activeStepIndex)}
                className="text-sm text-amber-700 font-semibold underline"
              >
                Save Now
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
