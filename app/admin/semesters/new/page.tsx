"use client";

import { JSX, useEffect, useReducer, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Discount, SemesterAction, SemesterDraft } from "@/types";

import DetailsStep from "./steps/DetailsStep";
import SessionsStep from "./steps/SessionsStep";
import PaymentStep from "./steps/PaymentStep";
import DiscountsStep from "./steps/DiscountsStep";
import ReviewStep from "./steps/ReviewStep";
import { publishSemester } from "../actions/publishSemester";
import { getDiscounts } from "@/queries/admin";

/* -------------------------------------------------------------------------- */
/* Reducer                                                                    */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Page Component                                                             */
/* -------------------------------------------------------------------------- */

export default function NewSemesterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const stepParam = searchParams.get("step");
  const activeStepKey: StepKey = isStepKey(stepParam) ? stepParam : "details";

  const activeStepIndex = STEPS.findIndex((step) => step.key === activeStepKey);

  const [state, dispatch] = useReducer(semesterReducer, {});

  /* ----------------------------- Navigation ------------------------------ */

  function navigateToStep(index: number) {
    const boundedIndex = Math.min(Math.max(index, 0), STEPS.length - 1);

    router.push(`/admin/semesters/new?step=${STEPS[boundedIndex].key}`);
  }

  function nextStep() {
    navigateToStep(activeStepIndex + 1);
  }

  function previousStep() {
    navigateToStep(activeStepIndex - 1);
  }

  /* ------------------------------ Publish -------------------------------- */

  async function handlePublish() {
    try {
      await publishSemester(state.id!);
      router.push("/admin/semesters");
    } catch (err) {
      alert(err.message);
    }

    console.log("Publishing semester:", state);

    dispatch({ type: "RESET" });
    router.push("/admin/semesters/new?step=details");
  }

  const [allDiscounts, setAllDiscounts] = useState<Discount[]>([]);

  useEffect(() => {
    async function load() {
      const data = await getDiscounts(); // your DB query
      setAllDiscounts(data);
    }

    load();
  }, []);

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
        allDiscounts={allDiscounts}
        onBack={previousStep}
        onPublish={handlePublish}
      />
    ),
  };

  /* ---------------------------------------------------------------------- */

  return (
    <div className="mx-auto max-w-5xl p-6 text-slate-700">
      <h1 className="mb-6 text-2xl font-semibold">Create New Semester</h1>

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
  );
}
