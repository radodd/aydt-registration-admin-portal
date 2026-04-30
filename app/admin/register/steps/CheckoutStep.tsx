"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, Check, Tag, AlertCircle, Pencil, X, Plus } from "lucide-react";
import { computePricingQuote } from "@/app/actions/computePricingQuote";
import type { PricingQuote, AdminAdjustment, FamilyAccountCredit } from "@/types";
import { createClient } from "@/utils/supabase/client";
import {
  createAdminRegistration,
  type NewDancerInput,
} from "../actions/createAdminRegistration";
import type { ClassInfo } from "./ClassesStep";

type Props = {
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
  classInfos: ClassInfo[];
  // Pre-configured price override from ClassesStep
  initialPriceOverride?: number | null;
  // Form answers
  formData: Record<string, unknown>;
  // Callbacks
  onBack: () => void;
  onSuccess: (batchId: string, dancerId: string) => void;
};

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

function fmt$$(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function fmt12(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function cap(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export default function CheckoutStep({
  dancerId,
  dancerName,
  familyId,
  parentUserId,
  isNewDancer,
  newDancer,
  semesterId,
  semesterName,
  scheduleIds,
  classInfos,
  initialPriceOverride,
  formData,
  onBack,
  onSuccess,
}: Props) {
  // Pricing
  const [quote, setQuote] = useState<PricingQuote | null>(null);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState("");
  const [couponError, setCouponError] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);

  // Price override — pre-populate from ClassesStep if set
  const [overrideActive, setOverrideActive] = useState(
    initialPriceOverride != null
  );
  const [overrideInput, setOverrideInput] = useState(
    initialPriceOverride != null ? initialPriceOverride.toFixed(2) : ""
  );

  // Payment plan
  const [paymentPlanType, setPaymentPlanType] = useState<"pay_in_full" | "monthly">("pay_in_full");

  const toBackendPlan = (p: "pay_in_full" | "monthly") =>
    p === "monthly" ? ("auto_pay_monthly" as const) : ("pay_in_full" as const);

  // Adjustments
  const [adjustments, setAdjustments] = useState<AdminAdjustment[]>([]);
  const [showAdjForm, setShowAdjForm] = useState(false);
  const [adjType, setAdjType] = useState<"tuition_adjustment" | "credit">("tuition_adjustment");
  const [adjLabel, setAdjLabel] = useState("");
  const [adjAmountStr, setAdjAmountStr] = useState("");
  const [adjError, setAdjError] = useState("");

  // Payment
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [amountInput, setAmountInput] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [payerName, setPayerName] = useState("");
  const [notes, setNotes] = useState("");

  // Account credits
  const [availableCredits, setAvailableCredits] = useState<FamilyAccountCredit[]>([]);
  const [applyCredit, setApplyCredit] = useState(false);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const grandTotal = overrideActive
    ? parseFloat(overrideInput) || 0
    : (quote?.grandTotal ?? 0);

  const adjustmentsSum = adjustments.reduce((sum, a) => sum + a.amount, 0);
  const creditTotal = applyCredit
    ? availableCredits.reduce((sum, c) => sum + c.amount, 0)
    : 0;
  const effectiveTotal = Math.max(0, grandTotal - adjustmentsSum - creditTotal);

  const fetchPricing = async (coupon?: string) => {
    setPricingLoading(true);
    try {
      const q = await computePricingQuote({
        semesterId,
        familyId: familyId ?? undefined,
        enrollments: [
          {
            dancerId: dancerId ?? NIL_UUID,
            dancerName: isNewDancer ? dancerName : undefined,
            scheduleIds,
          },
        ],
        paymentPlanType: toBackendPlan(paymentPlanType),
        couponCode: coupon || undefined,
      });
      setQuote(q);
      if (!amountInput) {
        const eff = Math.max(0, q.grandTotal - adjustmentsSum);
        setAmountInput(
          paymentPlanType === "monthly" ? "0.00" : eff.toFixed(2)
        );
      }
    } catch (err) {
      console.warn("Pricing failed:", err);
    } finally {
      setPricingLoading(false);
    }
  };

  useEffect(() => {
    fetchPricing();
  }, [semesterId, familyId, dancerId, scheduleIds.join(","), paymentPlanType]);

  useEffect(() => {
    setApplyCredit(false);
    setAvailableCredits([]);
    if (!familyId) return;
    const supabase = createClient();
    supabase
      .from("family_account_credits")
      .select("*")
      .eq("family_id", familyId)
      .is("used_in_batch_id", null)
      .eq("is_active", true)
      .then(({ data }) => {
        if (data) setAvailableCredits(data as FamilyAccountCredit[]);
      });
  }, [familyId]);

  useEffect(() => {
    if (paymentPlanType === "monthly") return;
    if (!quote && !overrideActive) return;
    setAmountInput(effectiveTotal.toFixed(2));
  }, [adjustmentsSum]);

  function handlePaymentPlanChange(plan: "pay_in_full" | "monthly") {
    setPaymentPlanType(plan);
    if (plan === "monthly") {
      setAmountInput("0.00");
    } else {
      setAmountInput(effectiveTotal.toFixed(2));
    }
  }

  async function handleApplyCoupon() {
    if (!couponCode.trim()) return;
    setCouponError("");
    setCouponLoading(true);
    try {
      const q = await computePricingQuote({
        semesterId,
        familyId: familyId ?? undefined,
        enrollments: [
          {
            dancerId: dancerId ?? NIL_UUID,
            dancerName: isNewDancer ? dancerName : undefined,
            scheduleIds,
          },
        ],
        paymentPlanType: toBackendPlan(paymentPlanType),
        couponCode: couponCode.trim(),
      });
      if (q.couponDiscount > 0) {
        setQuote(q);
        setAppliedCoupon(couponCode.trim());
        if (paymentPlanType !== "monthly") {
          const eff = Math.max(0, q.grandTotal - adjustmentsSum);
          setAmountInput(eff.toFixed(2));
        }
      } else {
        setCouponError("Code not valid or not applicable.");
      }
    } catch {
      setCouponError("Could not apply coupon.");
    } finally {
      setCouponLoading(false);
    }
  }

  function handleRemoveCoupon() {
    setAppliedCoupon("");
    setCouponCode("");
    fetchPricing();
  }

  function handleOverrideToggle() {
    if (!overrideActive) {
      setOverrideInput(grandTotal.toFixed(2));
      if (paymentPlanType !== "monthly") setAmountInput(effectiveTotal.toFixed(2));
    }
    setOverrideActive((v) => !v);
  }

  function handleAddAdjustment() {
    const amount = parseFloat(adjAmountStr);
    if (!adjLabel.trim()) {
      setAdjError("Label is required.");
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      setAdjError("Amount must be greater than $0.");
      return;
    }
    setAdjustments((prev) => [...prev, { type: adjType, label: adjLabel.trim(), amount }]);
    setAdjLabel("");
    setAdjAmountStr("");
    setAdjType("tuition_adjustment");
    setAdjError("");
    setShowAdjForm(false);
  }

  function handleRemoveAdjustment(index: number) {
    setAdjustments((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    const amount = parseFloat(amountInput) || 0;
    if (!paymentMethod) {
      setSubmitError("Please select a payment method.");
      return;
    }
    setSubmitting(true);
    setSubmitError("");

    const creditAdjustments: AdminAdjustment[] = applyCredit && creditTotal > 0
      ? [{ type: "credit", label: "Account Credit", amount: creditTotal }]
      : [];
    const allAdjustments = [...adjustments, ...creditAdjustments];

    const result = await createAdminRegistration({
      semesterId,
      semesterName,
      scheduleIds,
      dancerId: isNewDancer ? null : (dancerId ?? null),
      dancerName,
      familyId: isNewDancer ? null : (familyId ?? null),
      parentUserId: isNewDancer ? null : (parentUserId ?? null),
      newDancer: isNewDancer && newDancer
        ? {
            firstName: newDancer.firstName,
            lastName: newDancer.lastName,
            birthDate: newDancer.birthDate,
            gender: newDancer.gender,
            grade: newDancer.grade,
            familyId: newDancer.familyId,
            newFamilyName: newDancer.newFamilyName,
          }
        : null,
      formData,
      couponCode: appliedCoupon || undefined,
      priceOverride: overrideActive ? grandTotal : undefined,
      adjustments: allAdjustments.length > 0 ? allAdjustments : undefined,
      creditIdsToApply: applyCredit && availableCredits.length > 0
        ? availableCredits.map((c) => c.id)
        : undefined,
      paymentPlanType,
      paymentMethod,
      amountCollected: amount,
      checkNumber: paymentMethod === "check" ? checkNumber : undefined,
      payerName: payerName || undefined,
      notes: notes || undefined,
    });

    setSubmitting(false);

    if (!result.success) {
      setSubmitError(result.error ?? "Registration failed. Please try again.");
      return;
    }

    onSuccess(result.batchId!, result.dancerId!);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
      {/* Main — payment form */}
      <div className="space-y-5">

        {/* Payment plan */}
        <div className="bg-white border border-[#DDD9D2] rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-[#201D18]">Payment Plan</h2>
          <div className="grid grid-cols-2 gap-2">
            {(["pay_in_full", "monthly"] as const).map((plan) => (
              <button
                key={plan}
                onClick={() => handlePaymentPlanChange(plan)}
                className={`py-2 px-3 rounded-xl text-sm font-medium border transition ${
                  paymentPlanType === plan
                    ? "bg-[#8E2A23] border-[#8E2A23] text-white"
                    : "border-[#DDD9D2] text-[#736D65] hover:bg-[#F7F5F2]"
                }`}
              >
                {plan === "pay_in_full" ? "Pay in Full" : "Monthly"}
              </button>
            ))}
          </div>
          {paymentPlanType === "monthly" && quote && quote.paymentSchedule.length > 0 && (
            <div className="space-y-1 pt-1">
              <p className="text-xs font-medium text-[#736D65]">Payment schedule</p>
              {quote.paymentSchedule.map((inst) => (
                <div key={inst.installmentNumber} className="flex justify-between text-xs text-[#736D65]">
                  <span>Installment {inst.installmentNumber} · {new Date(inst.dueDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                  <span>{fmt$$(inst.amountDue)}</span>
                </div>
              ))}
              <p className="text-xs text-[#9E9890] pt-1">Billing managed externally — recording $0 collected today.</p>
            </div>
          )}
          {paymentPlanType === "monthly" && (!quote || quote.paymentSchedule.length === 0) && (
            <p className="text-xs text-[#736D65]">
              Billing managed externally — recording $0 collected at this time.
            </p>
          )}
        </div>

        {/* Adjustments */}
        <div className="bg-white border border-[#DDD9D2] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#201D18]">Adjustments</h2>
            {!showAdjForm && (
              <button
                onClick={() => { setShowAdjForm(true); setAdjError(""); }}
                className="flex items-center gap-1 text-xs text-[#8E2A23] hover:text-[#7A2420]"
              >
                <Plus className="w-3 h-3" />
                Add adjustment
              </button>
            )}
          </div>

          {/* Inline add form */}
          {showAdjForm && (
            <div className="space-y-3 p-3 bg-[#F7F5F2] rounded-xl border border-[#DDD9D2]">
              {/* Type toggle */}
              <div className="grid grid-cols-2 gap-2">
                {(["tuition_adjustment", "credit"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setAdjType(t)}
                    className={`py-1.5 px-3 rounded-xl text-xs font-medium border transition ${
                      adjType === t
                        ? "bg-[#8E2A23] border-[#8E2A23] text-white"
                        : "border-[#DDD9D2] text-[#736D65] hover:bg-[#F7F5F2] bg-white"
                    }`}
                  >
                    {t === "tuition_adjustment" ? "Tuition Adjustment" : "Credit"}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[#736D65] mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Week 1 proration"
                    value={adjLabel}
                    onChange={(e) => { setAdjLabel(e.target.value); setAdjError(""); }}
                    className="w-full px-3 py-2 border border-[#DDD9D2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#8E2A23]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#736D65] mb-1">
                    Amount
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9E9890] text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      value={adjAmountStr}
                      onChange={(e) => { setAdjAmountStr(e.target.value); setAdjError(""); }}
                      onKeyDown={(e) => e.key === "Enter" && handleAddAdjustment()}
                      className="w-full pl-6 pr-3 py-2 border border-[#DDD9D2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#8E2A23]"
                    />
                  </div>
                </div>
              </div>
              {adjError && <p className="text-xs text-red-500">{adjError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setShowAdjForm(false); setAdjLabel(""); setAdjAmountStr(""); setAdjError(""); }}
                  className="px-3 py-1.5 text-xs text-[#736D65] hover:text-[#201D18] transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddAdjustment}
                  className="px-4 py-1.5 bg-[#8E2A23] text-white rounded-xl text-xs font-medium hover:bg-[#7A2420] transition"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {/* Adjustment list */}
          {adjustments.length > 0 ? (
            <ul className="space-y-2">
              {adjustments.map((adj, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`shrink-0 text-xs font-medium px-1.5 py-0.5 rounded ${
                      adj.type === "credit"
                        ? "bg-[#EDE9E4] text-[#736D65]"
                        : "bg-mauve/20 text-mauve-text"
                    }`}>
                      {adj.type === "credit" ? "Credit" : "Adj"}
                    </span>
                    <span className="text-[#736D65] truncate">{adj.label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-green-600 font-medium">-{fmt$$(adj.amount)}</span>
                    <button
                      onClick={() => handleRemoveAdjustment(i)}
                      className="text-[#9E9890] hover:text-[#736D65] transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : !showAdjForm ? (
            <p className="text-xs text-[#9E9890]">No adjustments. Use adjustments for proration credits, scholarships, or other deductions visible to the family.</p>
          ) : null}
        </div>

        {/* Payment method */}
        <div className="bg-white border border-[#DDD9D2] rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[#201D18]">Payment</h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(["cash", "check", "card", "other"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setPaymentMethod(m)}
                className={`py-2 px-3 rounded-xl text-sm font-medium border transition capitalize ${
                  paymentMethod === m
                    ? "bg-[#8E2A23] border-[#8E2A23] text-white"
                    : "border-[#DDD9D2] text-[#736D65] hover:bg-[#F7F5F2]"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#736D65] mb-1">
                Amount collected
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9E9890] text-sm">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="w-full pl-6 pr-3 py-2 border border-[#DDD9D2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#8E2A23]"
                />
              </div>
            </div>

            {paymentMethod === "check" && (
              <div>
                <label className="block text-xs font-medium text-[#736D65] mb-1">
                  Check #
                </label>
                <input
                  type="text"
                  value={checkNumber}
                  onChange={(e) => setCheckNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-[#DDD9D2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#8E2A23]"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#736D65] mb-1">
                Payer name
              </label>
              <input
                type="text"
                placeholder="Optional"
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                className="w-full px-3 py-2 border border-[#DDD9D2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#8E2A23]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#736D65] mb-1">
              Internal notes
            </label>
            <textarea
              rows={2}
              placeholder="Optional — not visible to family"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-[#DDD9D2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#8E2A23] resize-none"
            />
          </div>
        </div>

        {/* Error */}
        {submitError && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {submitError}
          </div>
        )}

        {/* Nav */}
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-[#736D65] hover:text-[#201D18] transition"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#8E2A23] text-white rounded-xl text-sm font-semibold hover:bg-[#7A2420] disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {submitting ? "Registering…" : "Complete registration"}
            {!submitting && <Check className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Sidebar — order summary */}
      <div className="space-y-4">
        {/* Sessions */}
        <div className="bg-white border border-[#DDD9D2] rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-[#9E9890] uppercase tracking-wide">
            Order summary
          </p>
          <div className="space-y-1">
            <p className="text-sm font-medium text-[#201D18]">{dancerName}</p>
            <p className="text-xs text-[#9E9890]">{semesterName}</p>
          </div>
          <ul className="space-y-2 pt-1 border-t border-[#DDD9D2]">
            {classInfos.map((c) => (
              <li key={c.classId} className="text-sm text-[#736D65]">
                <p className="font-medium">{c.className}</p>
                <p className="text-xs text-[#9E9890]">
                  {c.dayOfWeek ? cap(c.dayOfWeek) : ""}
                  {c.startTime && ` · ${fmt12(c.startTime)}–${fmt12(c.endTime)}`}
                </p>
              </li>
            ))}
          </ul>
        </div>

        {/* Pricing */}
        <div className="bg-white border border-[#DDD9D2] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[#9E9890] uppercase tracking-wide">
              Pricing
            </p>
            <button
              onClick={handleOverrideToggle}
              className="flex items-center gap-1 text-xs text-[#8E2A23] hover:text-[#7A2420]"
            >
              <Pencil className="w-3 h-3" />
              {overrideActive ? "Cancel override" : "Override price"}
            </button>
          </div>

          {pricingLoading ? (
            <p className="text-xs text-[#9E9890]">Calculating…</p>
          ) : overrideActive ? (
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-[#736D65] mb-1">Custom base total</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9E9890] text-sm">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={overrideInput}
                    onChange={(e) => {
                      setOverrideInput(e.target.value);
                      if (paymentPlanType !== "monthly") setAmountInput(e.target.value);
                    }}
                    className="w-full pl-6 pr-3 py-2 border border-[#C8A09D] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#8E2A23]"
                    autoFocus
                  />
                </div>
              </div>
              {adjustments.length > 0 && (
                <div className="space-y-1.5 text-sm pt-1">
                  {adjustments.map((adj, i) => (
                    <div key={i} className="flex justify-between gap-4">
                      <span className="text-[#736D65] truncate">{adj.label}</span>
                      <span className="text-green-600 shrink-0">-{fmt$$(adj.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between gap-4 pt-2 border-t border-[#DDD9D2] font-semibold">
                    <span className="text-[#201D18]">Total Due</span>
                    <span className="text-[#201D18]">{fmt$$(effectiveTotal)}</span>
                  </div>
                </div>
              )}
            </div>
          ) : quote ? (
            <div className="space-y-1.5 text-sm">
              {quote.lineItems
                .filter((li) => li.amount !== 0)
                .map((li, i) => (
                  <div key={i} className="flex justify-between gap-4">
                    <span className="text-[#736D65] truncate">{li.label}</span>
                    <span
                      className={
                        li.amount < 0 ? "text-green-600 shrink-0" : "text-[#201D18] shrink-0"
                      }
                    >
                      {li.amount < 0 ? `-${fmt$$(Math.abs(li.amount))}` : fmt$$(li.amount)}
                    </span>
                  </div>
                ))}
              {adjustments.map((adj, i) => (
                <div key={`adj-${i}`} className="flex justify-between gap-4">
                  <span className="text-[#736D65] truncate">{adj.label}</span>
                  <span className="text-green-600 shrink-0">-{fmt$$(adj.amount)}</span>
                </div>
              ))}
              {applyCredit && creditTotal > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-[#736D65] truncate">Account Credit</span>
                  <span className="text-green-600 shrink-0">-{fmt$$(creditTotal)}</span>
                </div>
              )}
              <div className="flex justify-between gap-4 pt-2 border-t border-[#DDD9D2] font-semibold">
                <span className="text-[#201D18]">Total Due</span>
                <span className="text-[#201D18]">{fmt$$(effectiveTotal)}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-[#9E9890]">Pricing unavailable.</p>
          )}

          {/* Coupon */}
          {!overrideActive && (
            <div className="pt-2 border-t border-[#DDD9D2]">
              {appliedCoupon ? (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1 text-green-600">
                    <Tag className="w-3.5 h-3.5" />
                    {appliedCoupon}
                  </span>
                  <button
                    onClick={handleRemoveCoupon}
                    className="text-[#9E9890] hover:text-[#736D65]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Promo code"
                    value={couponCode}
                    onChange={(e) => {
                      setCouponCode(e.target.value.toUpperCase());
                      setCouponError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleApplyCoupon()}
                    className="flex-1 px-3 py-1.5 border border-[#DDD9D2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#8E2A23]"
                  />
                  <button
                    onClick={handleApplyCoupon}
                    disabled={couponLoading || !couponCode.trim()}
                    className="px-3 py-1.5 bg-[#F7F5F2] hover:bg-[#EDEAE5] rounded-xl text-sm text-[#736D65] disabled:opacity-40 transition"
                  >
                    Apply
                  </button>
                </div>
              )}
              {couponError && (
                <p className="text-xs text-red-500 mt-1">{couponError}</p>
              )}
            </div>
          )}
        </div>

        {/* Account credits */}
        {availableCredits.length > 0 && (
          <div className="bg-white border border-[#DDD9D2] rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-[#9E9890] uppercase tracking-wide">
              Account Credit
            </p>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={applyCredit}
                onChange={(e) => {
                  setApplyCredit(e.target.checked);
                  if (paymentPlanType !== "monthly") {
                    const newEff = Math.max(
                      0,
                      grandTotal - adjustmentsSum - (e.target.checked ? creditTotal : 0)
                    );
                    setAmountInput(newEff.toFixed(2));
                  }
                }}
                className="rounded border-[#DDD9D2] text-[#8E2A23] focus:ring-[#8E2A23]"
              />
              <span className="text-sm text-[#201D18]">
                Apply account credit{" "}
                <span className="font-medium text-green-600">
                  ({fmt$$(availableCredits.reduce((s, c) => s + c.amount, 0))})
                </span>
              </span>
            </label>
          </div>
        )}

        {/* Balance due summary */}
        <div className="bg-[#F7F5F2] border border-[#DDD9D2] rounded-xl p-4">
          <div className="flex justify-between text-sm">
            <span className="text-[#736D65]">Balance due</span>
            <span className="font-semibold text-[#201D18]">{fmt$$(effectiveTotal)}</span>
          </div>
          {!isNaN(parseFloat(amountInput)) && (
            <div className="flex justify-between text-sm mt-1">
              <span className="text-[#736D65]">Amount collected</span>
              <span
                className={
                  parseFloat(amountInput) >= effectiveTotal
                    ? "font-medium text-green-600"
                    : "font-medium text-mauve-text"
                }
              >
                {fmt$$(parseFloat(amountInput) || 0)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
