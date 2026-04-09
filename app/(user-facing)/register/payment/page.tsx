"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  RegistrationProvider,
  useRegistration,
} from "@/app/providers/RegistrationProvider";
import { CartRestoreGuard } from "../CartRestoreGuard";
import { useCart } from "@/app/providers/CartProvider";
import { createRegistrations } from "../actions/createRegistrations";
import { computePricingQuote } from "@/app/actions/computePricingQuote";
import { createEPGPaymentSession } from "@/app/actions/createEPGPaymentSession";
import { getSemesterForDisplay } from "@/app/actions/getSemesterForDisplay";
import { createClient } from "@/utils/supabase/client";
import type { PricingQuote, FamilyAccountCredit } from "@/types";
import type { PublicSession } from "@/types/public";
import { gaEvent } from "@/utils/analytics";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatTime(time: string): string {
  const parts = time.split(":");
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

function getDisciplineDisc(session: PublicSession | undefined): {
  line1: string;
  line2: string | null;
} {
  const source = (session?.discipline ?? session?.name ?? "")
    .split(" ")[0]
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (source.length < 5) return { line1: source.substring(0, 4), line2: null };
  return { line1: source.substring(0, 3), line2: source.substring(3, 6) || null };
}

/* -------------------------------------------------------------------------- */
/* Payment content                                                             */
/* -------------------------------------------------------------------------- */

export function PaymentContent({ semesterId }: { semesterId: string }) {
  const router = useRouter();
  const { state, setPaymentIntent, reset } = useRegistration();
  const { sessionIds, clear, secondsRemaining, isExpired } = useCart();

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<PricingQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [semesterSessions, setSemesterSessions] = useState<PublicSession[]>([]);
  const [dancerNames, setDancerNames] = useState<Map<string, string>>(new Map());

  // Coupon code
  const [couponInput, setCouponInput] = useState("");
  const [appliedCouponCode, setAppliedCouponCode] = useState<string | null>(null);
  const [couponFeedback, setCouponFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Account credits
  const [availableCredits, setAvailableCredits] = useState<FamilyAccountCredit[]>([]);
  const [applyCredit, setApplyCredit] = useState(false);

  // Stable batchId: same cart + retry = same ID, so createRegistrations()
  // idempotency guard returns existing registrations without duplicate DB inserts.
  // If cart assignments change the fingerprint shifts, a new ID is generated,
  // and the stale batch is cleaned up by createRegistrations() on the next call.
  const [batchId] = useState<string>(() => {
    const fingerprint = state.participants
      .filter((p) => p.dancerId)
      .map((p) => `${p.dancerId}:${p.sessionId}`)
      .sort()
      .join("|");
    const key = `aydt_payment_batch_${semesterId}`;
    try {
      const stored = JSON.parse(sessionStorage.getItem(key) ?? "null");
      if (stored?.fingerprint === fingerprint && stored?.batchId) {
        return stored.batchId as string;
      }
    } catch {}
    const id = crypto.randomUUID();
    try {
      sessionStorage.setItem(key, JSON.stringify({ batchId: id, fingerprint }));
    } catch {}
    return id;
  });

  const semesterMode = state.isPreview ? "preview" : "live";

  // Fetch session details for display
  useEffect(() => {
    getSemesterForDisplay(semesterId, semesterMode).then((s) =>
      setSemesterSessions(s.sessions),
    );
  }, [semesterId, semesterMode]);

  // Fetch names for existing dancers (new-dancer names come from state.participants directly)
  useEffect(() => {
    const existingIds = state.participants
      .filter((p) => p.dancerId && !p.newDancer)
      .map((p) => p.dancerId!);
    if (existingIds.length === 0) return;
    const supabase = createClient();
    supabase
      .from("dancers")
      .select("id, first_name, last_name")
      .in("id", existingIds)
      .then(({ data }) => {
        if (!data) return;
        setDancerNames(
          new Map(data.map((d) => [d.id, `${d.first_name} ${d.last_name}`])),
        );
      });
  }, [state.participants]);

  // Fetch available account credits for this family
  useEffect(() => {
    if (state.isPreview) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("users")
        .select("family_id")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data: profile }) => {
          const familyId = (profile as any)?.family_id;
          if (!familyId) return;
          supabase
            .from("family_account_credits")
            .select("*")
            .eq("family_id", familyId)
            .is("used_in_batch_id", null)
            .eq("is_active", true)
            .then(({ data }) => {
              if (data && data.length > 0) {
                setAvailableCredits(data as FamilyAccountCredit[]);
                setApplyCredit(true);
              }
            });
        });
    });
  }, [state.isPreview]);

  const creditTotal = applyCredit
    ? availableCredits.reduce((sum, c) => sum + Number(c.amount), 0)
    : 0;

  const sessionMap = useMemo(
    () => new Map(semesterSessions.map((s) => [s.id, s])),
    [semesterSessions],
  );

  // Guard: if registration was already completed, redirect to confirmation.
  useEffect(() => {
    if (state.batchId && !processing) {
      router.replace(`/register/confirmation?semester=${semesterId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Guard: if cart hold expires, redirect back to the semester page.
  useEffect(() => {
    if (isExpired && !processing && !state.batchId) {
      clear();
      router.replace(`/?semester=${semesterId}&expired=1`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpired]);

  // Fetch pricing quote when participants are available
  useEffect(() => {
    const fullyAssigned = state.participants.filter((p) => p.dancerId);
    if (fullyAssigned.length === 0 || state.isPreview) return;

    // Group session IDs by dancer
    const enrollmentMap = new Map<
      string,
      { dancerName?: string; sessionIds: string[] }
    >();
    for (const p of fullyAssigned) {
      if (!p.dancerId) continue;
      if (!enrollmentMap.has(p.dancerId)) {
        enrollmentMap.set(p.dancerId, { sessionIds: [] });
      }
      enrollmentMap.get(p.dancerId)!.sessionIds.push(p.sessionId);
    }

    // Include new-dancer name overrides
    for (const p of state.participants) {
      if (!p.dancerId || !p.newDancer) continue;
      const entry = enrollmentMap.get(p.dancerId);
      if (entry && !entry.dancerName) {
        entry.dancerName = `${p.newDancer.firstName} ${p.newDancer.lastName}`;
      }
    }

    const enrollments = Array.from(enrollmentMap.entries()).map(
      ([dancerId, { dancerName, sessionIds }]) => ({
        dancerId,
        dancerName,
        sessionIds,
      }),
    );

    setQuoteLoading(true);
    setQuoteError(null);

    computePricingQuote({
      semesterId,
      enrollments,
      paymentPlanType: "pay_in_full",
      couponCode: appliedCouponCode ?? undefined,
    })
      .then((q) => {
        setQuote(q);
        // Update coupon feedback based on server result
        if (appliedCouponCode) {
          if (q.couponDiscount > 0 && q.appliedCouponName) {
            setCouponFeedback({
              type: "success",
              message: `"${q.appliedCouponName}" applied — ${formatCurrency(q.couponDiscount)} off`,
            });
          } else {
            setCouponFeedback({
              type: "error",
              message: "This coupon code is invalid, expired, or not applicable to your enrollment.",
            });
          }
        }
      })
      .catch((err) => {
        setQuoteError(
          err instanceof Error ? err.message : "Could not load pricing.",
        );
      })
      .finally(() => setQuoteLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.participants, semesterId, appliedCouponCode]);

  async function handleConfirm() {
    setProcessing(true);
    setError(null);

    const fullyAssigned = state.participants.filter((p) => p.dancerId);

    if (sessionIds.length === 0) {
      setError("Your cart is empty. Please go back and add sessions.");
      setProcessing(false);
      return;
    }
    if (fullyAssigned.length === 0) {
      setError("Please assign a dancer to each session before continuing.");
      setProcessing(false);
      return;
    }

    if (state.isPreview) {
      await new Promise((r) => setTimeout(r, 800));
      clear();
      reset();
      router.push(`/register/confirmation?preview=1`);
      return;
    }

    setPaymentIntent("", batchId);

    const creditIdsToApply = applyCredit ? availableCredits.map((c) => c.id) : [];

    const result = await createRegistrations({
      semesterId,
      participants: fullyAssigned.map((p) => ({
        sessionId: p.sessionId,
        dancerId: p.dancerId!,
        newDancer: p.newDancer,
        selectedDayIds: p.selectedDayIds,
      })),
      batchId,
      pricingQuote: quote ?? undefined,
      couponCode: appliedCouponCode ?? undefined,
      creditIdsToApply,
      creditTotal,
    });

    if (!result.success) {
      if (result.priceChanged && result.newQuote) {
        setQuote(result.newQuote);
        setError(
          "Pricing was updated. Please review the new total and confirm again.",
        );
      } else {
        setError(result.error ?? "Registration failed. Please try again.");
      }
      setProcessing(false);
      return;
    }

    if (state.isPreview) {
      // Preview path already returned above — this branch should not be reached
      setProcessing(false);
      return;
    }

    // Registration batch created (pending_payment). Now redirect to EPG HPP.
    const baseAmountDue = quote?.amountDueNow ?? quote?.grandTotal ?? 0;
    const amountAfterCredits = Math.max(0, baseAmountDue - creditTotal);

    const paymentResult = await createEPGPaymentSession({
      batchId: result.batchId ?? batchId,
      amountDueNow: amountAfterCredits,
      semesterId,
      semesterName: "Registration",
    });

    if (paymentResult.error || !paymentResult.paymentSessionUrl) {
      setError(
        paymentResult.error ?? "Could not initiate payment. Please try again.",
      );
      setProcessing(false);
      return;
    }

    // Fire checkout analytics before leaving the site for EPG
    const checkoutItems = state.participants
      .filter((p) => p.dancerId)
      .map((p) => {
        const session = sessionMap.get(p.sessionId);
        return {
          item_id: p.sessionId,
          item_name: session?.name ?? p.sessionId,
          item_category: session?.discipline ?? undefined,
          quantity: 1,
        };
      });
    gaEvent("begin_checkout", {
      currency: "USD",
      value: quote?.grandTotal ?? 0,
      items: checkoutItems,
    });
    gaEvent("add_payment_info", {
      currency: "USD",
      value: quote?.grandTotal ?? 0,
      payment_type: "Credit Card",
      items: checkoutItems,
    });

    // Redirect to EPG HPP — cart/state cleared on confirmation page return
    window.location.href = paymentResult.paymentSessionUrl;
  }

  /* ---------------------------------------------------------------------- */
  /* Render                                                                   */
  /* ---------------------------------------------------------------------- */

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="mb-2">
        <h1
          className="text-3xl font-extrabold tracking-tight mb-1.5"
          style={{
            fontFamily: "var(--pub-font-secondary)",
            color: "var(--pub-text-primary)",
          }}
        >
          Review &amp; Confirm
        </h1>
        <p className="text-sm" style={{ color: "var(--pub-text-muted)" }}>
          Confirm your registration details before completing payment.
        </p>
      </div>

      {/* Cart hold countdown — warn when < 5 minutes remain */}
      {!state.isPreview && secondsRemaining > 0 && secondsRemaining < 300 && (
        <div
          className="rounded-xl px-4 py-3 text-sm font-medium"
          style={{
            background: "rgba(122,74,114,0.08)",
            border: "1px solid var(--plum-200)",
            color: "var(--plum-700)",
          }}
        >
          Your cart reservation expires in {Math.floor(secondsRemaining / 60)}:
          {String(secondsRemaining % 60).padStart(2, "0")}. Complete your
          registration before the hold is released.
        </div>
      )}

      {/* Preview mode banner */}
      {state.isPreview && (
        <div
          className="rounded-xl px-4 py-3 text-sm font-medium"
          style={{
            background: "rgba(122,74,114,0.08)",
            border: "1px solid var(--plum-200)",
            color: "var(--plum-700)",
          }}
        >
          Preview mode — no registration will be saved.
        </div>
      )}

      {/* ══ PRICING BREAKDOWN ══ */}
      {!state.isPreview && (
        <div
          className="bg-white rounded-2xl overflow-hidden"
          style={{
            border: "1px solid var(--pub-border)",
            boxShadow: "var(--pub-shadow-card)",
          }}
        >
          {/* Card header */}
          <div
            className="flex items-center justify-between px-5 py-3.5 border-b"
            style={{
              background: "var(--pub-surface-warm)",
              borderColor: "var(--pub-border)",
            }}
          >
            <div
              className="flex items-center gap-2 text-sm font-bold"
              style={{
                fontFamily: "var(--pub-font-secondary)",
                color: "var(--pub-text-primary)",
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                style={{ color: "var(--plum)" }}
              >
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              Pricing Breakdown
            </div>
            <button
              type="button"
              onClick={() => router.back()}
              className="flex items-center gap-1 text-xs font-semibold transition-opacity hover:opacity-70"
              style={{
                color: "var(--plum)",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit cart
            </button>
          </div>

          {/* Loading */}
          {quoteLoading && (
            <p
              className="px-5 py-4 text-sm"
              style={{ color: "var(--pub-text-faint)" }}
            >
              Calculating pricing…
            </p>
          )}

          {/* Error */}
          {quoteError && (
            <div
              className="mx-5 my-4 rounded-xl px-4 py-3 text-sm"
              style={{
                background: "rgba(122,74,114,0.08)",
                border: "1px solid var(--plum-200)",
                color: "var(--plum-700)",
              }}
            >
              <p className="font-medium">Pricing unavailable</p>
              <p className="mt-1 text-xs">{quoteError}</p>
              <p className="mt-1 text-xs">
                The admin may need to configure tuition rate bands for this
                semester.
              </p>
            </div>
          )}

          {/* Quote */}
          {quote && !quoteLoading && (
            <>
              {quote.perDancer.map((dancer) => {
                const tuitionItems = dancer.lineItems.filter((li) =>
                  li.label.toLowerCase().includes("tuition"),
                );
                const feeItems = dancer.lineItems.filter(
                  (li) => !li.label.toLowerCase().includes("tuition"),
                );
                const subtotal = dancer.lineItems.reduce(
                  (sum, li) => sum + li.amount,
                  0,
                );
                const initial = dancer.dancerName.charAt(0).toUpperCase();
                const firstName = dancer.dancerName.split(" ")[0];

                return (
                  <div
                    key={dancer.dancerId}
                    className="border-b"
                    style={{ borderColor: "var(--pub-border)" }}
                  >
                    {/* Nameplate */}
                    <div className="flex items-center gap-2.5 px-5 pt-4">
                      <div
                        className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold"
                        style={{
                          background: "var(--plum-50)",
                          color: "var(--plum)",
                          fontFamily: "var(--pub-font-secondary)",
                        }}
                      >
                        {initial}
                      </div>
                      <div>
                        <div
                          className="text-sm font-bold"
                          style={{
                            fontFamily: "var(--pub-font-secondary)",
                            color: "var(--pub-text-primary)",
                          }}
                        >
                          {dancer.dancerName}
                        </div>
                        <div
                          className="text-xs capitalize"
                          style={{ color: "var(--pub-text-muted)" }}
                        >
                          {dancer.division.replace("_", " ")} &middot;{" "}
                          {dancer.weeklyClassCount} Class
                          {dancer.weeklyClassCount !== 1 ? "es" : ""} / Week
                        </div>
                      </div>
                    </div>

                    {/* Tuition group */}
                    {tuitionItems.length > 0 && (
                      <>
                        <div
                          className="px-5 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-[0.9px]"
                          style={{ color: "var(--pub-text-faint)" }}
                        >
                          Tuition
                        </div>
                        <div className="px-5">
                          {tuitionItems.map((li, i) => (
                            <div
                              key={i}
                              className="flex justify-between items-start py-2 text-sm gap-3 border-b last:border-b-0"
                              style={{ borderColor: "var(--pub-border-subtle)" }}
                            >
                              <span style={{ color: "var(--pub-text-muted)" }}>
                                {li.label}
                              </span>
                              <span
                                className="font-semibold shrink-0"
                                style={{
                                  color:
                                    li.amount < 0
                                      ? "var(--pub-badge-sage-text)"
                                      : "var(--pub-text-primary)",
                                }}
                              >
                                {formatCurrency(li.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Fees & Add-ons group */}
                    {feeItems.length > 0 && (
                      <>
                        <div
                          className="px-5 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-[0.9px] border-t"
                          style={{
                            color: "var(--pub-text-faint)",
                            borderColor: "var(--pub-border)",
                          }}
                        >
                          Fees &amp; Add-ons
                        </div>
                        <div style={{ background: "var(--pub-surface-warm)" }}>
                          {feeItems.map((li, i) => (
                            <div
                              key={i}
                              className="flex justify-between items-start px-5 py-2 gap-3 border-b last:border-b-0"
                              style={{ borderColor: "var(--pub-border-subtle)" }}
                            >
                              <span
                                className="text-xs"
                                style={{ color: "var(--pub-text-muted)" }}
                              >
                                {li.label}
                              </span>
                              <span
                                className="text-xs font-semibold shrink-0"
                                style={{
                                  color:
                                    li.amount < 0
                                      ? "var(--pub-badge-sage-text)"
                                      : "var(--pub-text-muted)",
                                }}
                              >
                                {formatCurrency(Math.abs(li.amount))}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Dancer subtotal */}
                    <div
                      className="flex justify-between items-center px-5 py-2.5 text-sm border-t"
                      style={{ borderColor: "var(--pub-border-subtle)" }}
                    >
                      <span
                        className="font-semibold"
                        style={{ color: "var(--pub-text-primary)" }}
                      >
                        {firstName} subtotal
                      </span>
                      <span className="font-bold">
                        {formatCurrency(subtotal)}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Family discount */}
              {quote.familyDiscountAmount > 0 && (
                <div
                  className="flex justify-between items-center px-5 py-2.5 text-sm border-t font-bold"
                  style={{
                    background: "#EAF6EF",
                    borderColor: "#C0E8D0",
                    color: "var(--pub-badge-sage-text)",
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                    Family Discount applied
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--pub-font-secondary)",
                      fontSize: "15px",
                    }}
                  >
                    &minus;{formatCurrency(quote.familyDiscountAmount)}
                  </div>
                </div>
              )}

              {/* Coupon discount */}
              {quote.couponDiscount > 0 && (
                <div
                  className="flex justify-between items-center px-5 py-2.5 text-sm border-t font-bold"
                  style={{
                    background: "#EAF6EF",
                    borderColor: "#C0E8D0",
                    color: "var(--pub-badge-sage-text)",
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <polyline points="20 12 20 22 4 22 4 12" />
                      <rect x="2" y="7" width="20" height="5" />
                      <line x1="12" y1="22" x2="12" y2="7" />
                      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                    </svg>
                    {quote.appliedCouponName ?? "Coupon Code"} applied
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--pub-font-secondary)",
                      fontSize: "15px",
                    }}
                  >
                    &minus;{formatCurrency(quote.couponDiscount)}
                  </div>
                </div>
              )}

              {/* Account credits */}
              {availableCredits.length > 0 && (
                <div
                  className="flex flex-wrap items-center justify-between px-5 py-3 border-t gap-3"
                  style={{ borderColor: "var(--pub-border-subtle)" }}
                >
                  <div className="flex items-center gap-2">
                    <input
                      id="apply-credit"
                      type="checkbox"
                      checked={applyCredit}
                      onChange={(e) => setApplyCredit(e.target.checked)}
                      className="w-4 h-4 rounded"
                      style={{ accentColor: "var(--plum)" }}
                    />
                    <label
                      htmlFor="apply-credit"
                      className="text-xs font-semibold cursor-pointer"
                      style={{ color: "var(--pub-text-primary)" }}
                    >
                      Apply account credit
                    </label>
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{
                        background: "var(--pub-badge-sage-bg)",
                        color: "var(--pub-badge-sage-text)",
                      }}
                    >
                      {formatCurrency(availableCredits.reduce((s, c) => s + Number(c.amount), 0))} available
                    </span>
                  </div>
                  {applyCredit && (
                    <span
                      className="text-sm font-bold"
                      style={{ color: "var(--pub-badge-sage-text)" }}
                    >
                      &minus;{formatCurrency(creditTotal)}
                    </span>
                  )}
                </div>
              )}

              {/* Coupon strip — inline */}
              <div
                className="flex flex-wrap items-center gap-2 px-5 py-3 border-t"
                style={{ borderColor: "var(--pub-border-subtle)" }}
              >
                <span
                  className="text-xs font-semibold whitespace-nowrap"
                  style={{ color: "var(--pub-text-muted)" }}
                >
                  Coupon code
                </span>
                <input
                  type="text"
                  value={couponInput}
                  onChange={(e) => {
                    setCouponInput(e.target.value.toUpperCase());
                    if (couponFeedback) setCouponFeedback(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      setAppliedCouponCode(couponInput.trim() || null);
                  }}
                  placeholder="Enter code"
                  className="flex-1 min-w-[120px] px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-[0.5px] focus:outline-none"
                  style={{
                    border: "1.5px solid var(--pub-border)",
                    color: "var(--pub-text-primary)",
                    transition: "border-color .15s, box-shadow .15s",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--plum)";
                    e.currentTarget.style.boxShadow =
                      "0 0 0 3px rgba(122,74,114,0.10)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "var(--pub-border)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setCouponFeedback(null);
                    setAppliedCouponCode(couponInput.trim() || null);
                  }}
                  disabled={quoteLoading || !couponInput.trim()}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
                  style={{
                    border: "1.5px solid var(--pub-border)",
                    color: "var(--pub-text-muted)",
                    background: "white",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--plum-200)";
                    e.currentTarget.style.color = "var(--plum)";
                    e.currentTarget.style.background = "var(--plum-50)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--pub-border)";
                    e.currentTarget.style.color = "var(--pub-text-muted)";
                    e.currentTarget.style.background = "white";
                  }}
                >
                  Apply
                </button>
                {appliedCouponCode && (
                  <button
                    type="button"
                    onClick={() => {
                      setCouponInput("");
                      setAppliedCouponCode(null);
                      setCouponFeedback(null);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs transition-colors"
                    style={{
                      border: "1.5px solid var(--pub-border)",
                      color: "var(--pub-text-muted)",
                      background: "white",
                    }}
                  >
                    Remove
                  </button>
                )}
                {couponFeedback && (
                  <p
                    className="w-full text-xs font-medium mt-0.5"
                    style={{
                      color:
                        couponFeedback.type === "success"
                          ? "var(--pub-badge-sage-text)"
                          : "#dc2626",
                    }}
                  >
                    {couponFeedback.message}
                  </p>
                )}
              </div>

              {/* Grand total */}
              <div
                className="flex justify-between items-center px-5 py-4 border-t-2"
                style={{
                  borderColor: "var(--pub-border)",
                  background: "var(--pub-surface-warm)",
                }}
              >
                <div>
                  <div
                    className="text-[15px] font-bold"
                    style={{ color: "var(--pub-text-primary)" }}
                  >
                    Total Due
                  </div>
                  <div
                    className="text-xs mt-0.5"
                    style={{ color: "var(--pub-text-muted)" }}
                  >
                    Final amount at payment
                  </div>
                </div>
                <div
                  className="font-extrabold"
                  style={{
                    fontFamily: "var(--pub-font-secondary)",
                    fontSize: "26px",
                    color: "var(--plum)",
                  }}
                >
                  {formatCurrency(Math.max(0, quote.grandTotal - creditTotal))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══ SESSIONS & PARTICIPANTS (combined) ══ */}
      <div
        className="bg-white rounded-2xl overflow-hidden"
        style={{
          border: "1px solid var(--pub-border)",
          boxShadow: "var(--pub-shadow-card)",
        }}
      >
        {/* Card header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b"
          style={{
            background: "var(--pub-surface-warm)",
            borderColor: "var(--pub-border)",
          }}
        >
          <div
            className="flex items-center gap-2 text-sm font-bold"
            style={{
              fontFamily: "var(--pub-font-secondary)",
              color: "var(--pub-text-primary)",
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              style={{ color: "var(--plum)" }}
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Sessions &amp; Participants
          </div>
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-1 text-xs font-semibold transition-opacity hover:opacity-70"
            style={{
              color: "var(--plum)",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit
          </button>
        </div>

        {state.participants.map((p, idx) => {
          const session = sessionMap.get(p.sessionId);
          const dancerLabel = p.newDancer
            ? `${p.newDancer.firstName} ${p.newDancer.lastName}`
            : dancerNames.get(p.dancerId ?? "") ?? "—";
          const dancerInitial = dancerLabel.charAt(0).toUpperCase();
          const disc = getDisciplineDisc(session);

          const dayStr = session?.scheduleDate
            ? new Date(
                session.scheduleDate + "T00:00:00",
              ).toLocaleDateString("en-US", { weekday: "long" }) + "s"
            : session?.daysOfWeek?.[0]
              ? session.daysOfWeek[0].charAt(0).toUpperCase() +
                session.daysOfWeek[0].slice(1).toLowerCase() +
                "s"
              : null;
          const timeStr =
            session?.startTime && session?.endTime
              ? `${formatTime(session.startTime)} – ${formatTime(session.endTime)}`
              : null;

          const isLast = idx === state.participants.length - 1;

          return (
            <div
              key={p.sessionId}
              className={isLast ? "" : "border-b"}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                borderColor: "var(--pub-border-subtle)",
              }}
            >
              {/* Session info */}
              <div
                className="flex gap-3 p-4"
                style={{ borderRight: "1px solid var(--pub-border-subtle)" }}
              >
                <div
                  className="w-10 h-10 rounded-lg shrink-0 flex flex-col items-center justify-center text-center leading-tight"
                  style={{
                    background: "var(--plum-50)",
                    color: "var(--plum)",
                    fontSize: "9px",
                    fontWeight: 800,
                    letterSpacing: "0.3px",
                  }}
                >
                  <span>{disc.line1}</span>
                  {disc.line2 && <span>{disc.line2}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm font-bold mb-1.5"
                    style={{
                      fontFamily: "var(--pub-font-secondary)",
                      color: "var(--pub-text-primary)",
                    }}
                  >
                    {session?.name ?? p.sessionId}
                  </div>
                  {(dayStr || timeStr) && (
                    <div
                      className="flex items-center gap-1.5 text-xs mb-0.5"
                      style={{ color: "var(--pub-text-muted)" }}
                    >
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        style={{ color: "var(--pub-text-faint)", flexShrink: 0 }}
                      >
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      {[dayStr, timeStr].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  {session?.location && (
                    <div
                      className="flex items-center gap-1.5 text-xs mb-0.5"
                      style={{ color: "var(--pub-text-muted)" }}
                    >
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        style={{ color: "var(--pub-text-faint)", flexShrink: 0 }}
                      >
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      {session.location}
                    </div>
                  )}
                  {session?.instructorName && (
                    <div
                      className="flex items-center gap-1 text-[11px] mt-2 pt-2 border-t"
                      style={{
                        color: "var(--pub-text-muted)",
                        borderColor: "var(--pub-border-subtle)",
                      }}
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        style={{ color: "var(--pub-text-faint)" }}
                      >
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      Instructor: {session.instructorName}
                    </div>
                  )}
                </div>
              </div>

              {/* Dancer panel */}
              <div
                className="flex flex-col items-center justify-center gap-1.5 px-4 py-4"
                style={{
                  background: "var(--pub-surface-warm)",
                  minWidth: "110px",
                }}
              >
                <div
                  className="text-[10px] font-semibold uppercase tracking-[0.6px]"
                  style={{ color: "var(--pub-text-faint)" }}
                >
                  Dancer
                </div>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{
                    background: "var(--plum-50)",
                    border: "2px solid var(--plum-100)",
                    color: "var(--plum)",
                    fontFamily: "var(--pub-font-secondary)",
                  }}
                >
                  {dancerInitial}
                </div>
                <div
                  className="text-xs font-bold text-center leading-tight"
                  style={{ color: "var(--pub-text-primary)" }}
                >
                  {dancerLabel}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ══ PAYMENT ══ */}
      <div
        className="bg-white rounded-2xl overflow-hidden"
        style={{
          border: "1px solid var(--pub-border)",
          boxShadow: "var(--pub-shadow-card)",
        }}
      >
        {/* Card header */}
        <div
          className="flex items-center gap-2 px-5 py-3.5 border-b text-sm font-bold"
          style={{
            fontFamily: "var(--pub-font-secondary)",
            color: "var(--pub-text-primary)",
            background: "var(--pub-surface-warm)",
            borderColor: "var(--pub-border)",
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            style={{ color: "var(--plum)" }}
          >
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
          </svg>
          Payment
        </div>

        {state.isPreview ? (
          <p className="px-5 py-4 text-sm" style={{ color: "var(--pub-text-muted)" }}>
            In preview mode, payment is simulated. Click confirm to see the
            success screen.
          </p>
        ) : (
          <>
            {/* Elavon provider row */}
            <div
              className="flex items-center gap-3.5 px-5 py-4 border-b"
              style={{ borderColor: "var(--pub-border-subtle)" }}
            >
              <div
                className="w-11 h-11 rounded-lg shrink-0 flex items-center justify-center"
                style={{
                  background: "var(--pub-surface-warm)",
                  border: "1px solid var(--pub-border)",
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  style={{ color: "var(--plum)" }}
                >
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                  <line x1="1" y1="10" x2="23" y2="10" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="text-sm font-bold mb-0.5"
                  style={{ color: "var(--pub-text-primary)" }}
                >
                  Secure Payment via Elavon
                </div>
                <div
                  className="text-xs leading-relaxed"
                  style={{ color: "var(--pub-text-muted)" }}
                >
                  You&apos;ll be redirected to a secure Elavon page to complete
                  your purchase. Card details are never stored on this portal.
                </div>
              </div>
              <div
                className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold"
                style={{
                  background: "var(--pub-badge-sage-bg)",
                  color: "var(--pub-badge-sage-text)",
                }}
              >
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                Secure
              </div>
            </div>

            {/* Payment options */}
            <div className="grid grid-cols-2">
              <div className="flex items-start gap-2.5 p-5">
                <div
                  className="w-8 h-8 rounded shrink-0 flex items-center justify-center mt-0.5"
                  style={{ background: "var(--plum-50)", color: "var(--plum)" }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                    <line x1="1" y1="10" x2="23" y2="10" />
                  </svg>
                </div>
                <div>
                  <div
                    className="text-xs font-bold mb-0.5"
                    style={{ color: "var(--pub-text-primary)" }}
                  >
                    Pay in Full
                  </div>
                  <div
                    className="text-[11px] leading-relaxed"
                    style={{ color: "var(--pub-text-muted)" }}
                  >
                    Single payment of{" "}
                    {quote
                      ? formatCurrency(Math.max(0, quote.grandTotal - creditTotal))
                      : "—"}{" "}
                    at checkout.
                  </div>
                </div>
              </div>
              <div
                className="flex items-start gap-2.5 p-5"
                style={{ borderLeft: "1px solid var(--pub-border)" }}
              >
                <div
                  className="w-8 h-8 rounded shrink-0 flex items-center justify-center mt-0.5"
                  style={{ background: "var(--plum-50)", color: "var(--plum)" }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <line x1="12" y1="1" x2="12" y2="23" />
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                </div>
                <div>
                  <div
                    className="text-xs font-bold mb-0.5"
                    style={{ color: "var(--pub-text-primary)" }}
                  >
                    Installment Plan
                  </div>
                  <div
                    className="text-[11px] leading-relaxed"
                    style={{ color: "var(--pub-text-muted)" }}
                  >
                    Split your balance into monthly payments.{" "}
                    <span style={{ color: "var(--pub-text-primary)", fontWeight: 600 }}>
                      $5/month service fee applies.
                    </span>{" "}
                    Select at checkout on the next page.
                  </div>
                </div>
              </div>
            </div>

            {/* Payment schedule (if multi-installment) */}
            {quote && quote.paymentSchedule.length > 1 && (
              <div
                className="px-5 py-4 border-t"
                style={{ borderColor: "var(--pub-border-subtle)" }}
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.9px] mb-2.5"
                  style={{ color: "var(--pub-text-faint)" }}
                >
                  Payment Schedule
                </p>
                <div className="space-y-1.5">
                  {quote.paymentSchedule.map((inst) => (
                    <div
                      key={inst.installmentNumber}
                      className="flex justify-between text-sm"
                      style={{ color: "var(--pub-text-muted)" }}
                    >
                      <span>
                        Payment {inst.installmentNumber} &mdash;{" "}
                        {new Date(
                          inst.dueDate + "T00:00:00",
                        ).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      <span>{formatCurrency(inst.amountDue)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
          }}
        >
          {error}
        </div>
      )}

      {/* CTA row */}
      <div
        className="grid gap-3 mt-2"
        style={{ gridTemplateColumns: "1fr 2fr" }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          disabled={processing}
          className="inline-flex items-center justify-center gap-1.5 py-3 px-5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
          style={{
            border: "1.5px solid var(--pub-border)",
            background: "white",
            color: "var(--pub-text-muted)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--plum-200)";
            e.currentTarget.style.color = "var(--plum)";
            e.currentTarget.style.background = "var(--plum-50)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--pub-border)";
            e.currentTarget.style.color = "var(--pub-text-muted)";
            e.currentTarget.style.background = "white";
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={processing}
          className="inline-flex items-center justify-center gap-2 py-3 px-7 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-60"
          style={{
            background: "var(--plum)",
            border: "2px solid var(--plum)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--plum-700)";
            e.currentTarget.style.borderColor = "var(--plum-700)";
            e.currentTarget.style.boxShadow = "var(--pub-shadow-plum)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--plum)";
            e.currentTarget.style.borderColor = "var(--plum)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          {processing
            ? "Processing…"
            : state.isPreview
              ? "Simulate Registration"
              : "Confirm Registration"}
          {!processing && (
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          )}
        </button>
      </div>

      {/* Security note */}
      <div
        className="flex items-center justify-center gap-1.5 text-[11px] mt-1"
        style={{ color: "var(--pub-text-faint)" }}
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        Your information is encrypted and secure. Powered by Elavon.
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

function PaymentPageInner() {
  const params = useSearchParams();
  const semesterId = params.get("semester") ?? "";

  return (
    <CartRestoreGuard semesterId={semesterId}>
      {/* <RegistrationProvider semesterId={semesterId}> */}
      <PaymentContent semesterId={semesterId} />
      {/* </RegistrationProvider> */}
    </CartRestoreGuard>
  );
}

export default function PaymentPage() {
  return (
    <Suspense>
      <PaymentPageInner />
    </Suspense>
  );
}
