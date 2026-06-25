"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CheckCircle, ExternalLink, User, BookOpen } from "lucide-react";
import DancerStep, { type DancerStepResult } from "./steps/DancerStep";
import ClassesStep, { type ClassesStepResult, type ClassInfo } from "./steps/ClassesStep";
import QuestionsStep from "./steps/QuestionsStep";
import CheckoutStep from "./steps/CheckoutStep";
import { computePricingQuote } from "@/app/actions/computePricingQuote";
import type { PricingQuote } from "@/types";
import type { NewDancerInput } from "./actions/createAdminRegistration";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

type Props = {
  initialSemesterId: string;
  initialSemesterName: string;
  initialDancer?: {
    id: string;
    name: string;
    familyId: string | null;
    parentUserId: string | null;
  } | null;
  /**
   * Meeting-plan #25: brand-new dancer carried from a waitlist entry (no dancer
   * row yet). Mutually exclusive with initialDancer.
   */
  initialNewDancer?: { input: NewDancerInput; name: string } | null;
  /** Meeting-plan #25: pre-selected class targets carried from a waitlist entry. */
  initialScheduleIds?: string[];
  initialSessionIds?: string[];
  /** Tiered classes: pre-selected `class_tiers.id` keyed by classId. */
  initialTierIdByClass?: Record<string, string>;
  /** Pre-filled form answers carried from the waitlist entry. */
  initialFormData?: Record<string, unknown>;
  /** When set, mark this waitlist entry "registered" on successful submit (#25). */
  waitlistEntryId?: string | null;
  /** Super-admins can set up auto-charged installment plans + override partial payments (#7). */
  isSuperAdmin: boolean;
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
  /** Phase 3a: classTierId per selected schedule (tiered classes only). */
  classTierIdsBySchedule: Record<string, string>;
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
  initialNewDancer,
  initialScheduleIds = [],
  initialSessionIds = [],
  initialTierIdByClass = {},
  initialFormData = {},
  waitlistEntryId = null,
  isSuperAdmin,
}: Props) {
  // A dancer carried in (existing or brand-new) means the Dancer step is already
  // answered — open on Classes, the start of the actionable flow.
  const hasPrefilledDancer = !!(initialDancer || initialNewDancer);
  const [state, setState] = useState<State>({
    step: hasPrefilledDancer ? 2 : 1,
    dancerId: initialDancer?.id ?? null,
    dancerName: initialDancer?.name ?? initialNewDancer?.name ?? "",
    familyId: initialDancer?.familyId ?? initialNewDancer?.input.familyId ?? null,
    parentUserId: initialDancer?.parentUserId ?? null,
    isNewDancer: !!initialNewDancer,
    newDancer: initialNewDancer?.input ?? null,
    semesterId: initialSemesterId,
    semesterName: initialSemesterName,
    scheduleIds: initialScheduleIds,
    sessionIds: initialSessionIds,
    classInfos: [],
    priceOverride: null,
    classTierIdsBySchedule: {},
    formData: initialFormData,
  });

  const [success, setSuccess] = useState<{ batchId: string; dancerId: string } | null>(null);

  // Base (pay-in-full) quote for the summary sidebar, recomputed whenever the
  // selected classes change. The Checkout step stays the source of truth for the
  // actual charge (coupons, adjustments, overrides) — this is a read-only preview
  // so the admin can see class fees while stepping through the flow.
  const [quote, setQuote] = useState<PricingQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  useEffect(() => {
    if (!state.semesterId || state.scheduleIds.length === 0) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setQuoteLoading(true);
    computePricingQuote({
      semesterId: state.semesterId,
      familyId: state.familyId ?? undefined,
      enrollments: [
        {
          dancerId: state.dancerId ?? NIL_UUID,
          dancerName: state.isNewDancer ? state.dancerName : undefined,
          scheduleIds: state.scheduleIds,
          classTierIdsBySchedule: state.classTierIdsBySchedule,
        },
      ],
      paymentPlanType: "pay_in_full",
    })
      .then((q) => { if (!cancelled) setQuote(q); })
      .catch(() => { if (!cancelled) setQuote(null); })
      .finally(() => { if (!cancelled) setQuoteLoading(false); });
    return () => { cancelled = true; };
  }, [
    state.semesterId,
    state.familyId,
    state.dancerId,
    state.isNewDancer,
    state.dancerName,
    state.scheduleIds,
    state.classTierIdsBySchedule,
  ]);

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
      classTierIdsBySchedule: result.classTierIdsBySchedule ?? {},
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
      classTierIdsBySchedule: {},
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

  // The Classes (2) and Checkout (4) steps have their own sidebar column; they
  // host the dancer card there so every summary card stacks in a single column.
  // Other steps use the flow-level sidebar.
  const showFlowSidebar = state.step !== 2 && state.step !== 4;
  const dancerCard = (
    <DancerSummaryCard
      dancerName={state.dancerName}
      isNewDancer={state.isNewDancer}
      newDancer={state.newDancer}
    />
  );

  return (
    <div className={showFlowSidebar ? "lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8 lg:items-start" : ""}>
      <div className="space-y-6 min-w-0">
      {/* Step indicator */}
      <StepIndicator currentStep={state.step} />

      {/* Step content */}
      {state.step === 1 && (
        <DancerStep
          onNext={handleDancerNext}
          initialExisting={
            !state.isNewDancer && state.dancerId
              ? {
                  id: state.dancerId,
                  name: state.dancerName,
                  familyId: state.familyId,
                  parentUserId: state.parentUserId,
                }
              : null
          }
          initialNew={
            state.isNewDancer && state.newDancer
              ? {
                  firstName: state.newDancer.firstName,
                  lastName: state.newDancer.lastName,
                  birthDate: state.newDancer.birthDate,
                  gender: state.newDancer.gender,
                  grade: state.newDancer.grade,
                  familyId: state.newDancer.familyId ?? null,
                  newFamilyName: state.newDancer.newFamilyName ?? null,
                }
              : null
          }
        />
      )}

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
          initialTierIdByClass={initialTierIdByClass}
          onNext={handleClassesNext}
          onBack={() => setState((s) => ({ ...s, step: 1 }))}
          sidebarTop={dancerCard}
        />
      )}

      {state.step === 3 && (
        <QuestionsStep
          semesterId={state.semesterId}
          semesterName={state.semesterName}
          sessionIds={state.sessionIds}
          dancerName={state.dancerName}
          familyId={state.familyId}
          dancerId={state.dancerId}
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
          classTierIdsBySchedule={state.classTierIdsBySchedule}
          formData={state.formData}
          isSuperAdmin={isSuperAdmin}
          waitlistEntryId={waitlistEntryId}
          onBack={() => setState((s) => ({ ...s, step: 3 }))}
          onSuccess={handleSuccess}
          sidebarTop={dancerCard}
        />
      )}
      </div>

      {/* Summary sidebar — who we're registering + class fees/pricing.
          Hidden on the Classes step, which hosts these cards in its own column. */}
      {showFlowSidebar && (
        <aside className="hidden lg:block">
          <div className="sticky top-6">
            <RegistrationSummary
              dancerName={state.dancerName}
              isNewDancer={state.isNewDancer}
              newDancer={state.newDancer}
              semesterName={state.semesterName}
              classInfos={state.classInfos}
              quote={quote}
              quoteLoading={quoteLoading}
            />
          </div>
        </aside>
      )}
    </div>
  );
}

