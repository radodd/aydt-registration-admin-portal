"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/app/providers/CartProvider";
import { getSemesterForDisplay } from "@/app/actions/getSemesterForDisplay";
import { computePricingQuote } from "@/app/actions/computePricingQuote";
import { gaEvent } from "@/utils/analytics";
import type { CartItem, PublicSession, PublicFeeConfig } from "@/types/public";
import type { PricingQuote } from "@/types";

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDollars(dollars: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(dollars);
}

/**
 * Per-row item price. tiered + drop-in items snapshot their authoritative
 * price at add-to-cart time. Standard-mode items have no snapshot because
 * their tuition depends on the dancer's full enrollment (progressive rate
 * band) — show "—" per row; the live engine quote at the bottom carries
 * the real total.
 */
function itemPrice(item: CartItem): number {
  if (item.priceSnapshot != null) return item.priceSnapshot;
  return 0;
}

function buildEngineInputs(items: CartItem[]): {
  sessionIds: string[];
  classTierIdsBySession: Record<string, string>;
} {
  const sessionIds: string[] = [];
  const classTierIdsBySession: Record<string, string> = {};
  for (const item of items) {
    if (item.mode === "drop-in") {
      for (const id of item.selectedDateIds ?? []) sessionIds.push(id);
    } else {
      sessionIds.push(item.sessionId);
      if (item.mode === "tiered" && item.classTierId) {
        classTierIdsBySession[item.sessionId] = item.classTierId;
      }
    }
  }
  return { sessionIds, classTierIdsBySession };
}

