"use client";

import { useReducer, useState } from "react";
import DetailsStep from "./new/steps/DetailsStep";
import SessionsStep from "./new/steps/SessionsStep";
import PaymentStep from "./new/steps/PaymentStep";
import DiscountsStep from "./new/steps/DiscountsStep";
import ReviewStep from "./new/steps/ReviewStep";
import { semesterReducer } from "./WizardReducer";
import { SemesterDraft } from "@/types";

const steps = ["Details", "Sessions", "Payment", "Discounts", "Review"];

export default function SemesterWizard() {
  const [step, setStep] = useState(0);
  const [state, dispatch] = useReducer(semesterReducer, {} as SemesterDraft);

  function next() {
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Stepper step={step} steps={steps} />

      {step === 0 && <DetailsStep state={state} dispatch={dispatch} />}
      {step === 1 && <SessionsStep state={state} dispatch={dispatch} />}
      {step === 2 && <PaymentStep state={state} dispatch={dispatch} />}
      {step === 3 && <DiscountsStep state={state} dispatch={dispatch} />}
      {step === 4 && <ReviewStep state={state} />}

      <div className="flex justify-between mt-6">
        <button onClick={back} disabled={step === 0}>
          Back
        </button>
        <button onClick={next}>{step === 4 ? "Publish" : "Next"}</button>
      </div>
    </div>
  );
}
