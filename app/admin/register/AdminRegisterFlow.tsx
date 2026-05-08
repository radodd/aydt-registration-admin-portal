"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle, ExternalLink } from "lucide-react";
import DancerStep, { type DancerStepResult } from "./steps/DancerStep";
import ClassesStep, { type ClassesStepResult, type ClassInfo } from "./steps/ClassesStep";
import QuestionsStep from "./steps/QuestionsStep";
import CheckoutStep from "./steps/CheckoutStep";
import type { NewDancerInput } from "./actions/createAdminRegistration";

type Props = {
  initialSemesterId: string;
  initialSemesterName: string;
  initialDancer?: {
    id: string;
    name: string;
    familyId: string | null;
    parentUserId: string | null;
  } | null;
};

type State = {
  step: 1 | 2 | 3 | 4;
  // Dancer
  dancerId: string | null;
  dancerName: string;
  familyId: string | null;
  parentUserId: string | null;
  isNewDancer: boolean;
  newDancer: NewDancerInput | null;
  // Classes
  semesterId: string;
  semesterName: string;
  scheduleIds: string[];
  sessionIds: string[];
  classInfos: ClassInfo[];
  priceOverride: number | null;
  // Form answers
  formData: Record<string, unknown>;
};

const STEPS = [
  { n: 1, label: "Dancer" },
  { n: 2, label: "Classes" },
  { n: 3, label: "Questions" },
  { n: 4, label: "Checkout" },
];

export default function AdminRegisterFlow({
  initialSemesterId,
  initialSemesterName,
  initialDancer,
}: Props) {
  const [state, setState] = useState<State>({
    step: initialDancer ? 2 : 1,
    dancerId: initialDancer?.id ?? null,
    dancerName: initialDancer?.name ?? "",
    familyId: initialDancer?.familyId ?? null,
    parentUserId: initialDancer?.parentUserId ?? null,
    isNewDancer: false,
    newDancer: null,
    semesterId: initialSemesterId,
    semesterName: initialSemesterName,
    scheduleIds: [],
    sessionIds: [],
    classInfos: [],
    priceOverride: null,
    formData: {},
  });

  const [success, setSuccess] = useState<{ batchId: string; dancerId: string } | null>(null);

  function handleDancerNext(result: DancerStepResult) {
    setState((s) => ({
      ...s,
      step: 2,
      dancerId: result.dancerId,
      dancerName: result.dancerName,
      familyId: result.familyId,
      parentUserId: result.parentUserId,
      isNewDancer: result.isNewDancer,
      newDancer: result.isNewDancer && result.newDancer
        ? {
            firstName: result.newDancer.firstName,
            lastName: result.newDancer.lastName,
            birthDate: result.newDancer.birthDate,
            gender: result.newDancer.gender,
            grade: result.newDancer.grade,
            familyId: result.newDancer.linkToFamilyId ?? null,
            newFamilyName: result.newDancer.newFamilyName ?? null,
          }
        : null,
    }));
  }

  function handleClassesNext(result: ClassesStepResult) {
    setState((s) => ({
      ...s,
      step: 3,
      semesterId: result.semesterId,
      semesterName: result.semesterName,
      scheduleIds: result.scheduleIds,
      sessionIds: result.sessionIds,
      classInfos: result.classInfos,
      priceOverride: result.priceOverride ?? null,
    }));
  }

  function handleQuestionsNext(formData: Record<string, unknown>) {
    setState((s) => ({ ...s, step: 4, formData }));
  }

  function handleSuccess(batchId: string, dancerId: string) {
    setSuccess({ batchId, dancerId });
  }

  function handleStartOver() {
    setState({
      step: 1,
      dancerId: null,
      dancerName: "",
      familyId: null,
      parentUserId: null,
      isNewDancer: false,
      newDancer: null,
      semesterId: initialSemesterId,
      semesterName: initialSemesterName,
      scheduleIds: [],
      sessionIds: [],
      classInfos: [],
      priceOverride: null,
      formData: {},
    });
    setSuccess(null);
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <div className="flex justify-center">
          <CheckCircle className="w-14 h-14 text-green-500" />
        </div>
        <h2 className="text-xl font-semibold text-[#201D18]">Registration complete</h2>
        <p className="text-sm text-[#736D65]">
          {state.dancerName} has been registered for {state.semesterName}.
        </p>
        <div className="flex flex-col gap-2 pt-4">
          <Link
            href={`/admin/dancers/${success.dancerId}`}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#8E2A23] text-white rounded-xl text-sm font-medium hover:bg-[#7A2420] transition"
          >
            View dancer profile
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          <Link
            href={`/admin/payments`}
            className="flex items-center justify-center gap-2 px-4 py-2.5 border border-[#DDD9D2] text-[#736D65] rounded-xl text-sm hover:bg-[#F7F5F2] transition"
          >
            Go to payment dashboard
          </Link>
          <button
            onClick={handleStartOver}
            className="text-sm text-[#9E9890] hover:text-[#736D65] mt-1"
          >
            Register another dancer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <StepIndicator currentStep={state.step} />

      {/* Step content */}
      {state.step === 1 && <DancerStep onNext={handleDancerNext} />}

      {state.step === 2 && (
        <ClassesStep
          dancerName={state.dancerName}
          dancerId={state.dancerId}
          familyId={state.familyId}
          isNewDancer={state.isNewDancer}
          initialSemesterId={state.semesterId}
          initialSemesterName={state.semesterName}
          initialScheduleIds={state.scheduleIds}
          initialSessionIds={state.sessionIds}
          onNext={handleClassesNext}
          onBack={() => setState((s) => ({ ...s, step: 1 }))}
        />
      )}

      {state.step === 3 && (
        <QuestionsStep
          semesterId={state.semesterId}
          semesterName={state.semesterName}
          sessionIds={state.sessionIds}
          dancerName={state.dancerName}
          initialFormData={state.formData}
          onNext={handleQuestionsNext}
          onBack={() => setState((s) => ({ ...s, step: 2 }))}
        />
      )}

      {state.step === 4 && (
        <CheckoutStep
          dancerId={state.dancerId}
          dancerName={state.dancerName}
          familyId={state.familyId}
          parentUserId={state.parentUserId}
          isNewDancer={state.isNewDancer}
          newDancer={state.newDancer}
          semesterId={state.semesterId}
          semesterName={state.semesterName}
          scheduleIds={state.scheduleIds}
          sessionIds={state.sessionIds}
          classInfos={state.classInfos}
          initialPriceOverride={state.priceOverride}
          formData={state.formData}
          onBack={() => setState((s) => ({ ...s, step: 3 }))}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((s, i) => {
        const isDone = s.n < currentStep;
        const isActive = s.n === currentStep;
        return (
          <div key={s.n} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition ${
                  isDone
                    ? "bg-[#8E2A23] text-white"
                    : isActive
                    ? "bg-[#8E2A23] text-white ring-4 ring-[#8E2A23]/10"
                    : "bg-[#F7F5F2] text-[#9E9890]"
                }`}
              >
                {isDone ? <CheckCircle className="w-4 h-4" /> : s.n}
              </div>
              <span
                className={`text-sm font-medium hidden sm:block ${
                  isActive ? "text-[#201D18]" : isDone ? "text-[#736D65]" : "text-[#9E9890]"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`w-8 sm:w-16 h-px mx-2 ${
                  isDone ? "bg-[#C8A09D]" : "bg-[#DDD9D2]"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
