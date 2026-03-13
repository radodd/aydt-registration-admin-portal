"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronLeft, Check, Tag, AlertCircle, Pencil, X } from "lucide-react";
import { computePricingQuote } from "@/app/actions/computePricingQuote";
import type { PricingQuote } from "@/types";
import {
  createAdminRegistration,
  type NewDancerInput,
} from "../actions/createAdminRegistration";
import type { AdminSessionInfo } from "../actions/fetchSemesterClasses";

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
  sessionIds: string[];
  sessionInfos: AdminSessionInfo[];
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
  sessionIds,
  sessionInfos,
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

  // Payment
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [amountInput, setAmountInput] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [payerName, setPayerName] = useState("");
  const [notes, setNotes] = useState("");

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const grandTotal = overrideActive
    ? parseFloat(overrideInput) || 0
    : (quote?.grandTotal ?? 0);

  // Fetch pricing on mount and when coupon changes
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
            sessionIds,
          },
        ],
        paymentPlanType: "pay_in_full",
        couponCode: coupon || undefined,
      });
      setQuote(q);
      if (!amountInput) {
        setAmountInput(q.grandTotal.toFixed(2));
      }
    } catch (err) {
      console.warn("Pricing failed:", err);
    } finally {
      setPricingLoading(false);
    }
  };

  useEffect(() => {
    fetchPricing();
  }, [semesterId, familyId, dancerId, sessionIds.join(",")]);

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
            sessionIds,
          },
        ],
        paymentPlanType: "pay_in_full",
        couponCode: couponCode.trim(),
      });
      if (q.couponDiscount > 0) {
        setQuote(q);
        setAppliedCoupon(couponCode.trim());
        setAmountInput(q.grandTotal.toFixed(2));
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
      setAmountInput(grandTotal.toFixed(2));
    }
    setOverrideActive((v) => !v);
  }

  async function handleSubmit() {
    const amount = parseFloat(amountInput) || 0;
    if (!paymentMethod) {
      setSubmitError("Please select a payment method.");
      return;
    }
    setSubmitting(true);
    setSubmitError("");

    const result = await createAdminRegistration({
      semesterId,
      sessionIds,
      dancerId: isNewDancer ? null : (dancerId ?? null),
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
        {/* Payment method */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Payment</h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(["cash", "check", "card", "other"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setPaymentMethod(m)}
                className={`py-2 px-3 rounded-lg text-sm font-medium border transition capitalize ${
                  paymentMethod === m
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "border-gray-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Amount collected
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="w-full pl-6 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {paymentMethod === "check" && (
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Check #
                </label>
                <input
                  type="text"
                  value={checkNumber}
                  onChange={(e) => setCheckNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Payer name
              </label>
              <input
                type="text"
                placeholder="Optional"
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Internal notes
            </label>
            <textarea
              rows={2}
              placeholder="Optional — not visible to family"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        {/* Error */}
        {submitError && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {submitError}
          </div>
        )}

        {/* Nav */}
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {submitting ? "Registering…" : "Complete registration"}
            {!submitting && <Check className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Sidebar — order summary */}
      <div className="space-y-4">
        {/* Sessions */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Order summary
          </p>
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-800">{dancerName}</p>
            <p className="text-xs text-slate-400">{semesterName}</p>
          </div>
          <ul className="space-y-2 pt-1 border-t border-gray-100">
            {sessionInfos.map((s) => (
              <li key={s.sessionId} className="text-sm text-slate-600">
                <p className="font-medium">{s.className}</p>
                <p className="text-xs text-slate-400">
                  {s.dayOfWeek ? cap(s.dayOfWeek) : ""}
                  {s.startTime && ` · ${fmt12(s.startTime)}–${fmt12(s.endTime)}`}
                </p>
              </li>
            ))}
          </ul>
        </div>

        {/* Pricing */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Pricing
            </p>
            <button
              onClick={handleOverrideToggle}
              className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700"
            >
              <Pencil className="w-3 h-3" />
              {overrideActive ? "Cancel override" : "Override price"}
            </button>
          </div>

          {pricingLoading ? (
            <p className="text-xs text-slate-400">Calculating…</p>
          ) : overrideActive ? (
            <div>
              <label className="block text-xs text-slate-500 mb-1">Custom total</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={overrideInput}
                  onChange={(e) => {
                    setOverrideInput(e.target.value);
                    setAmountInput(e.target.value);
                  }}
                  className="w-full pl-6 pr-3 py-2 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
            </div>
          ) : quote ? (
            <div className="space-y-1.5 text-sm">
              {quote.lineItems
                .filter((li) => li.amount !== 0)
                .map((li, i) => (
                  <div key={i} className="flex justify-between gap-4">
                    <span className="text-slate-500 truncate">{li.label}</span>
                    <span
                      className={
                        li.amount < 0 ? "text-green-600 shrink-0" : "text-slate-700 shrink-0"
                      }
                    >
                      {li.amount < 0 ? `-${fmt$$(Math.abs(li.amount))}` : fmt$$(li.amount)}
                    </span>
                  </div>
                ))}
              <div className="flex justify-between gap-4 pt-2 border-t border-gray-100 font-semibold">
                <span className="text-slate-700">Total</span>
                <span className="text-slate-800">{fmt$$(quote.grandTotal)}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Pricing unavailable.</p>
          )}

          {/* Coupon */}
          {!overrideActive && (
            <div className="pt-2 border-t border-gray-100">
              {appliedCoupon ? (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1 text-green-600">
                    <Tag className="w-3.5 h-3.5" />
                    {appliedCoupon}
                  </span>
                  <button
                    onClick={handleRemoveCoupon}
                    className="text-slate-400 hover:text-slate-600"
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
                    className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleApplyCoupon}
                    disabled={couponLoading || !couponCode.trim()}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm text-slate-600 disabled:opacity-40 transition"
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

        {/* Balance due summary */}
        <div className="bg-slate-50 border border-gray-200 rounded-xl p-4">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Balance due</span>
            <span className="font-semibold text-slate-800">{fmt$$(grandTotal)}</span>
          </div>
          {!isNaN(parseFloat(amountInput)) && (
            <div className="flex justify-between text-sm mt-1">
              <span className="text-slate-500">Amount collected</span>
              <span
                className={
                  parseFloat(amountInput) >= grandTotal
                    ? "font-medium text-green-600"
                    : "font-medium text-amber-600"
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