function fmtTime(t: string | null): string {
  if (!t) return "";
  const [hStr, m] = t.split(":");
  const h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return "";
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m ?? "00"} ${period}`;
}

export function DancerSummaryCard({
  dancerName,
  isNewDancer,
  newDancer,
}: {
  dancerName: string;
  isNewDancer: boolean;
  newDancer: NewDancerInput | null;
}) {
  return (
    <div className="rounded-xl border border-[#DDD9D2] bg-white p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <User className="w-3.5 h-3.5 text-primary-600" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#736D65]">Registering</h3>
      </div>
      {dancerName ? (
        <>
          <p className="text-sm font-semibold text-[#201D18]">{dancerName}</p>
          <span
            className={`inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
              isNewDancer ? "bg-amber-50 text-amber-700" : "bg-[#EDE9E4] text-[#736D65]"
            }`}
          >
            {isNewDancer ? "New dancer" : "Existing dancer"}
          </span>
          {isNewDancer && newDancer && (
            <dl className="mt-3 space-y-1 text-xs">
              {newDancer.grade && (
                <div className="flex justify-between gap-2">
                  <dt className="text-[#9E9890]">Grade</dt>
                  <dd className="text-[#201D18] text-right">{newDancer.grade}</dd>
                </div>
              )}
              {newDancer.gender && (
                <div className="flex justify-between gap-2">
                  <dt className="text-[#9E9890]">Gender</dt>
                  <dd className="text-[#201D18] text-right capitalize">{newDancer.gender}</dd>
                </div>
              )}
              {newDancer.birthDate && (
                <div className="flex justify-between gap-2">
                  <dt className="text-[#9E9890]">Birth date</dt>
                  <dd className="text-[#201D18] text-right">{newDancer.birthDate}</dd>
                </div>
              )}
            </dl>
          )}
        </>
      ) : (
        <p className="text-sm text-[#9E9890]">No dancer selected yet</p>
      )}
    </div>
  );
}

function PricingSummaryCard({
  semesterName,
  classInfos,
  quote,
  quoteLoading,
}: {
  semesterName: string;
  classInfos: ClassInfo[];
  quote: PricingQuote | null;
  quoteLoading: boolean;
}) {
  const fmt$ = (n: number) => `$${Math.abs(n).toFixed(2)}`;
  return (
    <div className="rounded-xl border border-[#DDD9D2] bg-white p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <BookOpen className="w-3.5 h-3.5 text-primary-600" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#736D65]">Registration summary</h3>
      </div>
      {semesterName && <p className="text-xs text-[#9E9890] mb-2">{semesterName}</p>}

      {classInfos.length > 0 ? (
        <ul className="space-y-2 mb-3">
          {classInfos.map((c) => (
            <li key={c.scheduleId}>
              <p className="text-sm font-medium text-[#201D18] leading-snug">{c.className}</p>
              <p className="text-xs text-[#9E9890]">
                {[c.discipline, c.dayOfWeek, fmtTime(c.startTime)].filter(Boolean).join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[#9E9890] mb-3">Class details appear as you proceed.</p>
      )}

      <div className="border-t border-[#EDE9E4] pt-3">
        {quoteLoading ? (
          <p className="text-xs text-[#9E9890]">Calculating fees…</p>
        ) : quote ? (
          <>
            <ul className="space-y-1.5 mb-2">
              {quote.lineItems.map((li, i) => (
                <li key={i} className="flex justify-between gap-2 text-xs">
                  <span className="text-[#736D65]">{li.label}</span>
                  <span className={li.amount < 0 ? "text-emerald-600 shrink-0" : "text-[#201D18] shrink-0"}>
                    {li.amount < 0 ? "−" : ""}{fmt$(li.amount)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between items-baseline border-t border-[#EDE9E4] pt-2">
              <span className="text-sm font-semibold text-[#201D18]">Total</span>
              <span className="text-sm font-semibold text-primary-600">{fmt$(quote.grandTotal)}</span>
            </div>
            <p className="text-[10px] text-[#9E9890] mt-1.5 leading-snug">
              Pay-in-full estimate. Discounts, plan &amp; overrides are finalized at checkout.
            </p>
          </>
        ) : (
          <p className="text-xs text-[#9E9890]">Fees appear once a class is selected.</p>
        )}
      </div>
    </div>
  );
}

function RegistrationSummary(props: {
  dancerName: string;
  isNewDancer: boolean;
  newDancer: NewDancerInput | null;
  semesterName: string;
  classInfos: ClassInfo[];
  quote: PricingQuote | null;
  quoteLoading: boolean;
}) {
  return (
    <div className="space-y-4">
      <DancerSummaryCard dancerName={props.dancerName} isNewDancer={props.isNewDancer} newDancer={props.newDancer} />
      <PricingSummaryCard
        semesterName={props.semesterName}
        classInfos={props.classInfos}
        quote={props.quote}
        quoteLoading={props.quoteLoading}
      />
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
                    ? "bg-[#EDE9E4] text-[#736D65]"
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
                  isDone ? "bg-[#9E9890]" : "bg-[#DDD9D2]"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
