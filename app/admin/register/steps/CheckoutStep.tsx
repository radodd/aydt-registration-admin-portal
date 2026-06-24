"use client";

import { useState, useEffect, type ReactNode } from "react";
import { ChevronLeft, Check, Tag, AlertCircle, Pencil, X, Plus } from "lucide-react";
import { computePricingQuote } from "@/app/actions/computePricingQuote";
import type { PricingQuote, AdminAdjustment, FamilyAccountCredit } from "@/types";
import { createClient } from "@/utils/supabase/client";
import { getAvailableCredits } from "@/queries/credits";
import { buildAdminInstallmentSchedule } from "@/utils/buildPaymentSchedule";
import {
  createAdminRegistration,
  type NewDancerInput,
} from "../actions/createAdminRegistration";
import { markWaitlistEntryRegistered } from "@/app/admin/waitlist/actions/markWaitlistEntryRegistered";
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
  sessionIds: string[];
  classInfos: ClassInfo[];
  /** Phase 3a: classTierId per selected schedule (tiered classes). */
  classTierIdsBySchedule?: Record<string, string>;
  // Pre-configured price override from ClassesStep
  initialPriceOverride?: number | null;
  // Form answers
  formData: Record<string, unknown>;
  /** Super-admins can set up auto-charged installment plans + under-collect (#7). */
  isSuperAdmin: boolean;
  /** Meeting-plan #25: when set, mark this waitlist entry "registered" on success. */
  waitlistEntryId?: string | null;
  // Callbacks
  onBack: () => void;
  onSuccess: (batchId: string, dancerId: string) => void;
  /** Optional card(s) rendered at the top of the sidebar column (e.g. the
   *  "Registering" dancer card) so every summary card stacks in one column. */
  sidebarTop?: ReactNode;
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
  sessionIds,
  classInfos,
  classTierIdsBySchedule,
  initialPriceOverride,
  formData,
  isSuperAdmin,
  waitlistEntryId,
  onBack,
  onSuccess,
  sidebarTop,
}: Props) {
  // Pricing
  const [quote, setQuote] = useState<PricingQuote | null>(null);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState("");
  const [couponError, setCouponError] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);

  // Meeting-plan #33: optional add-on opt-in. Holds the representative option ids
  // (class_meeting_options.id) the admin has selected. Required add-ons always
  // apply and are not in this set.
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<string[]>([]);

  // Price override — pre-populate from ClassesStep if set
  const [overrideActive, setOverrideActive] = useState(
    initialPriceOverride != null
  );
  const [overrideInput, setOverrideInput] = useState(
    initialPriceOverride != null ? initialPriceOverride.toFixed(2) : ""
  );

  // Payment plan
  const [paymentPlanType, setPaymentPlanType] = useState<"pay_in_full" | "monthly">("pay_in_full");
  // #7: number of auto-charged installments (super-admin only). Default 5.
  const [installmentCount, setInstallmentCount] = useState(5);

  const toBackendPlan = (p: "pay_in_full" | "monthly") =>
    p === "monthly" ? ("auto_pay_monthly" as const) : ("pay_in_full" as const);

  // Adjustments (tuition_adjustment only — these discount THIS order).
  const [adjustments, setAdjustments] = useState<AdminAdjustment[]>([]);
  // #17: new account credits to grant the family (injury make-up, etc.). These
  // post to the family's balance for future use and do NOT reduce this order.
  const [creditsToGrant, setCreditsToGrant] = useState<{ label: string; amount: number }[]>([]);
  const [showAdjForm, setShowAdjForm] = useState(false);
  const [adjType, setAdjType] = useState<"tuition_adjustment" | "credit">("tuition_adjustment");
  const [adjLabel, setAdjLabel] = useState("");
  const [adjAmountStr, setAdjAmountStr] = useState("");
  const [adjError, setAdjError] = useState("");

  // Payment
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [amountInput, setAmountInput] = useState("");
  const [balanceDueDate, setBalanceDueDate] = useState("");
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
  // #17: total of new credits being granted — banked to the family, so it does
  // NOT factor into effectiveTotal. Shown separately for the admin's awareness.
  const creditsToGrantSum = creditsToGrant.reduce((sum, c) => sum + c.amount, 0);
  const creditTotal = applyCredit
    ? availableCredits.reduce((sum, c) => sum + c.amount, 0)
    : 0;
  const effectiveTotal = Math.max(0, grandTotal - adjustmentsSum - creditTotal);

  // #7: live preview of the auto-charged installment schedule. Mirrors the
  // server's buildAdminInstallmentSchedule so the admin sees exact amounts/dates.
  const isInstallments = paymentPlanType === "monthly";
  // #18: a one-time ACH debit redirects to Elavon's hosted bank-entry page (the
  // family pays the full total there), so it hides the cash-collection fields
  // and submits like the installment redirect rather than recording money taken.
  const isAch = !isInstallments && paymentMethod === "ach";
  const installmentSchedule =
    isInstallments && effectiveTotal > 0 && installmentCount >= 2
      ? buildAdminInstallmentSchedule(
          effectiveTotal,
          installmentCount,
          new Date().toISOString().slice(0, 10),
        )
      : [];

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
            classTierIdsBySchedule,
          },
        ],
        paymentPlanType: toBackendPlan(paymentPlanType),
        couponCode: coupon || undefined,
        selectedAddOnIds,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semesterId, familyId, dancerId, scheduleIds.join(","), paymentPlanType, selectedAddOnIds.join(",")]);

  useEffect(() => {
    setApplyCredit(false);
    setAvailableCredits([]);
    if (!familyId) return;
    getAvailableCredits(createClient(), familyId).then(setAvailableCredits);
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
            classTierIdsBySchedule,
          },
        ],
        paymentPlanType: toBackendPlan(paymentPlanType),
        couponCode: couponCode.trim(),
        selectedAddOnIds,
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
    if (adjType === "credit") {
      // #17: grant a new account credit — banked to the family, NOT a discount
      // on this order.
      setCreditsToGrant((prev) => [...prev, { label: adjLabel.trim(), amount }]);
    } else {
      setAdjustments((prev) => [...prev, { type: "tuition_adjustment", label: adjLabel.trim(), amount }]);
    }
    setAdjLabel("");
    setAdjAmountStr("");
    setAdjType("tuition_adjustment");
    setAdjError("");
    setShowAdjForm(false);
  }

  function handleRemoveAdjustment(index: number) {
    setAdjustments((prev) => prev.filter((_, i) => i !== index));
  }

  function handleRemoveCredit(index: number) {
    setCreditsToGrant((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    const amount = parseFloat(amountInput) || 0;
    if (isInstallments) {
      if (installmentCount < 2) {
        setSubmitError("Choose at least 2 installments.");
        return;
      }
      if (effectiveTotal <= 0) {
        setSubmitError("Installment total must be greater than $0.");
        return;
      }
    } else if (!paymentMethod) {
      setSubmitError("Please select a payment method.");
      return;
    }
    setSubmitting(true);
    setSubmitError("");

    // Applied account credits are NOT folded into `adjustments` — the server
    // verifies the chosen `creditIdsToApply` and derives the deduction itself
    // (single source of truth). `adjustments` carries only tuition adjustments.
    const result = await createAdminRegistration({
      semesterId,
      semesterName,
      scheduleIds,
      sessionIds,
      classTierIdsBySchedule,
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
      selectedAddOnIds,
      priceOverride: overrideActive ? grandTotal : undefined,
      adjustments: adjustments.length > 0 ? adjustments : undefined,
      creditIdsToApply: applyCredit && availableCredits.length > 0
        ? availableCredits.map((c) => c.id)
        : undefined,
      creditsToGrant: creditsToGrant.length > 0 ? creditsToGrant : undefined,
      paymentPlanType,
      installmentCount: isInstallments ? installmentCount : undefined,
      paymentMethod: isInstallments ? "card" : paymentMethod,
      // #18: ACH (like installments) collects nothing up front — the family pays
      // the full total on Elavon's hosted page and the webhook records it.
      amountCollected: isInstallments || isAch ? 0 : amount,
      balanceDueDate:
        !isInstallments && !isAch && amount < effectiveTotal
          ? (balanceDueDate || undefined)
          : undefined,
      checkNumber: paymentMethod === "check" ? checkNumber : undefined,
      payerName: payerName || undefined,
      notes: notes || undefined,
    });

    if (!result.success) {
      setSubmitting(false);
      setSubmitError(result.error ?? "Registration failed. Please try again.");
      return;
    }

    // Meeting-plan #25: this registration converts a waitlist entry — resolve it
    // so it drops off the waitlist (and the Classes-tab count). Done before any
    // installment/ACH redirect so it applies to every completion path. Best-effort:
    // a failure here must not block the (already-succeeded) registration.
    if (waitlistEntryId) {
      await markWaitlistEntryRegistered(waitlistEntryId).catch(() => {});
    }

    // Installment plans return a hosted-page URL — redirect so the family can
    // enter their card. The EPG webhook confirms the batch afterward (#7).
    if (result.paymentSessionUrl) {
      window.location.href = result.paymentSessionUrl;
      return; // keep the button disabled through navigation
    }

    setSubmitting(false);
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
            {(isSuperAdmin
              ? (["pay_in_full", "monthly"] as const)
              : (["pay_in_full"] as const)
            ).map((plan) => (
              <button
                key={plan}
                onClick={() => handlePaymentPlanChange(plan)}
                className={`py-2 px-3 rounded-xl text-sm font-medium border transition ${
                  paymentPlanType === plan
                    ? "bg-[#EDE9E4] border-[#8E2A23] text-[#8E2A23]"
                    : "border-[#DDD9D2] text-[#736D65] hover:bg-[#F7F5F2]"
                }`}
              >
                {plan === "pay_in_full" ? "Pay in Full" : "Installments (auto-charge)"}
              </button>
            ))}
          </div>

          {isInstallments && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-[#736D65]">
                  Number of installments
                </label>
                <input
                  type="number"
                  min={2}
                  max={12}
                  value={installmentCount}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    setInstallmentCount(Number.isNaN(n) ? 2 : Math.min(12, Math.max(2, n)));
                  }}
                  className="w-20 px-3 py-1.5 border border-[#DDD9D2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#8E2A23]"
                />
              </div>

              {installmentSchedule.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-[#736D65]">Auto-charge schedule</p>
                  {installmentSchedule.map((inst) => (
                    <div key={inst.installmentNumber} className="flex justify-between text-xs text-[#736D65]">
                      <span>
                        Installment {inst.installmentNumber} ·{" "}
                        {new Date(inst.dueDate + "T12:00:00").toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                        {inst.installmentNumber === 1 ? " (today)" : ""}
                      </span>
                      <span>{fmt$$(inst.amountDue)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#9E9890]">
                  Set a total above $0 to preview the schedule.
                </p>
              )}

              <p className="text-xs text-[#9E9890] pt-1">
                On <strong>Continue to card entry</strong> you&apos;ll be taken to the
                secure Elavon page to enter the family&apos;s card. Installment 1 is
                charged immediately; the rest auto-charge on the dates above.
              </p>
            </div>
          )}
        </div>

        {/* Pricing & Discounts — every total-affecting control in one place:
            the custom total (formerly the sidebar "Override price" toggle),
            adjustments, coupon, and account credit. "Amount collected" stays in
            the separate Payment card below, since it's money taken, not a
            discount. */}
        <div className="bg-white border border-[#DDD9D2] rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[#201D18]">Pricing &amp; Discounts</h2>

          {/* Custom total — replaces the engine total with a flat number.
              ClassesStep pre-activates this for drop-in/mixed carts (the engine
              can't price drop-in sessions), so leave the plumbing intact. */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-[#736D65]">
                {overrideActive ? "Custom total" : "Calculated total"}
              </label>
              <button
                onClick={handleOverrideToggle}
                className="flex items-center gap-1 text-xs text-[#8E2A23] hover:text-[#7A2420]"
              >
                <Pencil className="w-3 h-3" />
                {overrideActive ? "Use calculated price" : "Set custom total"}
              </button>
            </div>
            {overrideActive ? (
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
            ) : (
              <p className="text-sm text-[#201D18]">
                {pricingLoading ? "Calculating…" : fmt$$(grandTotal)}
              </p>
            )}
          </div>

          {/* Add-ons (meeting-plan #33) — optional options default OFF; admin
              opts in per registration. Required add-ons show locked/checked. */}
          {(quote?.availableAddOns?.length ?? 0) > 0 && (
            <div className="pt-4 border-t border-[#DDD9D2] space-y-2">
              <h3 className="text-xs font-semibold text-[#201D18] uppercase tracking-wide">
                Add-ons
              </h3>
              <div className="space-y-1.5">
                {quote!.availableAddOns.map((opt) => {
                  const checked = opt.isRequired || selectedAddOnIds.includes(opt.id);
                  return (
                    <label
                      key={opt.id}
                      className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl border ${
                        checked ? "border-[#C8A09D] bg-[#FBF5F4]" : "border-[#DDD9D2] bg-white"
                      } ${opt.isRequired ? "" : "cursor-pointer"}`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={opt.isRequired}
                          onChange={(e) =>
                            setSelectedAddOnIds((prev) =>
                              e.target.checked
                                ? [...prev, opt.id]
                                : prev.filter((id) => id !== opt.id),
                            )
                          }
                          className="h-4 w-4 rounded border-[#C8A09D] text-[#8E2A23] focus:ring-[#8E2A23] disabled:opacity-60"
                        />
                        <span className="min-w-0">
                          <span className="text-sm text-[#201D18]">{opt.name}</span>
                          {opt.isRequired && (
                            <span className="ml-2 text-[10px] uppercase tracking-wide text-[#8E2A23]">
                              Required
                            </span>
                          )}
                          {opt.description && (
                            <span className="block text-xs text-[#736D65] truncate">
                              {opt.description}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="text-sm text-[#201D18] shrink-0">{fmt$$(opt.price)}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[11px] text-[#9E9890]">
                Optional add-ons are off by default — select to include them.
              </p>
            </div>
          )}

          {/* Adjustments */}
          <div className="pt-4 border-t border-[#DDD9D2] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[#201D18] uppercase tracking-wide">
                Adjustments
              </h3>
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
                        ? "bg-[#EDE9E4] border-[#8E2A23] text-[#8E2A23]"
                        : "border-[#DDD9D2] text-[#736D65] hover:bg-[#F7F5F2] bg-white"
                    }`}
                  >
                    {t === "tuition_adjustment" ? "Tuition Adjustment" : "Credit"}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[#9E9890]">
                {adjType === "tuition_adjustment"
                  ? "Reduces the total due on this order (proration, scholarship, courtesy)."
                  : "Issues an account credit to the family for future use (e.g. injury make-up). Does not reduce this order — it's banked to their balance."}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[#736D65] mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    placeholder={adjType === "credit" ? "e.g. Injury make-up credit" : "e.g. Week 1 proration"}
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
                    <span className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded bg-mauve/20 text-mauve-text">
                      Adj
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

          {/* #17: account credits to issue. Distinct from adjustments — these are
              banked to the family's balance, not subtracted from this order. */}
          {creditsToGrant.length > 0 && (
            <ul className="space-y-2 pt-3 border-t border-[#DDD9D2]">
              {creditsToGrant.map((credit, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded bg-[#EDE9E4] text-[#736D65]">
                      Credit
                    </span>
                    <span className="text-[#736D65] truncate">{credit.label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[#736D65] font-medium">+{fmt$$(credit.amount)} to account</span>
                    <button
                      onClick={() => handleRemoveCredit(i)}
                      className="text-[#9E9890] hover:text-[#736D65] transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          </div>

          {/* Coupon — hidden while a custom total is set (mirrors prior behavior). */}
          {!overrideActive && (
            <div className="pt-4 border-t border-[#DDD9D2]">
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

          {/* Account credit */}
          {availableCredits.length > 0 && (
            <div className="pt-4 border-t border-[#DDD9D2]">
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
        </div>

        {/* Payment method — hidden for installment plans (#7): the family enters
            their card on Elavon's hosted page, so no cash/check entry here. */}
        {!isInstallments && (
        <div className="bg-white border border-[#DDD9D2] rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[#201D18]">Payment</h2>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {(["cash", "check", "card", "ach", "other"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setPaymentMethod(m)}
                className={`py-2 px-3 rounded-xl text-sm font-medium border transition ${
                  m === "ach" ? "uppercase" : "capitalize"
                } ${
                  paymentMethod === m
                    ? "bg-[#EDE9E4] border-[#8E2A23] text-[#8E2A23]"
                    : "border-[#DDD9D2] text-[#736D65] hover:bg-[#F7F5F2]"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* #18: ACH pulls funds on Elavon's hosted bank-entry page, so the
              cash-collection fields are replaced with a redirect note (mirrors
              the installment "Continue to card entry" handoff). */}
          {isAch ? (
            <div className="rounded-xl bg-[#F7F5F2] border border-[#DDD9D2] p-3">
              <p className="text-xs text-[#736D65]">
                On <strong>Continue to bank entry</strong> you&apos;ll be taken to
                the secure Elavon page to enter the family&apos;s bank account. The
                full total of <strong>{fmt$$(effectiveTotal)}</strong> is debited
                via ACH; the registration confirms once the debit clears.
              </p>
            </div>
          ) : (
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

            {!isInstallments &&
              !isNaN(parseFloat(amountInput)) &&
              parseFloat(amountInput) < effectiveTotal && (
                <div>
                  <label className="block text-xs font-medium text-[#736D65] mb-1">
                    Balance due date
                  </label>
                  <input
                    type="date"
                    value={balanceDueDate}
                    onChange={(e) => setBalanceDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-[#DDD9D2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#8E2A23]"
                  />
                  <p className="mt-1 text-[10px] text-[#9E9890]">
                    When the remaining {fmt$$(effectiveTotal - (parseFloat(amountInput) || 0))} is due. Defaults to today.
                  </p>
                </div>
              )}

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
          )}

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
        )}

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
            {submitting
              ? isInstallments
                ? "Starting card entry…"
                : isAch
                  ? "Starting bank entry…"
                  : "Registering…"
              : isInstallments
                ? "Continue to card entry"
                : isAch
                  ? "Continue to bank entry"
                  : "Complete registration"}
            {!submitting && <Check className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Sidebar — order summary */}
      <div className="space-y-4">
        {sidebarTop}
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

        {/* Pricing — read-only breakdown. All total-affecting controls now live
            in the "Pricing & Discounts" card in the main column. */}
        <div className="bg-white border border-[#DDD9D2] rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-[#9E9890] uppercase tracking-wide">
            Pricing
          </p>

          {pricingLoading ? (
            <p className="text-xs text-[#9E9890]">Calculating…</p>
          ) : overrideActive ? (
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-[#736D65] truncate">Custom total</span>
                <span className="text-[#201D18] shrink-0">{fmt$$(grandTotal)}</span>
              </div>
              {adjustments.map((adj, i) => (
                <div key={i} className="flex justify-between gap-4">
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

        </div>

        {/* Balance due summary */}
        <div className="bg-[#F7F5F2] border border-[#DDD9D2] rounded-xl p-4">
          <div className="flex justify-between text-sm">
            <span className="text-[#736D65]">{isInstallments ? "Plan total" : "Balance due"}</span>
            <span className="font-semibold text-[#201D18]">{fmt$$(effectiveTotal)}</span>
          </div>
          {isInstallments && installmentSchedule.length > 0 && (
            <div className="flex justify-between text-sm mt-1">
              <span className="text-[#736D65]">Charged today (installment 1)</span>
              <span className="font-medium text-green-600">
                {fmt$$(installmentSchedule[0].amountDue)}
              </span>
            </div>
          )}
          {!isInstallments && !isNaN(parseFloat(amountInput)) && (
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
          {creditsToGrantSum > 0 && (
            <div className="flex justify-between text-xs mt-2 pt-2 border-t border-[#DDD9D2]">
              <span className="text-[#736D65]">Account credit issued</span>
              <span className="font-medium text-[#736D65]">+{fmt$$(creditsToGrantSum)} to family balance</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
