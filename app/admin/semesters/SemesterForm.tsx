/* -------------------------------------------------------------------------- */
/* Reducer                                                                    */
/* -------------------------------------------------------------------------- */

import { getDiscounts } from "@/queries/admin";
import { Discount, SemesterAction, SemesterDraft } from "@/types";
import { useRouter, useSearchParams } from "next/navigation";
import { JSX, useEffect, useReducer, useState } from "react";
import DetailsStep from "./steps/DetailsStep";
import SessionsStep from "./steps/SessionsStep";
import PaymentStep from "./steps/PaymentStep";
import DiscountsStep from "./steps/DiscountsStep";
import ReviewStep from "./steps/ReviewStep";
import { publishSemester } from "./actions/publishSemester";

function semesterReducer(
  state: SemesterDraft,
  action: SemesterAction,
): SemesterDraft {
  switch (action.type) {
    case "SET_ID":
      return { ...state, id: action.payload };
    case "SET_DETAILS":
      return { ...state, details: action.payload };

    case "SET_SESSIONS":
      return { ...state, sessions: action.payload };

    case "SET_PAYMENT":
      return { ...state, paymentPlan: action.payload };

    case "SET_DISCOUNTS":
      return { ...state, discounts: action.payload };

    case "RESET":
      return {};

    default:
      return state;
  }
}

/* -------------------------------------------------------------------------- */
/* Step Configuration                                                         */
/* -------------------------------------------------------------------------- */

const STEPS = [
  { key: "details", label: "Details" },
  { key: "sessions", label: "Sessions" },
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
  onFinalSubmit: (state: SemesterDraft) => Promise<void>;
};

export default function SemesterForm({
  mode,
  basePath,
  initialState,
  onFinalSubmit,
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

    router.push(`${basePath}?step=${STEPS[boundedIndex].key}`);
  }

  function nextStep() {
    navigateToStep(activeStepIndex + 1);
  }

  function previousStep() {
    navigateToStep(activeStepIndex - 1);
  }

  /* ----------------------------- Discount Loading ------------------------------ */

  const [allDiscounts, setAllDiscounts] = useState<Discount[]>([]);

  useEffect(() => {
    async function load() {
      const data = await getDiscounts(); // your DB query
      setAllDiscounts(data);
    }

    load();
  }, []);

  /* ------------------------------ Publish -------------------------------- */

  //  async function handlePublish() {
  //   console.log("[Publish] Attempt started");
  //   console.log("[Publish] Current draft state:", state);

  //   if (!state.id) {
  //     console.error("[Publish] Aborted — state.id is missing");
  //     alert("Cannot publish: Semester ID is missing.");
  //     return;
  //   }

  //   try {
  //     console.log("[Publish] Calling publishSemester with ID:", state.id);

  //     const result = await publishSemester(state.id);

  //     console.log("[Publish] publishSemester resolved:", result);

  //     console.log("[Publish] Redirecting to /admin/semesters");
  //     router.push("/admin/semesters");

  //     console.log("[Publish] Resetting reducer state");
  //     dispatch({ type: "RESET" });

  //   // eslint-disable-next-line @typescript-eslint/no-explicit-any
  //   } catch (error: any) {
  //     console.error("[Publish] Failed:", error);
  //     alert(error?.message ?? "Unexpected error during publish.");
  //   }
  // }

  async function handleFinalSubmit() {
    await onFinalSubmit(state);
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
        allDiscounts={allDiscounts}
        onBack={previousStep}
        onPublish={handleFinalSubmit}
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
