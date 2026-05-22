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
import { updateUserProfile } from "@/app/(user-facing)/profile/actions/updateUserProfile";
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

/**
 * Discipline icon mapping — kept in sync with the participants step
 * ([app/(user-facing)/register/participants/page.tsx]) so each class shows
 * the same shape + color treatment throughout the registration flow.
 */
type DisciplineKey =
  | "ballet" | "tap" | "broadway" | "hiphop" | "contemporary"
  | "technique" | "pointe" | "jazz" | "lyrical" | "acro" | "default";

const DISCIPLINE_STYLES: Record<DisciplineKey, { bg: string; fg: string }> = {
  ballet:       { bg: "#F7DDE6", fg: "#A8366B" },
  tap:          { bg: "#F0E0BC", fg: "#7A5010" },
  broadway:     { bg: "#ECDBF0", fg: "#6B3A78" },
  hiphop:       { bg: "#DCE2EA", fg: "#3A4858" },
  contemporary: { bg: "#E0DAF0", fg: "#4A3F8C" },
  technique:    { bg: "#D9E8CF", fg: "#3D6A3A" },
  pointe:       { bg: "#EAD0DC", fg: "#8E2D58" },
  jazz:         { bg: "#F8D6C0", fg: "#A8482A" },
  lyrical:      { bg: "#D2E8DD", fg: "#2E6A50" },
  acro:         { bg: "#CFEAEA", fg: "#2A6878" },
  default:      { bg: "#EBDFD9", fg: "#6D5A53" },
};

function disciplineKey(d?: string | null): DisciplineKey {
  if (!d) return "default";
  const s = d.toLowerCase().replace(/[\s_-]+/g, "");
  if (s.startsWith("ballet")) return "ballet";
  if (s.startsWith("tap")) return "tap";
  if (s.startsWith("broadway")) return "broadway";
  if (s.startsWith("hiphop") || s === "hip") return "hiphop";
  if (s.startsWith("contemp")) return "contemporary";
  if (s.startsWith("tech")) return "technique";
  if (s.startsWith("pointe")) return "pointe";
  if (s.startsWith("jazz")) return "jazz";
  if (s.startsWith("lyric")) return "lyrical";
  if (s.startsWith("acro")) return "acro";
  return "default";
}

