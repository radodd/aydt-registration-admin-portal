"use client";

import { useReducer, useState } from "react";

import DetailsStep from "./steps/DetailsStep";
import SessionsStep from "./steps/SessionsStep";
import PaymentStep from "./steps/PaymentStep";
import DiscountsStep from "./steps/DiscountsStep";
import ReviewStep from "./steps/ReviewStep";
import { useRouter, useSearchParams } from "next/navigation";

// ----------------------------------
// Types
// ----------------------------------

type SemesterDraft = {
  details?: {
    name: string;
    trackingMode: boolean;
    capacityWarningThreshold?: number | null;
    publishAt: Date;
  };

  sessions?: {
    sessionIds: string[];
    tagsBySession: Record<string, string[]>;
  };

  paymentPlan?: {
    type: "pay_in_full" | "deposit_flat" | "deposit_percent" | "installments";
    depositAmount?: number;
    depositPercent?: number;
    installmentCount?: number | null;
    dueDate: string;
  };

  discounts?: {
    semesterDiscountIds: string[];
    sessionDiscounts: Record<string, string[]>;
  };
};

// ----------------------------------
// Reducer
// ----------------------------------

function semesterReducer(
  state: SemesterDraft,
  action: { type: string; payload: any },
): SemesterDraft {
  switch (action.type) {
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

// ----------------------------------
// Page Component
// ----------------------------------

const STEPS = ["details", "sessions", "payment", "discounts", "review"];
type StepKey = (typeof STEPS)[number];

const STEP_INDEX: Record<StepKey, number> = {
  details: 0,
  sessions: 1,
  payment: 2,
  discounts: 3,
  review: 4,
};
const STEP_LABELS: Record<StepKey, string> = {
  details: "Details",
  sessions: "Sessions",
  payment: "Payment",
  discounts: "Discounts",
  review: "Review",
};

export default function NewSemesterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stepParam = searchParams.get("step") as StepKey | null;
  const stepKey: StepKey =
    stepParam && stepParam in STEP_INDEX ? stepParam : "details";
  const step = STEP_INDEX[stepKey];
  const [state, dispatch] = useReducer(semesterReducer, {});

  function goToStep(index: number) {
    const key = STEPS[index];
    router.push(`/admin/semesters/new?step=${key}`);
  }

  function next() {
    goToStep(Math.min(step + 1, STEPS.length - 1));
  }

  function back() {
    goToStep(Math.max(step - 1, 0));
  }

  async function publish() {
    // 🔐 Server Action will live here
    // await createSemester(state)

    console.log("Publishing semester:", state);

    alert("Semester published (stub)");
    dispatch({ type: "RESET" });
    router.push("/admin/semesters/new?step=details");
  }

  return (
    <div className="max-w-5xl mx-auto p-6 text-slate-700">
      <h1 className="text-2xl font-semibold mb-6">Create New Semesters</h1>

      {/* Step Indicator */}
      <div className="flex gap-4 mb-8">
        {STEPS.map((key, index) => (
          <div
            key={key}
            className={`text-sm ${
              index === step ? "font-semibold underline" : "text-gray-400"
            }`}
          >
            {index + 1}. {STEP_LABELS[key]}
          </div>
        ))}
      </div>

      {/* Step Content */}
      {step === 0 && (
        <DetailsStep state={state} dispatch={dispatch} onNext={next} />
      )}

      {step === 1 && (
        <SessionsStep
          state={state}
          dispatch={dispatch}
          onNext={next}
          onBack={back}
        />
      )}

      {step === 2 && (
        <PaymentStep
          state={state}
          dispatch={dispatch}
          onNext={next}
          onBack={back}
        />
      )}

      {step === 3 && (
        <DiscountsStep
          state={state}
          dispatch={dispatch}
          onNext={next}
          onBack={back}
        />
      )}

      {step === 4 && (
        <ReviewStep state={state} onBack={back} onPublish={publish} />
      )}
    </div>
  );
}
