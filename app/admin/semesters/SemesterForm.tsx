import { SemesterAction, SemesterDraft } from "@/types";
import { useRouter, useSearchParams } from "next/navigation";
import { JSX, useReducer } from "react";
import DetailsStep from "./steps/DetailsStep";
import SessionsStep from "./steps/SessionsStep";
import PaymentStep from "./steps/PaymentStep";
import DiscountsStep from "./steps/DiscountsStep";
import ReviewStep from "./steps/ReviewStep";
import SessionsGroupsStep from "./steps/SessionGroupsStep";
import {
  publishSemesterNow,
  saveSemesterDraft,
  scheduleSemester,
} from "./actions/semesterLifecycle";
import { persistSemesterDraft } from "./actions/persistSemesterDraft";

function semesterReducer(
  state: SemesterDraft,
  action: SemesterAction,
): SemesterDraft {
  console.group("🧠 semesterReducer");
  console.log("Previous State:", state);
  console.log("Action:", action);

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

    case "RESET":
      nextState = {};
      break;

    default:
      nextState = state;
  }

  console.log("Next State:", nextState);
  console.groupEnd();

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
  { key: "review", label: "Review" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

function isStepKey(value: string | null): value is StepKey {
  return STEPS.some((step) => step.key === value);
}

type SemesterFormProps = {
  mode: "create" | "edit";
  basePath: string; // "/admin/semesters/new" or "/admin/semesters/123"
  initialState?: SemesterDraft;
};

export default function SemesterForm({
  mode,
  basePath,
  initialState,
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

  /* ----------------------------- Navigation ------------------------------ */

  function navigateToStep(index: number) {
    const boundedIndex = Math.min(Math.max(index, 0), STEPS.length - 1);

    console.group("➡️ Step Navigation");
    console.log("Current Step:", activeStepKey);
    console.log("Next Step Index:", boundedIndex);
    console.log("Next Step Key:", STEPS[boundedIndex].key);
    console.groupEnd();

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
      />
    ),
    discounts: (
      <DiscountsStep
        state={state}
        dispatch={dispatch}
        onNext={nextStep}
        onBack={previousStep}
      />
    ),
    review: (
      <ReviewStep
        state={state}
        mode={mode}
        onBack={previousStep}
        onPublishNow={async () => {
          const { semesterId } = await persistSemesterDraft(state);
          dispatch({ type: "SET_ID", payload: semesterId });
          await publishSemesterNow(semesterId);
          router.push("/admin/semesters");
        }}
        onSaveDraft={async () => {
          const { semesterId } = await persistSemesterDraft(state);
          dispatch({ type: "SET_ID", payload: semesterId });
          await saveSemesterDraft(semesterId);
          router.push("/admin/semesters");
        }}
        onSchedule={async (date) => {
          const { semesterId } = await persistSemesterDraft(state);
          dispatch({ type: "SET_ID", payload: semesterId });
          await scheduleSemester(semesterId, date);
          router.push("/admin/semesters");
        }}
      />
    ),
  };

  return (
    <>
      <div className="mx-auto max-w-5xl p-6 text-slate-700">
        <h1 className="mb-6 text-2xl font-semibold">
          {mode === "create" ? "Create New" : "Edit"} Semester
        </h1>
        {/* Step Indicator */}
        <div className="mb-8 flex gap-4">
          {STEPS.map((step, index) => (
            <div
              key={step.key}
              className={`text-sm ${
                index === activeStepIndex
                  ? "font-semibold underline"
                  : "text-gray-400"
              }`}
            >
              {index + 1}. {step.label}
            </div>
          ))}
        </div>
        {/* Step Content */}
        {stepRenderers[activeStepKey]}
      </div>
    </>
  );
}