function DisciplineMark({ k }: { k: DisciplineKey }) {
  const stroke = {
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
  };
  return (
    <svg viewBox="0 0 24 24" width={15} height={15}>
      {k === "ballet"       && <circle {...stroke} cx="12" cy="12" r="6" />}
      {k === "tap"          && <rect   {...stroke} x="6" y="6" width="12" height="12" rx="1.5" />}
      {k === "broadway"     && <path   {...stroke} d="M12 5 L 19 18 L 5 18 Z" />}
      {k === "hiphop"       && <path   {...stroke} d="M12 4.5 L 19.5 12 L 12 19.5 L 4.5 12 Z" />}
      {k === "contemporary" && <path   {...stroke} d="M12 4 L 19 8 L 19 16 L 12 20 L 5 16 L 5 8 Z" />}
      {k === "technique"    && <path   {...stroke} d="M12 4 L 19.5 9.5 L 16.5 18.5 L 7.5 18.5 L 4.5 9.5 Z" />}
      {k === "pointe"       && <><circle {...stroke} cx="12" cy="12" r="6.5" /><circle {...stroke} cx="12" cy="12" r="2.5" /></>}
      {k === "jazz"         && <path   {...stroke} d="M12 4 L 13.5 10.5 L 20 12 L 13.5 13.5 L 12 20 L 10.5 13.5 L 4 12 L 10.5 10.5 Z" />}
      {k === "lyrical"      && <path   {...stroke} d="M10 5 H 14 V 10 H 19 V 14 H 14 V 19 H 10 V 14 H 5 V 10 H 10 Z" />}
      {k === "acro"         && <path   {...stroke} d="M5 16 A 7 7 0 0 1 19 16 Z" />}
      {k === "default"      && <circle {...stroke} cx="12" cy="12" r="6" />}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Payment content                                                             */
/* -------------------------------------------------------------------------- */

export function PaymentContent({ semesterId }: { semesterId: string }) {
  const router = useRouter();
  const { state, setPaymentIntent, reset } = useRegistration();
  const { sessionIds, items: cartItems, clear, secondsRemaining, isExpired } = useCart();

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<PricingQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  // Payment plan chosen by the parent. "installments" re-prices the quote via
  // the engine's "auto_pay_monthly" path and routes the batch through the
  // stored-card / recurring-charge flow. See createRegistrations.ts.
  const [planType, setPlanType] = useState<"pay_in_full" | "installments">(
    "pay_in_full",
  );
  // Whether this semester is configured to allow installments
  // (semester_payment_plans.type === "installments"). Gates the picker so
  // families can only choose a plan the admin actually enabled.
  const [installmentsAllowed, setInstallmentsAllowed] = useState(false);
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

  // Billing address
  const [billingAddress, setBillingAddress] = useState<{
    address_line1: string;
    address_line2: string;
    city: string;
    state: string;
    zipcode: string;
  } | null>(null);
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressDraft, setAddressDraft] = useState({ address_line1: "", address_line2: "", city: "", state: "", zipcode: "" });
  const [addressError, setAddressError] = useState<string | null>(null);
  const [savingAddress, setSavingAddress] = useState(false);

  // Stable batchId: same cart + retry = same ID, so createRegistrations()
  // idempotency guard returns existing registrations without duplicate DB inserts.
  // If cart assignments change the fingerprint shifts, a new ID is generated,
  // and the stale batch is cleaned up by createRegistrations() on the next call.
  const batchStorageKey = `aydt_payment_batch_${semesterId}`;
  const computeBatchFingerprint = () =>
    state.participants
      .filter((p) => p.dancerId)
      .map((p) => `${p.dancerId}:${p.sessionId}`)
      .sort()
      .join("|");

  const [batchId, setBatchId] = useState<string>(() => {
    const fingerprint = computeBatchFingerprint();
    try {
      const stored = JSON.parse(sessionStorage.getItem(batchStorageKey) ?? "null");
      if (stored?.fingerprint === fingerprint && stored?.batchId) {
        return stored.batchId as string;
      }
    } catch {}
    const id = crypto.randomUUID();
    try {
      sessionStorage.setItem(batchStorageKey, JSON.stringify({ batchId: id, fingerprint }));
    } catch {}
    return id;
  });

  // Mint a fresh batchId, overwriting the cached one. Used when the cached
  // batchId points at a batch that's no longer payable (BATCH_STALE) so the
  // next createRegistrations() call creates a clean pending batch instead of
  // dead-ending on "not in a payable state".
  function regenerateBatchId(): string {
    const id = crypto.randomUUID();
    try {
      sessionStorage.setItem(
        batchStorageKey,
        JSON.stringify({ batchId: id, fingerprint: computeBatchFingerprint() }),
      );
    } catch {}
    setBatchId(id);
    return id;
  }

  const semesterMode = state.isPreview ? "preview" : "live";

  // Fetch session details for display
  useEffect(() => {
    getSemesterForDisplay(semesterId, semesterMode).then((s) => {
      setSemesterSessions(s.sessions);
      setInstallmentsAllowed(s.paymentPlan?.type === "installments");
    });
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

  // Fetch billing address from user profile
  useEffect(() => {
    if (state.isPreview) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("users")
        .select("address_line1, address_line2, city, state, zipcode")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.address_line1) {
            setBillingAddress({
              address_line1: data.address_line1 ?? "",
              address_line2: data.address_line2 ?? "",
              city: data.city ?? "",
              state: data.state ?? "",
              zipcode: data.zipcode ?? "",
            });
          }
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
      paymentPlanType:
        planType === "installments" ? "auto_pay_monthly" : "pay_in_full",
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
  }, [state.participants, semesterId, appliedCouponCode, planType]);

  async function handleSaveAddress() {
    setAddressError(null);
    if (!addressDraft.address_line1.trim()) return setAddressError("Street address is required.");
    if (!addressDraft.city.trim()) return setAddressError("City is required.");
    if (!addressDraft.state.trim()) return setAddressError("State is required.");
    if (!addressDraft.zipcode.trim()) return setAddressError("ZIP code is required.");
    setSavingAddress(true);
    try {
      // Address-only save — partial update, so name/phone are left untouched.
      await updateUserProfile({ ...addressDraft });
      setBillingAddress({ ...addressDraft });
      setEditingAddress(false);
    } catch (e) {
      setAddressError(e instanceof Error ? e.message : "Failed to save address.");
    } finally {
      setSavingAddress(false);
    }
  }

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

    const creditIdsToApply = applyCredit ? availableCredits.map((c) => c.id) : [];

    // Phase 3b-ii: enrich each participant with mode metadata derived from the
    // cart item that contributed its sessionId. Standard/tiered participants
    // need scheduleId (+ classTierId for tiered) so the server can route the
    // row to schedule_enrollments. Drop-in participants leave mode undefined
    // and fall through the legacy registrations path.
    const enrichedParticipants = fullyAssigned.map((p) => {
      const owner = cartItems.find((it) => {
        if (it.mode === "drop-in") return (it.selectedDateIds ?? []).includes(p.sessionId);
        return it.sessionId === p.sessionId;
      });
      const session = sessionMap.get(p.sessionId);
      const base = {
        sessionId: p.sessionId,
        dancerId: p.dancerId!,
        newDancer: p.newDancer,
        selectedDayIds: p.selectedDayIds,
      };
      if (!owner) return base;
      if (owner.mode === "drop-in") {
        return { ...base, mode: "drop-in" as const, classId: owner.classId };
      }
      return {
        ...base,
        mode: owner.mode,
        scheduleId: session?.scheduleId ?? undefined,
        classTierId: owner.mode === "tiered" ? owner.classTierId : undefined,
        classId: owner.classId,
      };
    });

    // create → pay. If the cached batchId points at a stale (failed/cancelled)
    // batch, mint a fresh one and retry exactly once so the user never
    // dead-ends on "not in a payable state". `attempt` caps the retry at one.
    let activeBatchId = batchId;
    for (let attempt = 0; attempt < 2; attempt++) {
      setPaymentIntent("", activeBatchId);

      const result = await createRegistrations({
        semesterId,
        participants: enrichedParticipants,
        batchId: activeBatchId,
        pricingQuote: quote ?? undefined,
        couponCode: appliedCouponCode ?? undefined,
        creditIdsToApply,
        creditTotal,
        paymentPlanType: planType,
      });

      if (!result.success) {
        if (result.code === "BATCH_STALE" && attempt === 0) {
          activeBatchId = regenerateBatchId();
          continue; // retry once with a fresh batchId
        }
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

      // Registration batch created (pending_payment). Now redirect to EPG HPP.
      const baseAmountDue = quote?.amountDueNow ?? quote?.grandTotal ?? 0;
      const amountAfterCredits = Math.max(0, baseAmountDue - creditTotal);

      const paymentResult = await createEPGPaymentSession({
        batchId: result.batchId ?? activeBatchId,
        amountDueNow: amountAfterCredits,
        semesterId,
        semesterName: "Registration",
      });

      if (paymentResult.code === "BATCH_STALE" && attempt === 0) {
        activeBatchId = regenerateBatchId();
        continue; // retry once with a fresh batchId
      }

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
      return;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Render                                                                   */
  /* ---------------------------------------------------------------------- */

  // Group participants by dancer, with one entry per cart item (drop-in cart
  // items contribute multiple participant rows; we dedupe by cart item id so
  // a 4-date drop-in renders as one class card).
  const dancerGroups = useMemo(() => {
    type Group = {
      dancerId: string;
      dancerName: string;
      classes: Array<{
        key: string;
        cartItem: typeof cartItems[number] | undefined;
        session: PublicSession | undefined;
      }>;
    };
    const groups = new Map<string, Group>();
    for (const p of state.participants) {
      if (!p.dancerId) continue;
      const dancerLabel = p.newDancer
        ? `${p.newDancer.firstName} ${p.newDancer.lastName}`
        : dancerNames.get(p.dancerId) ?? "—";
      let g = groups.get(p.dancerId);
      if (!g) {
        g = { dancerId: p.dancerId, dancerName: dancerLabel, classes: [] };
        groups.set(p.dancerId, g);
      }
      const owner = cartItems.find((it) =>
        it.mode === "drop-in"
          ? (it.selectedDateIds ?? []).includes(p.sessionId)
          : it.sessionId === p.sessionId,
      );
      const key = owner?.id ?? p.sessionId;
      if (g.classes.some((c) => c.key === key)) continue;
      g.classes.push({
        key,
        cartItem: owner,
        session: sessionMap.get(p.sessionId),
      });
    }
    return Array.from(groups.values());
  }, [state.participants, cartItems, sessionMap, dancerNames]);

  function renderClassRow(c: {
    key: string;
    cartItem: typeof cartItems[number] | undefined;
    session: PublicSession | undefined;
  }) {
    const session = c.session;
    const item = c.cartItem;
    const disc = disciplineKey(session?.discipline);
    const format: "tier" | "dropin" | "standard" =
      item?.mode === "drop-in"
        ? "dropin"
        : item?.mode === "tiered"
          ? "tier"
          : "standard";
    const stripeColor =
      format === "tier"
        ? "var(--cd-fmt-tier-stripe)"
        : format === "dropin"
          ? "var(--cd-fmt-dropin-stripe)"
          : "var(--plum-200)";
    const pillBg =
      format === "tier"
        ? "var(--cd-fmt-tier-bg)"
        : format === "dropin"
          ? "var(--cd-fmt-dropin-bg)"
          : "transparent";
    const pillFg =
      format === "tier"
        ? "var(--cd-fmt-tier-text)"
        : format === "dropin"
          ? "var(--cd-fmt-dropin-text)"
          : "var(--pub-text-muted)";

    const pillLabel =
      format === "tier"
        ? item?.tierLabel ?? null
        : format === "dropin"
          ? `Drop-in · ${(item?.selectedDateIds ?? []).length} session${
              (item?.selectedDateIds?.length ?? 0) === 1 ? "" : "s"
            }`
          : null;

    const dayStr = session?.scheduleDate
      ? new Date(session.scheduleDate + "T00:00:00").toLocaleDateString(
          "en-US",
          { weekday: "long" },
        ) + "s"
      : session?.daysOfWeek?.[0]
        ? session.daysOfWeek[0].charAt(0).toUpperCase() +
          session.daysOfWeek[0].slice(1).toLowerCase() +
          "s"
        : null;
    const timeStr =
      session?.startTime && session?.endTime
        ? `${formatTime(session.startTime)} – ${formatTime(session.endTime)}`
        : null;

    return (
      <div
        key={c.key}
        className="flex rounded-[10px] overflow-hidden mb-2.5 bg-white"
        style={{ border: "1px solid var(--pub-border-subtle)" }}
      >
        <div
          className="shrink-0"
          style={{ width: "4px", background: stripeColor }}
        />
        <div
          className="m-3 ml-3 rounded-[7px] shrink-0 self-start flex items-center justify-center"
          style={{
            width: "28px",
            height: "28px",
            background: DISCIPLINE_STYLES[disc].bg,
            color: DISCIPLINE_STYLES[disc].fg,
          }}
        >
          <DisciplineMark k={disc} />
        </div>
        <div className="flex-1 min-w-0 py-3 pr-3.5 pl-1">
          <div className="flex items-start justify-between gap-2.5">
            <div
              className="text-sm font-bold leading-tight"
              style={{ color: "var(--pub-text-primary)" }}
            >
              {session?.name ?? item?.className ?? "Class"}
            </div>
            {pillLabel && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold shrink-0"
                style={{
                  background: pillBg,
                  color: pillFg,
                  letterSpacing: "0.02em",
                }}
              >
                <span
                  className="inline-block rounded-full"
                  style={{
                    width: "5px",
                    height: "5px",
                    background: "currentColor",
                  }}
                />
                {pillLabel}
              </span>
            )}
          </div>
          <div
            className="flex flex-wrap gap-x-2.5 gap-y-1 mt-1 text-[11.5px]"
            style={{ color: "var(--pub-text-muted)" }}
          >
            {(dayStr || timeStr) && (
              <span>{[dayStr, timeStr].filter(Boolean).join(" · ")}</span>
            )}
            {session?.location && <span>{session.location}</span>}
            {session?.instructorName && <span>{session.instructorName}</span>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {/* Page header */}
      <div className="mb-1">
        <h1
          className="text-3xl font-extrabold tracking-tight mb-1.5"
          style={{
            fontFamily: "var(--pub-font-secondary)",
            color: "var(--pub-text-primary)",
          }}
        >
          Review &amp; Confirm
        </h1>
        <p
          className="text-sm max-w-[540px]"
          style={{ color: "var(--pub-text-muted)" }}
        >
          Confirm your registration details before completing payment. Payment
          is processed securely by Elavon.
        </p>
      </div>

      {/* Edit note */}
      <div
        className="flex items-center gap-2 px-3.5 py-2.5 rounded-[9px] text-xs"
        style={{
          background: "var(--pub-surface-warm)",
          color: "var(--pub-text-faint)",
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ opacity: 0.7, flexShrink: 0 }}
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4M12 16v.01" />
        </svg>
        <span>
          Need to make changes? Use the steps above to go back.
        </span>
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

      {/* Loading / error states for pricing quote */}
      {!state.isPreview && quoteLoading && (
        <div
          className="bg-white rounded-2xl px-5 py-4 text-sm"
          style={{
            border: "1px solid var(--pub-border)",
            boxShadow: "var(--pub-shadow-card)",
            color: "var(--pub-text-faint)",
          }}
        >
          Calculating pricing…
        </div>
      )}
      {!state.isPreview && quoteError && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
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

      {/* ══ PER-DANCER CARDS (sessions + pricing rollup combined) ══ */}
      {!state.isPreview && quote && !quoteLoading && (
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
            const group = dancerGroups.find((g) => g.dancerId === dancer.dancerId);
            const classCount = group?.classes.length ?? 0;

            return (
              <section
                key={dancer.dancerId}
                className="bg-white rounded-2xl overflow-hidden"
                style={{
                  border: "1px solid var(--pub-border-subtle)",
                  boxShadow: "var(--pub-shadow-card)",
                }}
              >
                {/* Dancer head */}
                <div
                  className="flex items-center justify-between gap-3.5 px-5 py-4 border-b"
                  style={{
                    background: "var(--pub-surface-warm)",
                    borderColor: "var(--pub-border-subtle)",
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-sm font-bold text-white"
                      style={{
                        background: "var(--plum)",
                        fontFamily: "var(--pub-font-secondary)",
                      }}
                    >
                      {initial}
                    </div>
                    <div className="min-w-0">
                      <div
                        className="text-[16px] font-bold leading-tight"
                        style={{
                          fontFamily: "var(--pub-font-secondary)",
                          color: "var(--pub-text-primary)",
                        }}
                      >
                        {dancer.dancerName}
                      </div>
                      <div
                        className="text-xs capitalize mt-0.5"
                        style={{ color: "var(--pub-text-muted)" }}
                      >
                        {dancer.division.replace("_", " ")} &middot;{" "}
                        {dancer.weeklyClassCount} Class
                        {dancer.weeklyClassCount !== 1 ? "es" : ""} / Week
                      </div>
                    </div>
                  </div>
                  {classCount > 0 && (
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-bold shrink-0"
                      style={{
                        background: "var(--plum-100)",
                        color: "var(--plum-700)",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {classCount} class{classCount === 1 ? "" : "es"}
                    </span>
                  )}
                </div>

                {/* Classes list */}
                {group && group.classes.length > 0 && (
                  <div className="px-5 pt-3.5 pb-1">
                    {group.classes.map(renderClassRow)}
                  </div>
                )}

                {/* Rollup */}
                <div
                  className="px-5 pb-3.5 pt-1"
                  style={{ borderTop: "1px dashed var(--pub-border-subtle)" }}
                >
                  {tuitionItems.length > 0 && (
                    <>
                      <div
                        className="text-[10px] font-bold uppercase mt-3.5 mb-2"
                        style={{
                          color: "var(--pub-text-faint)",
                          letterSpacing: "0.09em",
                        }}
                      >
                        Tuition
                      </div>
                      {tuitionItems.map((li, i) => (
                        <div
                          key={i}
                          className="flex justify-between items-baseline py-1 text-[13px]"
                          style={{ color: "var(--pub-text-muted)" }}
                        >
                          <span className="font-medium">{li.label}</span>
                          <span
                            className="tabular-nums shrink-0"
                            style={{
                              color:
                                li.amount < 0
                                  ? "var(--pub-badge-sage-text)"
                                  : "var(--pub-text-muted)",
                            }}
                          >
                            {formatCurrency(li.amount)}
                          </span>
                        </div>
                      ))}
                    </>
                  )}

                  {feeItems.length > 0 && (
                    <>
                      <div
                        className="text-[10px] font-bold uppercase mt-3.5 mb-2"
                        style={{
                          color: "var(--pub-text-faint)",
                          letterSpacing: "0.09em",
                        }}
                      >
                        Fees &amp; Add-ons
                      </div>
                      {feeItems.map((li, i) => (
                        <div
                          key={i}
                          className="flex justify-between items-baseline py-1 text-[13px]"
                          style={{ color: "var(--pub-text-muted)" }}
                        >
                          <span className="font-medium">{li.label}</span>
                          <span
                            className="tabular-nums shrink-0"
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
                    </>
                  )}

                  <div
                    className="flex justify-between items-baseline pt-2.5 mt-1.5 text-sm font-bold"
                    style={{
                      borderTop: "1px solid var(--pub-border-subtle)",
                      color: "var(--pub-text-primary)",
                    }}
                  >
                    <span>{firstName} subtotal</span>
                    <span className="tabular-nums">
                      {formatCurrency(subtotal)}
                    </span>
                  </div>
                </div>
              </section>
            );
          })}

          {/* Family Discount */}
          {quote.familyDiscountAmount > 0 && (
            <div
              className="flex items-center justify-between gap-3 px-[18px] py-3.5 rounded-xl"
              style={{
                background: "#EBF3E5",
                border: "1px solid #DBEACE",
                color: "var(--pub-badge-sage-text)",
              }}
            >
              <div className="flex items-center gap-2.5">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    d="M12 21s-7-5-7-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 7-7 12-7 12z"
                    fill="currentColor"
                    fillOpacity="0.18"
                  />
                </svg>
                <div>
                  <div className="text-sm font-bold">Family Discount applied</div>
                  <div
                    className="text-[11.5px] mt-0.5"
                    style={{ opacity: 0.85 }}
                  >
                    $50 off when 2+ dancers register together
                  </div>
                </div>
              </div>
              <div
                className="font-extrabold tabular-nums"
                style={{ fontSize: "16px" }}
              >
                &minus;{formatCurrency(quote.familyDiscountAmount)}
              </div>
            </div>
          )}

          {/* Coupon (applied) */}
          {quote.couponDiscount > 0 && (
            <div
              className="flex items-center justify-between gap-3 px-[18px] py-3.5 rounded-xl"
              style={{
                background: "#EBF3E5",
                border: "1px solid #DBEACE",
                color: "var(--pub-badge-sage-text)",
              }}
            >
              <div className="flex items-center gap-2.5">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="20 12 20 22 4 22 4 12" />
                  <rect x="2" y="7" width="20" height="5" />
                  <line x1="12" y1="22" x2="12" y2="7" />
                </svg>
                <div className="text-sm font-bold">
                  {quote.appliedCouponName ?? "Coupon"} applied
                </div>
              </div>
              <div
                className="font-extrabold tabular-nums"
                style={{ fontSize: "16px" }}
              >
                &minus;{formatCurrency(quote.couponDiscount)}
              </div>
            </div>
          )}

          {/* Account credits */}
          {availableCredits.length > 0 && (
            <div
              className="flex flex-wrap items-center justify-between gap-3 px-[18px] py-3.5 rounded-xl bg-white"
              style={{ border: "1px solid var(--pub-border-subtle)" }}
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
                  className="text-[13px] font-semibold cursor-pointer"
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
                  {formatCurrency(
                    availableCredits.reduce((s, c) => s + Number(c.amount), 0),
                  )}{" "}
                  available
                </span>
              </div>
              {applyCredit && (
                <span
                  className="text-sm font-bold tabular-nums"
                  style={{ color: "var(--pub-badge-sage-text)" }}
                >
                  &minus;{formatCurrency(creditTotal)}
                </span>
              )}
            </div>
          )}

          {/* Coupon input */}
          <div
            className="flex flex-wrap items-center gap-3 px-[18px] py-3.5 rounded-xl bg-white"
            style={{ border: "1px solid var(--pub-border-subtle)" }}
          >
            <span
              className="text-[13px] font-semibold shrink-0"
              style={{ color: "var(--pub-text-primary)" }}
            >
              Coupon code
            </span>
            <div className="flex-1 flex gap-2 min-w-[220px]">
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
                placeholder="ENTER CODE"
                className="flex-1 px-3 py-2 rounded-lg text-[13px] uppercase focus:outline-none"
                style={{
                  border: "1px solid var(--pub-border)",
                  background: "var(--pub-surface-soft, var(--pub-surface-warm))",
                  color: "var(--pub-text-primary)",
                  letterSpacing: "0.05em",
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setCouponFeedback(null);
                  setAppliedCouponCode(couponInput.trim() || null);
                }}
                disabled={quoteLoading || !couponInput.trim()}
                className="px-4 py-2 rounded-lg text-[12.5px] font-bold text-white disabled:opacity-50"
                style={{
                  background: "var(--pub-text-primary)",
                  border: "1px solid var(--pub-text-primary)",
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
                  className="px-3 py-2 rounded-lg text-[12px]"
                  style={{
                    border: "1px solid var(--pub-border)",
                    color: "var(--pub-text-muted)",
                    background: "white",
                  }}
                >
                  Remove
                </button>
              )}
            </div>
            {couponFeedback && (
              <p
                className="w-full text-xs font-medium"
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

          {/* Total banner */}
          <div
            className="flex flex-wrap items-end justify-between gap-4 px-6 py-[22px] rounded-2xl bg-white"
            style={{
              border: "1px solid var(--plum-100)",
              boxShadow: "0 2px 8px rgba(122, 74, 114, 0.10)",
            }}
          >
            <div className="min-w-0">
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
                Final amount at payment · Charged after Elavon checkout
              </div>
            </div>
            <div
              className="font-extrabold tabular-nums leading-none"
              style={{
                fontFamily: "var(--pub-font-secondary)",
                fontSize: "36px",
                color: "var(--plum)",
                letterSpacing: "-0.02em",
              }}
            >
              {formatCurrency(Math.max(0, quote.grandTotal - creditTotal))}
            </div>
          </div>
        </>
      )}

      {/* ══ PAYMENT (minimized) ══ */}
      {state.isPreview ? (
        <div
          className="bg-white rounded-2xl px-[22px] py-4 text-sm"
          style={{
            border: "1px solid var(--pub-border-subtle)",
            boxShadow: "var(--pub-shadow-card)",
            color: "var(--pub-text-muted)",
          }}
        >
          In preview mode, payment is simulated. Click confirm to see the
          success screen.
        </div>
      ) : (
        <div
          className="flex flex-wrap items-start gap-4 bg-white rounded-2xl px-[22px] py-[18px]"
          style={{
            border: "1px solid var(--pub-border-subtle)",
            boxShadow: "var(--pub-shadow-card)",
          }}
        >
          <div className="flex items-center gap-3 flex-1 min-w-[240px]">
            <div
              className="shrink-0 flex items-center justify-center rounded-[9px]"
              style={{
                width: "38px",
                height: "38px",
                background: "var(--plum-50)",
                color: "var(--plum-700)",
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="6" width="18" height="13" rx="2" />
                <path d="M3 11h18" />
                <path d="M7 16h4" />
              </svg>
            </div>
            <div
              className="text-[12.5px] leading-snug"
              style={{ color: "var(--pub-text-muted)" }}
            >
              <strong
                className="block text-[13.5px] mb-0.5"
                style={{ color: "var(--pub-text-primary)" }}
              >
                Payment via Elavon
              </strong>
              You&apos;ll be redirected to Elavon&apos;s secure checkout to enter
              card details.{" "}
              <span
                style={{ color: "var(--plum-700)", fontWeight: 600 }}
              >
                Choose your payment plan below
              </span>{" "}
              — pay in full or split into monthly installments ($5/month service
              fee applies).
            </div>
          </div>
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0"
            style={{
              background: "var(--pub-badge-sage-bg)",
              color: "var(--pub-badge-sage-text)",
            }}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
            >
              <path d="M12 3l8 4v5c0 5-3.5 9-8 10-4.5-1-8-5-8-10V7l8-4z" />
            </svg>
            Secure
          </span>
        </div>
      )}

      {/* Payment plan selector — choice must be made here (sets payment_plan_type
          before createEPGPaymentSession decides doCapture/card storage). Only
          shown when the semester is configured to allow installments. */}
      {!state.isPreview && quote && installmentsAllowed && (
        <div
          className="bg-white rounded-2xl px-5 py-4"
          style={{
            border: "1px solid var(--pub-border-subtle)",
            boxShadow: "var(--pub-shadow-card)",
          }}
        >
          <p
            className="text-[10px] font-bold uppercase tracking-[0.09em] mb-3"
            style={{ color: "var(--pub-text-faint)" }}
          >
            Payment Plan
          </p>
          <div className="space-y-2">
            {(
              [
                {
                  value: "pay_in_full",
                  title: "Pay in full",
                  desc: `One payment of ${formatCurrency(quote.grandTotal)} today.`,
                },
                {
                  value: "installments",
                  title: "Monthly installments",
                  desc: "Split into monthly payments (+$5/month service fee). Your card is saved securely for automatic monthly charges.",
                },
              ] as const
            ).map((opt) => {
              const selected = planType === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPlanType(opt.value)}
                  disabled={quoteLoading}
                  className="w-full flex items-start gap-3 text-left rounded-xl px-3.5 py-3 transition-colors disabled:opacity-60"
                  style={{
                    border: selected
                      ? "1.5px solid var(--plum)"
                      : "1px solid var(--pub-border-subtle)",
                    background: selected
                      ? "var(--pub-surface-warm)"
                      : "transparent",
                  }}
                >
                  <span
                    className="mt-0.5 flex items-center justify-center rounded-full shrink-0"
                    style={{
                      width: 18,
                      height: 18,
                      border: selected
                        ? "1.5px solid var(--plum)"
                        : "1.5px solid var(--pub-border)",
                    }}
                  >
                    {selected && (
                      <span
                        className="rounded-full"
                        style={{
                          width: 9,
                          height: 9,
                          background: "var(--plum)",
                        }}
                      />
                    )}
                  </span>
                  <span className="flex-1">
                    <span
                      className="block text-[13.5px] font-bold"
                      style={{ color: "var(--pub-text-primary)" }}
                    >
                      {opt.title}
                    </span>
                    <span
                      className="block text-[12px] leading-snug mt-0.5"
                      style={{ color: "var(--pub-text-muted)" }}
                    >
                      {opt.desc}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Installment schedule (multi-installment quotes only) */}
      {quote && quote.paymentSchedule.length > 1 && (
        <div
          className="bg-white rounded-2xl px-5 py-4"
          style={{
            border: "1px solid var(--pub-border-subtle)",
            boxShadow: "var(--pub-shadow-card)",
          }}
        >
          <p
            className="text-[10px] font-bold uppercase tracking-[0.09em] mb-2.5"
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
                  {new Date(inst.dueDate + "T00:00:00").toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric", year: "numeric" },
                  )}
                </span>
                <span className="tabular-nums">
                  {formatCurrency(inst.amountDue)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* ══ BILLING ADDRESS ══ */}
      {!state.isPreview && (
        <div
          className="bg-white rounded-2xl overflow-hidden"
          style={{ border: "1px solid var(--pub-border)", boxShadow: "var(--pub-shadow-card)" }}
        >
          <div
            className="flex items-center justify-between px-5 py-3.5 border-b text-sm font-bold"
            style={{ fontFamily: "var(--pub-font-secondary)", color: "var(--pub-text-primary)", background: "var(--pub-surface-warm)", borderColor: "var(--pub-border)" }}
          >
            <div className="flex items-center gap-2">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: "var(--plum)" }}>
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              Billing Address
            </div>
            {billingAddress && !editingAddress && (
              <button
                type="button"
                onClick={() => { setAddressDraft({ ...billingAddress }); setAddressError(null); setEditingAddress(true); }}
                className="text-xs font-semibold"
                style={{ color: "var(--plum)", background: "none", border: "none", cursor: "pointer" }}
              >
                Edit
              </button>
            )}
          </div>

          <div className="px-5 py-4">
            {!billingAddress && !editingAddress && (
              <div>
                <p className="text-sm mb-3" style={{ color: "var(--pub-text-muted)" }}>
                  A billing address is required for payment. Please add one below.
                </p>
                <button
                  type="button"
                  onClick={() => { setAddressDraft({ address_line1: "", address_line2: "", city: "", state: "", zipcode: "" }); setAddressError(null); setEditingAddress(true); }}
                  className="text-sm font-semibold px-4 py-2 rounded-lg"
                  style={{ background: "var(--plum)", color: "#fff", border: "none", cursor: "pointer" }}
                >
                  Add Billing Address
                </button>
              </div>
            )}

            {billingAddress && !editingAddress && (
              <div className="text-sm space-y-0.5" style={{ color: "var(--pub-text-primary)" }}>
                <p>{billingAddress.address_line1}{billingAddress.address_line2 ? `, ${billingAddress.address_line2}` : ""}</p>
                <p>{billingAddress.city}, {billingAddress.state} {billingAddress.zipcode}</p>
              </div>
            )}

            {editingAddress && (
              <div className="space-y-3">
                {addressError && (
                  <p className="text-xs font-medium" style={{ color: "#b91c1c" }}>{addressError}</p>
                )}
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--pub-text-primary)" }}>
                    Street Address <span style={{ color: "var(--wine)" }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={addressDraft.address_line1}
                    onChange={(e) => setAddressDraft((d) => ({ ...d, address_line1: e.target.value }))}
                    placeholder="123 Main St"
                    className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                    style={{ border: "1.5px solid var(--pub-border)", color: "var(--pub-text-primary)" }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--pub-text-primary)" }}>
                    Apt / Suite <span style={{ color: "var(--pub-text-faint)", fontWeight: 400 }}>(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={addressDraft.address_line2}
                    onChange={(e) => setAddressDraft((d) => ({ ...d, address_line2: e.target.value }))}
                    placeholder="Apt 4B"
                    className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                    style={{ border: "1.5px solid var(--pub-border)", color: "var(--pub-text-primary)" }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-1">
                    <label className="block text-xs font-semibold mb-1" style={{ color: "var(--pub-text-primary)" }}>
                      City <span style={{ color: "var(--wine)" }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={addressDraft.city}
                      onChange={(e) => setAddressDraft((d) => ({ ...d, city: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                      style={{ border: "1.5px solid var(--pub-border)", color: "var(--pub-text-primary)" }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: "var(--pub-text-primary)" }}>
                      State <span style={{ color: "var(--wine)" }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={addressDraft.state}
                      onChange={(e) => setAddressDraft((d) => ({ ...d, state: e.target.value.toUpperCase().slice(0, 2) }))}
                      placeholder="NY"
                      maxLength={2}
                      className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                      style={{ border: "1.5px solid var(--pub-border)", color: "var(--pub-text-primary)" }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: "var(--pub-text-primary)" }}>
                      ZIP <span style={{ color: "var(--wine)" }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={addressDraft.zipcode}
                      onChange={(e) => setAddressDraft((d) => ({ ...d, zipcode: e.target.value }))}
                      maxLength={10}
                      className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                      style={{ border: "1.5px solid var(--pub-border)", color: "var(--pub-text-primary)" }}
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  {billingAddress && (
                    <button
                      type="button"
                      onClick={() => { setEditingAddress(false); setAddressError(null); }}
                      className="flex-1 py-2 rounded-lg text-sm font-semibold"
                      style={{ border: "1.5px solid var(--pub-border)", background: "white", color: "var(--pub-text-muted)", cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveAddress}
                    disabled={savingAddress}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: "var(--plum)", color: "#fff", border: "none", cursor: "pointer", opacity: savingAddress ? 0.6 : 1 }}
                  >
                    {savingAddress ? "Saving…" : "Save Address"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
      <div className="reg-cta-row">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={processing}
          className="btn-back"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={processing || (!state.isPreview && !billingAddress)}
          className="btn-continue"
        >
          {processing
            ? "Redirecting to payment…"
            : state.isPreview
              ? "Simulate Payment"
              : "Proceed to Payment"}
          {!processing && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