function fmtMonth(monthKey: string): string {
  return new Date(monthKey + "-01T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function fmtDayDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

type DisciplineKey =
  | "ballet" | "tap" | "broadway" | "hiphop" | "contemporary"
  | "technique" | "pointe" | "jazz" | "lyrical" | "acro" | "default";

const DISCIPLINE_STYLES: Record<DisciplineKey, { bg: string; fg: string }> = {
  ballet:       { bg: "bg-[#F7DDE6]", fg: "text-[#A8366B]" },
  tap:          { bg: "bg-[#F0E0BC]", fg: "text-[#7A5010]" },
  broadway:     { bg: "bg-[#ECDBF0]", fg: "text-[#6B3A78]" },
  hiphop:       { bg: "bg-[#DCE2EA]", fg: "text-[#3A4858]" },
  contemporary: { bg: "bg-[#E0DAF0]", fg: "text-[#4A3F8C]" },
  technique:    { bg: "bg-[#D9E8CF]", fg: "text-[#3D6A3A]" },
  pointe:       { bg: "bg-[#EAD0DC]", fg: "text-[#8E2D58]" },
  jazz:         { bg: "bg-[#F8D6C0]", fg: "text-[#A8482A]" },
  lyrical:      { bg: "bg-[#D2E8DD]", fg: "text-[#2E6A50]" },
  acro:         { bg: "bg-[#CFEAEA]", fg: "text-[#2A6878]" },
  default:      { bg: "bg-[#EBDFD9]", fg: "text-[#6D5A53]" },
};

function getDisciplineKey(d?: string | null): DisciplineKey {
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

function DisciplineMark({ discipline }: { discipline: DisciplineKey }) {
  const { bg, fg } = DISCIPLINE_STYLES[discipline];
  const stroke = "stroke-current fill-none [stroke-width:2] [stroke-linejoin:round] [stroke-linecap:round]";
  return (
    <span
      aria-hidden
      className={`inline-flex items-center justify-center w-6 h-6 rounded-[7px] flex-none mr-2.5 align-middle ${bg} ${fg}`}
    >
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5">
        {discipline === "ballet"       && <circle className={stroke} cx="12" cy="12" r="6" />}
        {discipline === "tap"          && <rect   className={stroke} x="6" y="6" width="12" height="12" rx="1.5" />}
        {discipline === "broadway"     && <path   className={stroke} d="M12 5 L 19 18 L 5 18 Z" />}
        {discipline === "hiphop"       && <path   className={stroke} d="M12 4.5 L 19.5 12 L 12 19.5 L 4.5 12 Z" />}
        {discipline === "contemporary" && <path   className={stroke} d="M12 4 L 19 8 L 19 16 L 12 20 L 5 16 L 5 8 Z" />}
        {discipline === "technique"    && <path   className={stroke} d="M12 4 L 19.5 9.5 L 16.5 18.5 L 7.5 18.5 L 4.5 9.5 Z" />}
        {discipline === "pointe"       && <><circle className={stroke} cx="12" cy="12" r="6.5" /><circle className={stroke} cx="12" cy="12" r="2.5" /></>}
        {discipline === "jazz"         && <path   className={stroke} d="M12 4 L 13.5 10.5 L 20 12 L 13.5 13.5 L 12 20 L 10.5 13.5 L 4 12 L 10.5 10.5 Z" />}
        {discipline === "lyrical"      && <path   className={stroke} d="M10 5 H 14 V 10 H 19 V 14 H 14 V 19 H 10 V 14 H 5 V 10 H 10 Z" />}
        {discipline === "acro"         && <path   className={stroke} d="M5 16 A 7 7 0 0 1 19 16 Z" />}
        {discipline === "default"      && <circle className={stroke} cx="12" cy="12" r="6" />}
      </svg>
    </span>
  );
}

function fmtTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}:${String(s).padStart(2, "0")}`;
  return `${s}s`;
}

const STEPS = [
  { label: "Sessions" },
  { label: "Review Cart" },
  { label: "Dancer Info" },
  { label: "Reg. Info" },
  { label: "Payment" },
  { label: "Confirm" },
];

export function CartPageContent() {
  const router = useRouter();

  const {
    items,
    semesterId,
    remove,
    removeItem,
    updateItem,
    isExpired,
    clear,
    itemCount,
    hydrated,
    secondsRemaining,
    preview,
  } = useCart();

  const [semesterSessions, setSemesterSessions] = useState<PublicSession[]>([]);
  const [semesterName, setSemesterName] = useState<string>("");
  const [feeConfig, setFeeConfig] = useState<PublicFeeConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hydrated) return;
    if (!semesterId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getSemesterForDisplay(semesterId, preview ? "preview" : "live").then(
      (semester) => {
        setSemesterSessions(semester.sessions);
        setSemesterName(semester.name);
        setFeeConfig(semester.feeConfig ?? null);
        setLoading(false);
      },
    );
  }, [hydrated, semesterId]);

  const sessionMap = useMemo(() => {
    const map = new Map<string, PublicSession>();
    for (const s of semesterSessions) map.set(s.id, s);
    return map;
  }, [semesterSessions]);

  useEffect(() => {
    if (isExpired) {
      clear();
      router.push(
        preview ? `/preview/semester/${semesterId}` : `/semester/${semesterId}`,
      );
    }
  }, [isExpired, clear, router, semesterId, secondsRemaining, hydrated, itemCount]);

  const subtotal = useMemo(
    () => items.reduce((acc, it) => acc + itemPrice(it), 0),
    [items],
  );

  // Live engine quote for the bottom-line total. This is the same engine that
  // runs at checkout, so the parent sees the real number BEFORE leaving the
  // cart. Standard-mode items don't have a per-row dollar (progressive math
  // depends on full enrollment), but the engine returns the whole-cart total.
  const [liveQuote, setLiveQuote] = useState<PricingQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  useEffect(() => {
    if (items.length === 0) {
      setLiveQuote(null);
      return;
    }
    const { sessionIds, classTierIdsBySession } = buildEngineInputs(items);
    if (sessionIds.length === 0) {
      setLiveQuote(null);
      return;
    }
    let cancelled = false;
    setQuoteLoading(true);
    computePricingQuote({
      semesterId,
      enrollments: [
        {
          dancerId: "00000000-0000-0000-0000-000000000000",
          dancerName: "Cart Preview",
          sessionIds,
          classTierIdsBySession:
            Object.keys(classTierIdsBySession).length > 0
              ? classTierIdsBySession
              : undefined,
        },
      ],
      paymentPlanType: "pay_in_full",
      // Preview walks draft semesters whose prices may not be set yet.
      tolerateMissingPrices: preview,
    })
      .then((q) => {
        if (!cancelled) setLiveQuote(q);
      })
      .catch(() => {
        if (!cancelled) setLiveQuote(null);
      })
      .finally(() => {
        if (!cancelled) setQuoteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [items, semesterId]);

  const estimatedTotal = liveQuote?.grandTotal ?? subtotal;

  // Fire view_cart once when cart loads with items
  const viewCartFired = useRef(false);
  useEffect(() => {
    if (viewCartFired.current || items.length === 0 || sessionMap.size === 0) return;
    viewCartFired.current = true;
    gaEvent("view_cart", {
      currency: "USD",
      value: subtotal,
      items: items.map((it) => {
        const rep = sessionMap.get(it.sessionId);
        return {
          item_id: it.sessionId,
          item_name: it.className || rep?.name || "",
          item_category: rep?.discipline ?? it.className,
          price: itemPrice(it),
          quantity: it.mode === "drop-in" ? (it.selectedDateIds?.length ?? 0) : 1,
        };
      }),
    });
  }, [items, sessionMap, subtotal]);

  const semesterLink = preview
    ? `/preview/semester/${semesterId}`
    : `/semester/${semesterId}`;

  const continueLink = preview
    ? `/preview/semester/${semesterId}/register`
    : `/register?semester=${semesterId}`;

  /* ── Loading guards ── */
  if (!hydrated || loading) {
    return <CartSkeleton />;
  }

  if (!loading && items.length === 0) {
    return <EmptyCart />;
  }

  const isUrgent = secondsRemaining < 300;

  return (
    <>
      {/* ── Step indicator ── */}
      <div className="bg-white border-b border-[#F2E9E3] px-3 pt-4 pb-5 sm:px-6 sm:pt-[22px] sm:pb-[26px]">
        <div className="flex items-start justify-center">
          {STEPS.map((step, i) => {
            const done = i < 1;
            const active = i === 1;
            const isLast = i === STEPS.length - 1;
            return (
              <div
                key={i}
                className="relative flex flex-col items-center gap-1 sm:gap-1.5 flex-none px-2 sm:px-9"
              >
                <div
                  className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full border-[1.5px] flex items-center justify-center text-[10px] sm:text-[11px] font-semibold ${
                    active
                      ? "bg-[#7A4A72] border-[#7A4A72] text-white"
                      : done
                        ? "bg-[#EDD8EB] border-[#EDD8EB] text-[#5E3458]"
                        : "bg-white border-[#EBDFD9] text-[#A39189]"
                  }`}
                >
                  {done ? (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <div
                  className={`text-[9px] sm:text-[10.5px] font-semibold text-center leading-tight max-w-12 sm:max-w-14 ${
                    active
                      ? "text-[#1F1513]"
                      : done
                        ? "text-[#6D5A53]"
                        : "text-[#A39189]"
                  }`}
                >
                  {step.label}
                </div>
                {!isLast && (
                  <span className="absolute top-3 sm:top-3.5 -right-1 sm:-right-2 w-2 sm:w-4 h-px sm:h-[1.5px] bg-[#EBDFD9]" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Main ── */}
      <div className="cart-page-main">
        <div className="cart-page-inner">

          {/* Page header */}
          <div className="mb-2 flex items-start justify-between gap-6 flex-wrap">
            <div>
              <h1 className="text-[26px] font-bold tracking-[-0.01em] text-[#1F1513] leading-tight">
                Review Your Cart
              </h1>
              <p className="text-[13.5px] text-[#6D5A53] mt-0.5">
                Confirm your sessions before continuing to registration.
              </p>
            </div>
            {itemCount > 0 && (
              <div
                className={`inline-flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-[12.5px] font-medium ${
                  isUrgent
                    ? "bg-[#F9EDEC] text-[#6B1F19]"
                    : "bg-[#FBEED9] text-[#6F4A0F]"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9"/>
                  <path d="M12 7v5l3 2"/>
                </svg>
                Cart expires in{" "}
                <strong className="font-bold tabular-nums">{fmtTimer(secondsRemaining)}</strong>
              </div>
            )}
          </div>

          {/* Cart items */}
          <div className="mt-7 mb-3.5 text-[10.5px] text-[#A39189] uppercase tracking-[0.08em] font-semibold">
            Your selections{semesterName ? ` — ${semesterName}` : ""}
          </div>

          {items.map((item) => (
            <CartPageLine
              key={item.id}
              item={item}
              sessionMap={sessionMap}
              semesterLink={semesterLink}
              onAddDate={(dateId) => {
                const current = item.selectedDateIds ?? [];
                if (current.includes(dateId)) return;
                const nextDates = [...current, dateId].sort((a, b) => {
                  const da = sessionMap.get(a)?.scheduleDate ?? "";
                  const db = sessionMap.get(b)?.scheduleDate ?? "";
                  return da.localeCompare(db);
                });
                const nextSessions = nextDates
                  .map((id) => sessionMap.get(id))
                  .filter((s): s is PublicSession => !!s);
                const newSnapshot = nextSessions.reduce(
                  (sum, s) => sum + (s.dropInPrice ?? 0),
                  0,
                );
                updateItem(item.id, {
                  selectedDateIds: nextDates,
                  sessionId: nextSessions[0]?.id ?? item.sessionId,
                  priceSnapshot: newSnapshot,
                });
                gaEvent("add_to_cart", {
                  currency: "USD",
                  value: sessionMap.get(dateId)?.dropInPrice ?? 0,
                  items: [{
                    item_id: dateId,
                    item_name: item.className,
                    item_category: sessionMap.get(dateId)?.discipline ?? item.className,
                    price: sessionMap.get(dateId)?.dropInPrice ?? 0,
                    quantity: 1,
                  }],
                });
              }}
              onRemoveItem={() => {
                const rep = sessionMap.get(item.sessionId);
                gaEvent("remove_from_cart", {
                  currency: "USD",
                  value: itemPrice(item),
                  items: [{
                    item_id: item.sessionId,
                    item_name: item.className || rep?.name || "",
                    item_category: rep?.discipline ?? item.className,
                    price: itemPrice(item),
                    quantity: item.mode === "drop-in" ? (item.selectedDateIds?.length ?? 0) : 1,
                  }],
                });
                removeItem(item.id);
              }}
              onRemoveDate={(dateId) => remove(dateId)}
            />
          ))}

          {/* Add more */}
          <Link
            href={semesterLink}
            className="inline-flex items-center gap-1.5 mt-1.5 mb-[18px] ml-1 text-[#5E3458] hover:text-[#7A4A72] text-[13px] font-semibold transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Add more sessions
          </Link>

          {/* Order summary */}
          <section className="bg-white border border-[#F2E9E3] rounded-[14px] shadow-[0_1px_3px_rgba(31,21,19,0.04),0_1px_1px_rgba(31,21,19,0.03)] overflow-hidden mt-2">
            <div className="px-5 py-4 bg-[#FAF2F0] border-b border-[#F2E9E3] font-bold text-[14.5px] text-[#1F1513]">
              Order Summary
            </div>
            <div className="px-5 py-4">
              <OsSectionLabel first>Classes</OsSectionLabel>
              {items.map((item) => {
                const rep = sessionMap.get(item.sessionId);
                const price = itemPrice(item);
                const label = item.className || rep?.name || "Class";
                const sub =
                  item.mode === "tiered" && item.tierLabel
                    ? `${item.tierLabel}${rep?.startTime ? ` · ${rep.startTime}${rep.endTime ? `–${rep.endTime}` : ""}` : ""}${rep?.location ? ` · ${rep.location}` : ""}`
                    : item.mode === "drop-in"
                      ? `${item.selectedDateIds?.length ?? 0} drop-in session${(item.selectedDateIds?.length ?? 0) !== 1 ? "s" : ""}${rep?.location ? ` · ${rep.location}` : ""}`
                      : rep?.startTime
                        ? `${rep.startTime}${rep.endTime ? ` – ${rep.endTime}` : ""}${rep.location ? ` · ${rep.location}` : ""}`
                        : rep?.location ?? "";
                return (
                  <OsRow
                    key={item.id}
                    label={label}
                    sub={sub || undefined}
                    amt={price > 0 ? formatDollars(price) : "—"}
                  />
                );
              })}
              {(() => {
                // Prefer the live engine's computed tuition subtotal (covers
                // standard rate-band tuition that has no per-row dollar).
                const liveTuition = liveQuote?.tuitionSubtotal;
                const showTuition = liveTuition != null ? liveTuition : subtotal;
                if (showTuition <= 0) return null;
                return (
                  <div className="flex justify-between items-baseline mt-2 pt-2 border-t border-[#F2E9E3] text-[13px] font-semibold text-[#1F1513]">
                    <span>Classes subtotal</span>
                    <span className="tabular-nums">{formatDollars(showTuition)}</span>
                  </div>
                );
              })()}

              <OsSectionLabel>Fees &amp; Add-ons</OsSectionLabel>
              {(() => {
                // Derive per-fee totals from the live quote when available;
                // otherwise show the static fee config preview.
                const regFeeAmt =
                  liveQuote?.registrationFeeTotal != null
                    ? formatDollars(liveQuote.registrationFeeTotal)
                    : feeConfig
                      ? formatCurrency(feeConfig.registrationFeePerChild * 100)
                      : "—";
                const costumeFromQuote = liveQuote?.lineItems
                  ?.filter((li) => li.type === "costume_fee")
                  ?.reduce((sum, li) => sum + li.amount, 0);
                const costumeAmt =
                  costumeFromQuote != null && costumeFromQuote > 0
                    ? formatDollars(costumeFromQuote)
                    : "—";
                const videoFromQuote = liveQuote?.lineItems
                  ?.filter((li) => li.type === "video_fee")
                  ?.reduce((sum, li) => sum + li.amount, 0);
                const videoAmt =
                  videoFromQuote != null && videoFromQuote > 0
                    ? formatDollars(videoFromQuote)
                    : feeConfig
                      ? formatCurrency(feeConfig.seniorVideoFeePerRegistrant * 100)
                      : "—";
                return (
                  <>
                    <OsRow
                      label="Registration fee"
                      sub="Per dancer enrolled · finalized at Step 3"
                      amt={regFeeAmt}
                      amtSub={
                        liveQuote ? undefined : feeConfig ? "/ dancer" : undefined
                      }
                    />
                    <OsRow
                      label="Costume fee"
                      sub={
                        feeConfig
                          ? `Junior ${formatCurrency(feeConfig.juniorCostumeFeePerClass * 100)} / Senior ${formatCurrency(feeConfig.seniorCostumeFeePerClass * 100)} · per class`
                          : "Per dancer, per class (varies by division)"
                      }
                      amt={costumeAmt}
                      amtSub={liveQuote ? undefined : "per class"}
                    />
                    {((feeConfig && feeConfig.seniorVideoFeePerRegistrant > 0) ||
                      (videoFromQuote != null && videoFromQuote > 0)) && (
                      <OsRow
                        label="Senior video fee"
                        sub="Senior division dancers only"
                        amt={videoAmt}
                        amtSub={liveQuote ? undefined : "/ senior"}
                      />
                    )}
                  </>
                );
              })()}

              <OsSectionLabel>Discounts</OsSectionLabel>
              <OsRow
                label="Family discount"
                sub={
                  feeConfig
                    ? `${formatCurrency(feeConfig.familyDiscountAmount * 100)} off when 2+ dancers · auto-applied`
                    : "Applied automatically when eligible"
                }
                amt={<span className="text-[#A39189] text-[11px]">auto</span>}
                discount
              />
              <OsRow
                label="Coupon code"
                sub="Enter at the payment step"
                amt={<span className="text-[#A39189] text-[11px]">at payment</span>}
              />

              {/* Preview-only: classes whose prices aren't configured yet. The
                  live cart never receives warnings (no tolerateMissingPrices). */}
              {liveQuote?.warnings && liveQuote.warnings.length > 0 && (
                <div className="mt-3.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <p className="mb-1 font-semibold">⚠ Pricing not fully configured</p>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {liveQuote.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-3.5 pt-3.5 border-t-2 border-[#EBDFD9] flex justify-between items-end gap-3">
                <div>
                  <div className="text-sm font-bold text-[#1F1513]">Estimated Total</div>
                  <div className="text-[11px] font-medium text-[#A39189] mt-0.5">
                    {liveQuote
                      ? "Per dancer — adjustments at payment"
                      : "Final amount confirmed at payment"}
                  </div>
                </div>
                <div className="text-[26px] font-extrabold text-[#7A4A72] tabular-nums leading-none">
                  {quoteLoading && !liveQuote
                    ? "…"
                    : estimatedTotal > 0
                      ? formatDollars(estimatedTotal)
                      : "—"}
                </div>
              </div>

              <div className="mt-4 px-3.5 py-3 bg-[#F7EEF6] rounded-[9px] flex gap-2.5 text-[12.5px] text-[#3A1E38] leading-snug">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-none mt-px">
                  <circle cx="12" cy="12" r="9"/>
                  <path d="M12 8v4M12 16v.01"/>
                </svg>
                <span>
                  An installment plan is available at checkout. You can choose to pay in full or spread payments across the semester.
                </span>
              </div>
            </div>
          </section>

          {/* CTAs */}
          <div className="mt-[22px] flex justify-between gap-3 flex-wrap">
            <Link
              href={semesterLink}
              className="px-[22px] py-[14px] bg-white border border-[#EBDFD9] rounded-[10px] font-semibold text-sm text-[#1F1513] inline-flex items-center gap-2 hover:bg-[#FAF2F0] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Add more sessions
            </Link>
            <Link
              href={continueLink}
              className="px-7 py-[14px] bg-[#7A4A72] border border-[#5E3458] rounded-[10px] text-white font-bold text-sm inline-flex items-center justify-center gap-2 flex-1 min-w-[240px] hover:bg-[#5E3458] transition-colors"
            >
              Continue to Dancer Info
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </Link>
          </div>

        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* CartPageLine — one row per CartItem; drop-in items are collapsible          */
/* -------------------------------------------------------------------------- */

function CartCardShell({
  discipline,
  title,
  format,
  formatLabel,
  meta,
  children,
}: {
  discipline: DisciplineKey;
  title: string;
  format: "tier" | "dropin" | "none";
  formatLabel?: string | null;
  meta: React.ReactNode;
  children: React.ReactNode;
}) {
  const stripeClass =
    format === "dropin"
      ? "bg-[#D5A85F]"
      : format === "tier"
        ? "bg-[#B985A8]"
        : "bg-[#EBDFD9]";

  const pillClass =
    format === "dropin"
      ? "bg-[#F4E4C4] text-[#6F4A0F]"
      : "bg-[#EDDDE9] text-[#5E3458]";

  return (
    <article className="bg-white border border-[#F2E9E3] rounded-[14px] mb-3.5 flex relative overflow-hidden shadow-[0_1px_3px_rgba(31,21,19,0.04),0_1px_1px_rgba(31,21,19,0.03)]">
      <div aria-hidden className={`flex-none w-[5px] self-stretch ${stripeClass}`} />
      <div className="flex-1 min-w-0 px-5 py-[18px]">
        <header className="flex items-start justify-between gap-3.5 mb-1.5">
          <h3 className="text-base font-bold text-[#1F1513] leading-snug flex items-center min-w-0">
            <DisciplineMark discipline={discipline} />
            <span className="truncate">{title}</span>
          </h3>
          {formatLabel && format !== "none" && (
            <span className={`flex-none px-[11px] py-1 rounded-full text-[11px] font-bold tracking-wide inline-flex items-center gap-1.5 whitespace-nowrap ${pillClass}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {formatLabel}
            </span>
          )}
        </header>
        <div className="text-[#6D5A53] text-[12.5px] flex flex-wrap gap-x-3 gap-y-1 mb-3.5">
          {meta}
        </div>
        {children}
      </div>
    </article>
  );
}

export function CartSkeleton() {
  return (
    <div className="cart-page-main">
      <div className="cart-page-inner">
        <div className="flex flex-col gap-3.5 animate-pulse">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </div>
  );
}

export function EmptyCart() {
  return (
    <div className="cart-page-main">
      <div className="cart-page-inner">
        <div className="bg-white border border-[#F2E9E3] rounded-[14px] shadow-[0_1px_3px_rgba(31,21,19,0.04),0_1px_1px_rgba(31,21,19,0.03)] px-6 py-12 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#F7EEF6] text-[#7A4A72] flex items-center justify-center mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
          </div>
          <h1 className="text-lg font-bold text-[#1F1513] mb-1">Your cart is empty</h1>
          <p className="text-[13.5px] text-[#6D5A53] mb-6 max-w-xs">
            Browse available programs to add classes.
          </p>
          <Link
            href="/"
            className="px-6 py-3 bg-[#7A4A72] border border-[#5E3458] rounded-[10px] text-white font-bold text-sm inline-flex items-center gap-2 hover:bg-[#5E3458] transition-colors"
          >
            Browse Classes
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white border border-[#F2E9E3] rounded-[14px] flex relative overflow-hidden shadow-[0_1px_3px_rgba(31,21,19,0.04),0_1px_1px_rgba(31,21,19,0.03)]">
      <div className="flex-none w-[5px] bg-[#EBDFD9]" />
      <div className="flex-1 px-5 py-[18px]">
        <div className="flex items-start justify-between gap-3.5 mb-2.5">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-6 h-6 rounded-[7px] bg-[#F2E9E3] flex-none" />
            <div className="h-4 bg-[#F2E9E3] rounded w-1/2 max-w-[200px]" />
          </div>
          <div className="h-5 w-16 rounded-full bg-[#F2E9E3] flex-none" />
        </div>
        <div className="flex gap-3 mb-4">
          <div className="h-3 bg-[#F2E9E3] rounded w-24" />
          <div className="h-3 bg-[#F2E9E3] rounded w-20" />
        </div>
        <div className="pt-3 border-t border-[#F2E9E3] flex justify-between items-center">
          <div className="h-3.5 bg-[#F2E9E3] rounded w-28" />
          <div className="h-3.5 bg-[#F2E9E3] rounded w-14" />
        </div>
      </div>
    </div>
  );
}

function OsSectionLabel({
  children,
  first,
}: {
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <div
      className={`text-[10px] uppercase tracking-[0.09em] font-bold text-[#A39189] mb-2.5 ${
        first ? "mt-1" : "mt-4 pt-3.5 border-t border-[#F2E9E3]"
      }`}
    >
      {children}
    </div>
  );
}

function OsRow({
  label,
  sub,
  amt,
  amtSub,
  discount,
}: {
  label: React.ReactNode;
  sub?: string;
  amt: React.ReactNode;
  amtSub?: string;
  discount?: boolean;
}) {
  return (
    <div className="flex justify-between items-start py-1.5 text-[13px] gap-3">
      <div className="min-w-0">
        <div className="text-[#1F1513]">{label}</div>
        {sub && <div className="block text-[#A39189] text-[11.5px] mt-px leading-snug">{sub}</div>}
      </div>
      <div
        className={`text-right tabular-nums font-medium whitespace-nowrap ${
          discount ? "text-[#2E6A50]" : "text-[#1F1513]"
        }`}
      >
        {amt}
        {amtSub && <span className="block text-[#A39189] text-[11px] font-normal">{amtSub}</span>}
      </div>
    </div>
  );
}

function CardRemoveAction({ onClick }: { onClick: () => void }) {
  return (
    <div className="mt-3.5 pt-3 border-t border-[#F2E9E3] flex justify-end gap-2.5">
      <button
        type="button"
        onClick={onClick}
        className="bg-transparent border-none text-[#6D5A53] text-[12.5px] font-medium px-2 py-1 rounded-md inline-flex items-center gap-1.5 hover:bg-[#F9EDEC] hover:text-[#8E2A23] transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 5l14 14M19 5L5 19" />
        </svg>
        Remove class
      </button>
    </div>
  );
}

function MetaItem({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-3 h-3 opacity-70 flex-none [&_svg]:w-3 [&_svg]:h-3">{icon}</span>
      {children}
    </span>
  );
}

type Tier = { id: string; label: string; amount: number; isDefault: boolean };

function TierRow({
  tier,
  isCurrent,
  isSelected,
  onClick,
}: {
  tier: Tier;
  isCurrent: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-[9px] mb-2 text-left transition-colors ${
        isSelected
          ? "bg-[#F7EEF6] border-[1.5px] border-[#7A4A72] shadow-[inset_0_0_0_1px_#7A4A72]"
          : "bg-white border-[1.5px] border-[#EBDFD9] hover:border-[#C090B8]"
      } ${isCurrent ? "border-dashed" : ""}`}
    >
      <span
        className={`w-4 h-4 rounded-full flex-none bg-white ${
          isSelected ? "border-[5px] border-[#7A4A72]" : "border-[1.5px] border-[#EBDFD9]"
        }`}
      />
      <span className="flex-1 min-w-0">
        <span className="block text-[13.5px] font-semibold text-[#1F1513]">
          {tier.label}
          {isCurrent && (
            <span className="ml-1.5 text-[10px] bg-[#F2E9E3] text-[#6D5A53] px-1.5 py-0.5 rounded font-bold tracking-wider uppercase">
              Current
            </span>
          )}
        </span>
      </span>
      <span className="text-[13.5px] font-bold tabular-nums text-[#1F1513]">
        {formatDollars(tier.amount)}
      </span>
    </button>
  );
}

function TierPicker({
  tiers,
  currentTierId,
  onConfirm,
}: {
  tiers: Tier[];
  currentTierId: string | undefined;
  onConfirm: (tierId: string) => void;
}) {
  const currentTier =
    tiers.find((t) => t.id === currentTierId) ??
    tiers.find((t) => t.isDefault) ??
    tiers[0];

  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(currentTier?.id ?? "");

  if (!currentTier) return null;

  const selectedTier = tiers.find((t) => t.id === selectedId) ?? currentTier;
  const delta = selectedTier.amount - currentTier.amount;
  const isEqual = delta === 0;
  const sign = delta >= 0 ? "+" : "−";
  const absDelta = Math.abs(delta);

  const handleCancel = () => {
    setSelectedId(currentTier.id);
    setExpanded(false);
  };

  const handleConfirm = () => {
    if (isEqual) return;
    onConfirm(selectedTier.id);
    setExpanded(false);
  };

  return (
    <div className="bg-[#FDFAF8] border border-[#F2E9E3] rounded-[10px] p-3.5 mb-3.5">
      {!expanded ? (
        // Collapsed summary
        <div className="flex items-center justify-between gap-3 p-1">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <span className="w-4 h-4 rounded-full border-[5px] border-[#7A4A72] flex-none" />
            <div className="min-w-0">
              <div className="font-semibold text-[13.5px] text-[#1F1513]">{currentTier.label}</div>
            </div>
          </div>
          <span className="font-bold text-sm tabular-nums">
            {formatDollars(currentTier.amount)}
          </span>
          {tiers.length > 1 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="bg-transparent border border-[#EBDFD9] text-[#5E3458] text-[11.5px] font-semibold px-2.5 py-1 rounded-md hover:bg-[#F7EEF6] transition-colors"
            >
              Change tier
            </button>
          )}
        </div>
      ) : (
        // Expanded picker
        <>
          <div className="flex justify-between items-center mb-2.5">
            <span className="text-xs text-[#6D5A53]">Choose a different tier:</span>
            <button
              type="button"
              onClick={handleCancel}
              className="bg-transparent border border-[#EBDFD9] text-[#5E3458] text-[11.5px] font-semibold px-2.5 py-1 rounded-md hover:bg-[#F7EEF6] transition-colors"
            >
              Cancel
            </button>
          </div>
          {tiers.map((t) => (
            <TierRow
              key={t.id}
              tier={t}
              isCurrent={t.id === currentTier.id}
              isSelected={t.id === selectedId}
              onClick={() => setSelectedId(t.id)}
            />
          ))}
          <div
            className={`mt-3 p-3 rounded-[9px] flex items-center justify-between gap-3 flex-wrap ${
              isEqual
                ? "bg-[#FAF2F0] border border-[#EBDFD9]"
                : "bg-[#F9EDEC] border border-[#F0D0CE]"
            }`}
          >
            <div className={`text-[12.5px] leading-snug ${isEqual ? "text-[#6D5A53]" : "text-[#6B1F19]"}`}>
              {isEqual ? (
                "Select a different tier to see the price change."
              ) : (
                <>
                  Switching to <strong className="font-bold">{selectedTier.label}</strong>. This will{" "}
                  <strong className="font-bold">
                    {delta >= 0 ? "add " : "remove "}
                    <span className="text-[#8E2A23] font-bold">
                      {sign}{formatDollars(absDelta)}
                    </span>
                  </strong>{" "}
                  {delta >= 0 ? "to" : "from"} your total.
                </>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="px-3.5 py-1.5 bg-white border border-[#EBDFD9] rounded-md text-[#6D5A53] text-[12.5px] font-semibold hover:bg-[#FAF2F0]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isEqual}
                className="px-3.5 py-1.5 bg-[#7A4A72] border border-[#5E3458] rounded-md text-white text-[12.5px] font-bold hover:bg-[#5E3458] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#7A4A72]"
              >
                {isEqual ? "Confirm change" : `Confirm change · ${sign}${formatDollars(absDelta)}`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CartPageLine({
  item,
  sessionMap,
  semesterLink,
  onRemoveItem,
  onRemoveDate,
  onAddDate,
}: {
  item: CartItem;
  sessionMap: Map<string, PublicSession>;
  semesterLink: string;
  onRemoveItem: () => void;
  onRemoveDate: (dateId: string) => void;
  onAddDate: (dateId: string) => void;
}) {
  const rep = sessionMap.get(item.sessionId);
  const price = itemPrice(item);
  const discipline = getDisciplineKey(rep?.discipline);
  const title = item.className || rep?.name || "Class";
  const [addPickerOpen, setAddPickerOpen] = useState(false);

  const clockIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
  const pinIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 21s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
  const calIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  );

  if (item.mode !== "drop-in") {
    const format: "tier" | "none" = item.mode === "tiered" ? "tier" : "none";
    const meta = (
      <>
        {rep?.startTime && (
          <MetaItem icon={clockIcon}>
            {rep.startTime}{rep.endTime ? ` – ${rep.endTime}` : ""}
          </MetaItem>
        )}
        {rep?.location && <MetaItem icon={pinIcon}>{rep.location}</MetaItem>}
      </>
    );

    const tiers = rep?.priceTiers ?? [];
    const showTierPicker = item.mode === "tiered" && tiers.length > 0;

    return (
      <CartCardShell
        discipline={discipline}
        title={title}
        format={format}
        formatLabel={item.tierLabel}
        meta={meta}
      >
        {showTierPicker && (
          <>
            <div className="text-[10px] uppercase tracking-[0.09em] font-bold text-[#A39189] mb-2">
              Selected Tier
            </div>
            <TierPicker
              tiers={tiers}
              currentTierId={item.classTierId}
              onConfirm={(tierId) => {
                // TODO: wire to CartProvider.updateTier(item.id, tierId) — requires provider change (out of scope this pass)
                console.info("[cart] tier change requested", { itemId: item.id, tierId });
              }}
            />
          </>
        )}
        <div className="mt-3.5 pt-3 border-t border-[#F2E9E3]">
          <div className="flex justify-between items-baseline py-1 text-[12.5px] text-[#6D5A53]">
            <span className="font-medium">
              Tuition
              {item.tierLabel && (
                <span className="ml-1 text-[#A39189]">· {item.tierLabel}</span>
              )}
            </span>
            <span className="tabular-nums">
              {price > 0 ? formatDollars(price) : "—"}
            </span>
          </div>
          <div className="flex justify-between items-baseline mt-1.5 pt-2 border-t border-[#F2E9E3] text-[#1F1513] text-[13.5px] font-bold">
            <span>Class subtotal</span>
            <span className="tabular-nums">
              {price > 0 ? formatDollars(price) : "—"}
            </span>
          </div>
        </div>
        <CardRemoveAction onClick={onRemoveItem} />
      </CartCardShell>
    );
  }

  // Drop-in
  const dates = item.selectedDateIds ?? [];
  const sessions = dates
    .map((id) => sessionMap.get(id))
    .filter((s): s is PublicSession => !!s)
    .sort((a, b) => (a.scheduleDate ?? "").localeCompare(b.scheduleDate ?? ""));

  const unitPrice =
    sessions.find((s) => s.dropInPrice != null)?.dropInPrice ??
    rep?.dropInPrice ??
    null;

  const selectedSet = new Set(dates);
  const availableSessions: PublicSession[] = [];
  if (item.classId) {
    for (const s of sessionMap.values()) {
      if (
        s.classId === item.classId &&
        s.pricingModel === "per_session" &&
        !selectedSet.has(s.id)
      ) {
        availableSessions.push(s);
      }
    }
    availableSessions.sort((a, b) =>
      (a.scheduleDate ?? "").localeCompare(b.scheduleDate ?? ""),
    );
  }

  const availableMonthGroups = (() => {
    const map = new Map<string, PublicSession[]>();
    for (const s of availableSessions) {
      if (!s.scheduleDate) continue;
      const key = s.scheduleDate.slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, list]) => ({ key, sessions: list }));
  })();

  const monthGroups = (() => {
    const map = new Map<string, PublicSession[]>();
    for (const s of sessions) {
      if (!s.scheduleDate) continue;
      const key = s.scheduleDate.slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, list]) => ({ key, sessions: list }));
  })();

  const meta = (
    <>
      <MetaItem icon={calIcon}>
        {dates.length} drop-in date{dates.length !== 1 ? "s" : ""} selected
      </MetaItem>
      {rep?.location && <MetaItem icon={pinIcon}>{rep.location}</MetaItem>}
    </>
  );

  return (
    <CartCardShell
      discipline={discipline}
      title={title}
      format="dropin"
      formatLabel="Drop-in"
      meta={meta}
    >
      <div className="flex justify-between items-center mb-2">
        <span className="text-[10px] uppercase tracking-[0.09em] font-bold text-[#A39189]">
          Selected Sessions
        </span>
        {unitPrice != null && (
          <span className="text-[12px] text-[#6D5A53] font-medium">
            {formatDollars(unitPrice)} per session
          </span>
        )}
      </div>

      <div className="flex flex-col">
        {monthGroups.map((mg) => {
          const monthTotal = mg.sessions.reduce(
            (sum, s) => sum + (s.dropInPrice ?? 0),
            0,
          );
          return (
            <div key={mg.key} className="mb-1.5">
              <div className="flex justify-between items-center px-1 py-2 border-b border-[#F2E9E3] mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6D5A53]">
                  {fmtMonth(mg.key)}
                  <span className="ml-1.5 text-[#A39189] font-medium normal-case tracking-normal">
                    · {mg.sessions.length} session{mg.sessions.length !== 1 ? "s" : ""}
                  </span>
                </span>
                <span className="text-[12.5px] font-bold tabular-nums text-[#1F1513]">
                  {formatDollars(monthTotal)}
                </span>
              </div>
              <div className="flex flex-col">
                {mg.sessions.map((s) => (
                  <div
                    key={s.id}
                    className="group flex items-center justify-between gap-3 px-2 py-1.5 rounded-md hover:bg-[#FAF2F0]"
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-[13px] font-medium text-[#1F1513]">
                        {fmtDayDate(s.scheduleDate ?? "")}
                      </span>
                      {s.startTime && (
                        <span className="text-[11.5px] text-[#6D5A53]">
                          {s.startTime}{s.endTime ? ` – ${s.endTime}` : ""}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-[13px] font-semibold tabular-nums">
                        {s.dropInPrice != null ? formatDollars(s.dropInPrice) : "—"}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemoveDate(s.id)}
                        aria-label={`Remove ${fmtDayDate(s.scheduleDate ?? "")}`}
                        title="Remove this session"
                        className="w-[22px] h-[22px] rounded-full flex items-center justify-center bg-transparent border-none text-[#A39189] hover:bg-[#F9EDEC] hover:text-[#8E2A23] transition-colors"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                          <path d="M5 5l14 14M19 5L5 19" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {availableSessions.length > 0 ? (
          <>
            <button
              type="button"
              onClick={() => setAddPickerOpen((v) => !v)}
              className="block w-full mt-2 text-center text-[12px] font-semibold text-[#5E3458] border border-dashed border-[#EBDFD9] rounded-md px-3 py-1.5 hover:bg-[#F7EEF6] hover:border-[#C090B8] transition-colors"
            >
              {addPickerOpen
                ? "Hide available dates"
                : `+ Add more dates from this class (${availableSessions.length} available)`}
            </button>
            {addPickerOpen && (
              <div className="mt-2 p-3 bg-[#FDFAF8] border border-[#F2E9E3] rounded-[10px]">
                <div className="text-[10px] uppercase tracking-[0.09em] font-bold text-[#A39189] mb-2">
                  Available Dates
                </div>
                {availableMonthGroups.map((mg) => (
                  <div key={mg.key} className="mb-2 last:mb-0">
                    <div className="flex justify-between items-center px-1 py-1.5 border-b border-[#F2E9E3] mb-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#6D5A53]">
                        {fmtMonth(mg.key)}
                        <span className="ml-1.5 text-[#A39189] font-medium normal-case tracking-normal">
                          · {mg.sessions.length} available
                        </span>
                      </span>
                    </div>
                    <div className="flex flex-col">
                      {mg.sessions.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-md hover:bg-white"
                        >
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[13px] font-medium text-[#1F1513]">
                              {fmtDayDate(s.scheduleDate ?? "")}
                            </span>
                            {s.startTime && (
                              <span className="text-[11.5px] text-[#6D5A53]">
                                {s.startTime}{s.endTime ? ` – ${s.endTime}` : ""}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2.5">
                            <span className="text-[13px] font-semibold tabular-nums text-[#6D5A53]">
                              {s.dropInPrice != null ? formatDollars(s.dropInPrice) : "—"}
                            </span>
                            <button
                              type="button"
                              onClick={() => onAddDate(s.id)}
                              className="px-2.5 py-1 bg-[#7A4A72] hover:bg-[#5E3458] text-white text-[11.5px] font-semibold rounded-md transition-colors"
                              aria-label={`Add ${fmtDayDate(s.scheduleDate ?? "")}`}
                            >
                              + Add
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="mt-2 text-center text-[12px] text-[#A39189] py-2">
            All available dates added.
          </div>
        )}

        <div className="mt-3.5 pt-3 border-t border-[#F2E9E3]">
          <div className="flex justify-between items-baseline py-1 text-[12.5px] text-[#6D5A53]">
            <span className="font-medium">
              {dates.length} session{dates.length !== 1 ? "s" : ""}
              {unitPrice != null && <> × {formatDollars(unitPrice)}</>}
            </span>
            <span className="tabular-nums">
              {price > 0 ? formatDollars(price) : "—"}
            </span>
          </div>
          <div className="flex justify-between items-baseline mt-1.5 pt-2 border-t border-[#F2E9E3] text-[#1F1513] text-[13.5px] font-bold">
            <span>Class subtotal</span>
            <span className="tabular-nums">
              {price > 0 ? formatDollars(price) : "—"}
            </span>
          </div>
        </div>
        <CardRemoveAction onClick={onRemoveItem} />
      </div>
    </CartCardShell>
  );
}

