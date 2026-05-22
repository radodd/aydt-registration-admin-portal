"use client";

import { InlineDatePicker } from "@/app/components/ui/InlineDatePicker";
import { createDiscount } from "@/app/admin/semesters/new/discounts/CreateDiscount";
import { deleteDiscount } from "@/app/admin/semesters/new/discounts/DeleteDiscount";
import { updateDiscount } from "@/app/admin/semesters/new/discounts/UpdateDiscount";
import { createCoupon } from "@/app/admin/semesters/new/discounts/createCoupon";
import { updateCoupon } from "@/app/admin/semesters/new/discounts/updateCoupon";
import { deleteCoupon } from "@/app/admin/semesters/new/discounts/deleteCoupon";
import { getCouponRedemptions } from "@/app/admin/semesters/actions/getCouponRedemptions";
import { getDiscounts } from "@/queries/admin";
import {
  AppliedSemesterDiscount,
  CouponRedemptionRecord,
  DiscountCategory,
  DiscountRules,
  DiscountsStepProps,
  DraftCoupon,
  EligibleSessionsMode,
  GiveSessionScope,
  HydratedDiscount,
  RecipientScope,
} from "@/types";
import { useEffect, useRef, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

type TabId = "discounts" | "coupons";

type DiscountDraft = {
  name: string;
  category: DiscountCategory;
  giveSessionScope: GiveSessionScope;
  recipientScope: RecipientScope;
  eligibleSessionsMode: EligibleSessionsMode;
  selectedSessionIds: string[];
  rules: DiscountRules[];
};

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

const EMPTY_DISCOUNT_DRAFT: DiscountDraft = {
  name: "",
  category: "multi_person",
  giveSessionScope: "one_session",
  recipientScope: "threshold_only",
  eligibleSessionsMode: "all",
  selectedSessionIds: [],
  rules: [
    {
      threshold: 2,
      value: 0,
      valueType: "flat",
      sessionScope: "one_session",
      recipientScope: "threshold_only",
    },
  ],
};

const EMPTY_COUPON: Omit<DraftCoupon, "_clientKey" | "id"> = {
  name: "",
  code: "",
  value: 0,
  valueType: "flat",
  validFrom: null,
  validUntil: null,
  maxTotalUses: null,
  usesCount: 0,
  maxPerFamily: 1,
  stackable: false,
  eligibleSessionsMode: "all",
  sessionIds: [],
  isActive: true,
  appliesToMostExpensiveOnly: false,
  eligibleLineItemTypes: ["tuition", "registration_fee", "recital_fee"],
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function draftFromHydrated(d: HydratedDiscount): DiscountDraft {
  return {
    name: d.name,
    category: d.category,
    giveSessionScope: d.give_session_scope as GiveSessionScope,
    recipientScope: (d.recipient_scope as RecipientScope) ?? "threshold_only",
    eligibleSessionsMode: d.eligible_sessions_mode,
    selectedSessionIds: d.discount_rule_meetings.map((s) => s.meeting_id),
    rules: d.discount_rules.map((r) => ({
      threshold: r.threshold,
      value: r.value,
      valueType: r.value_type,
      sessionScope:
        d.category === "multi_person" ? "one_session" : "threshold_session_only",
      recipientScope:
        d.category === "multi_person"
          ? ((d.recipient_scope as RecipientScope) ?? "threshold_only")
          : undefined,
    })),
  };
}

function couponDraftFromExisting(
  c: DraftCoupon,
): Omit<DraftCoupon, "_clientKey" | "id"> {
  return {
    name: c.name,
    code: c.code,
    value: c.value,
    valueType: c.valueType,
    validFrom: c.validFrom,
    validUntil: c.validUntil,
    maxTotalUses: c.maxTotalUses,
    usesCount: c.usesCount,
    maxPerFamily: c.maxPerFamily,
    stackable: c.stackable,
    eligibleSessionsMode: c.eligibleSessionsMode,
    sessionIds: c.sessionIds ?? [],
    isActive: c.isActive,
    appliesToMostExpensiveOnly: c.appliesToMostExpensiveOnly ?? false,
    eligibleLineItemTypes:
      c.eligibleLineItemTypes ?? ["tuition", "registration_fee", "recital_fee"],
  };
}

function categoryLabel(cat: string) {
  if (cat === "multi_person") return "Multi Person";
  if (cat === "multi_session") return "Multi Session";
  return cat.charAt(0).toUpperCase() + cat.slice(1).replaceAll("_", " ");
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export default function DiscountsStep({
  state,
  dispatch,
  isLocked = false,
}: DiscountsStepProps) {
  const [activeTab, setActiveTab] = useState<TabId>("discounts");

  /* ── Discounts state ──────────────────────────────────────────────── */
  const [allDiscounts, setAllDiscounts] = useState<HydratedDiscount[]>([]);
  const [applications, setApplications] = useState<AppliedSemesterDiscount[]>(
    state.discounts?.appliedDiscounts ?? [],
  );
  const [expandedDiscountIds, setExpandedDiscountIds] = useState<Set<string>>(
    new Set(),
  );
  const [discountDrafts, setDiscountDrafts] = useState<
    Record<string, DiscountDraft>
  >({});
  const [discountSaving, setDiscountSaving] = useState<
    Record<string, boolean>
  >({});
  const [discountErrors, setDiscountErrors] = useState<
    Record<string, string | null>
  >({});

  /* ── Coupons state ────────────────────────────────────────────────── */
  const [coupons, setCoupons] = useState<DraftCoupon[]>(state.coupons ?? []);
  const [expandedCouponKeys, setExpandedCouponKeys] = useState<Set<string>>(
    new Set(),
  );
  const [couponDrafts, setCouponDrafts] = useState<
    Record<string, Omit<DraftCoupon, "_clientKey" | "id">>
  >({});
  const [couponSaving, setCouponSaving] = useState<Record<string, boolean>>({});
  const [couponErrors, setCouponErrors] = useState<
    Record<string, string | null>
  >({});
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(
    null,
  );
  const [historyCache, setHistoryCache] = useState<
    Record<string, { loading: boolean; records: CouponRedemptionRecord[] }>
  >({});

  /* ── Keep global state in sync (for footer navigation) ───────────── */
  const isMountedRef = useRef(false);
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    dispatch({
      type: "SET_DISCOUNTS",
      payload: { appliedDiscounts: applications },
    });
  }, [applications]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isMountedRef.current) return;
    dispatch({ type: "SET_COUPONS", payload: coupons });
  }, [coupons]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Session options ──────────────────────────────────────────────── */
  const sessionOptions = (state.sessions?.classes ?? []).flatMap((cls) =>
    (cls.schedules ?? []).map((cs) => ({
      id: cs.id ?? "",
      name: `${cls.name} — ${cs.daysOfWeek
        .map((d) => d.charAt(0).toUpperCase() + d.slice(1))
        .join(", ")}`,
    })),
  );

  /* ── Load discounts ───────────────────────────────────────────────── */
  useEffect(() => {
    let active = true;
    async function load() {
      const data = await getDiscounts();
      if (active) setAllDiscounts(data ?? []);
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  async function refreshDiscounts() {
    const data = await getDiscounts();
    setAllDiscounts(data ?? []);
  }

  /* ── Discount handlers ────────────────────────────────────────────── */

  function isLinked(id: string) {
    return applications.some((a) => a.discountId === id);
  }

  function toggleLink(id: string) {
    if (isLocked) return;
    setApplications((prev) =>
      prev.some((a) => a.discountId === id)
        ? prev.filter((a) => a.discountId !== id)
        : [...prev, { discountId: id, scope: "all_sessions" }],
    );
  }

  function toggleExpandDiscount(id: string, discount?: HydratedDiscount) {
    setExpandedDiscountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    if (discount && !discountDrafts[id]) {
      setDiscountDrafts((d) => ({ ...d, [id]: draftFromHydrated(discount) }));
    }
  }

  function setDiscountDraftField<K extends keyof DiscountDraft>(
    id: string,
    key: K,
    value: DiscountDraft[K],
  ) {
    setDiscountDrafts((d) => {
      const current = d[id] ?? EMPTY_DISCOUNT_DRAFT;
      const updated = { ...current, [key]: value };
      if (key === "category") {
        const newCat = value as DiscountCategory;
        const isMulti = newCat === "multi_person";
        updated.rules = current.rules.map((r) => ({
          ...r,
          sessionScope: isMulti ? "one_session" : "threshold_session_only",
          recipientScope: isMulti
            ? (current.recipientScope ?? "threshold_only")
            : undefined,
        }));
      }
      return { ...d, [id]: updated };
    });
  }

  function updateDiscountRule<K extends keyof DiscountRules>(
    id: string,
    ri: number,
    key: K,
    value: DiscountRules[K],
  ) {
    setDiscountDrafts((d) => {
      const rules = [...(d[id]?.rules ?? [])];
      rules[ri] = { ...rules[ri], [key]: value };
      return { ...d, [id]: { ...(d[id] ?? EMPTY_DISCOUNT_DRAFT), rules } };
    });
  }

  function addDiscountRule(id: string) {
    setDiscountDrafts((d) => {
      const draft = d[id] ?? EMPTY_DISCOUNT_DRAFT;
      const isMulti = draft.category === "multi_person";
      return {
        ...d,
        [id]: {
          ...draft,
          rules: [
            ...draft.rules,
            {
              threshold: draft.rules.length + 2,
              value: 0,
              valueType: "flat",
              sessionScope: isMulti ? "one_session" : "threshold_session_only",
              recipientScope: isMulti ? "threshold_only" : undefined,
            } as DiscountRules,
          ],
        },
      };
    });
  }

  function removeDiscountRule(id: string, ri: number) {
    setDiscountDrafts((d) => ({
      ...d,
      [id]: {
        ...(d[id] ?? EMPTY_DISCOUNT_DRAFT),
        rules: (d[id]?.rules ?? []).filter((_, i) => i !== ri),
      },
    }));
  }

  async function saveDiscount(id: string, isNew: boolean) {
    const draft = discountDrafts[id];
    if (!draft?.name.trim()) {
      setDiscountErrors((e) => ({ ...e, [id]: "Discount name is required." }));
      return;
    }
    setDiscountSaving((s) => ({ ...s, [id]: true }));
    setDiscountErrors((e) => ({ ...e, [id]: null }));
    try {
      if (isNew) {
        await createDiscount({
          name: draft.name,
          category: draft.category,
          eligibleSessionsMode: draft.eligibleSessionsMode,
          giveSessionScope: draft.giveSessionScope,
          recipientScope: draft.recipientScope,
          rules: draft.rules,
          sessionIds:
            draft.eligibleSessionsMode === "selected"
              ? draft.selectedSessionIds
              : [],
        });
        setExpandedDiscountIds((prev) => {
          const next = new Set(prev);
          next.delete("new");
          return next;
        });
        setDiscountDrafts((d) => {
          const n = { ...d };
          delete n["new"];
          return n;
        });
      } else {
        await updateDiscount(id, {
          name: draft.name,
          category: draft.category,
          eligibleSessionsMode: draft.eligibleSessionsMode,
          giveSessionScope: draft.giveSessionScope,
          recipientScope: draft.recipientScope,
          rules: draft.rules,
          sessionIds:
            draft.eligibleSessionsMode === "selected"
              ? draft.selectedSessionIds
              : [],
        });
      }
      await refreshDiscounts();
    } catch (err) {
      setDiscountErrors((e) => ({
        ...e,
        [id]: err instanceof Error ? err.message : "Failed to save.",
      }));
    } finally {
      setDiscountSaving((s) => ({ ...s, [id]: false }));
    }
  }

  function openCreateDiscount() {
    setDiscountDrafts((d) => ({ ...d, new: { ...EMPTY_DISCOUNT_DRAFT } }));
    setExpandedDiscountIds((prev) => new Set([...prev, "new"]));
  }

  /* ── Coupon handlers ──────────────────────────────────────────────── */

  function openCreateCoupon() {
    setCouponDrafts((d) => ({ ...d, new: { ...EMPTY_COUPON } }));
    setExpandedCouponKeys((prev) => new Set([...prev, "new"]));
  }

  function toggleExpandCoupon(key: string, coupon?: DraftCoupon) {
    setExpandedCouponKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    if (coupon && !couponDrafts[key]) {
      setCouponDrafts((d) => ({
        ...d,
        [key]: couponDraftFromExisting(coupon),
      }));
    }
  }

  function setCouponDraftField<
    K extends keyof Omit<DraftCoupon, "_clientKey" | "id">,
  >(key: string, field: K, value: Omit<DraftCoupon, "_clientKey" | "id">[K]) {
    setCouponDrafts((d) => ({
      ...d,
      [key]: { ...(d[key] ?? EMPTY_COUPON), [field]: value },
    }));
  }

  async function saveCouponDraft(key: string, coupon?: DraftCoupon) {
    const draft = couponDrafts[key];
    if (!draft?.name.trim()) {
      setCouponErrors((e) => ({ ...e, [key]: "Coupon name is required." }));
      return;
    }
    if ((draft?.value ?? 0) <= 0) {
      setCouponErrors((e) => ({
        ...e,
        [key]: "Discount value must be greater than 0.",
      }));
      return;
    }
    if (!state.id) {
      setCouponErrors((e) => ({
        ...e,
        [key]: "Save the semester first before adding coupons.",
      }));
      return;
    }
    setCouponSaving((s) => ({ ...s, [key]: true }));
    setCouponErrors((e) => ({ ...e, [key]: null }));
    try {
      if (coupon?.id) {
        await updateCoupon({ ...draft, id: coupon.id });
        setCoupons((prev) =>
          prev.map((c) =>
            c._clientKey === key
              ? { ...draft, _clientKey: key, id: coupon.id }
              : c,
          ),
        );
      } else {
        const newId = await createCoupon({ ...draft, semesterId: state.id! });
        const newCoupon: DraftCoupon = { ...draft, _clientKey: newId, id: newId };
        setCoupons((prev) => [...prev, newCoupon]);
        setExpandedCouponKeys((prev) => {
          const next = new Set(prev);
          next.delete("new");
          return next;
        });
        setCouponDrafts((d) => {
          const n = { ...d };
          delete n["new"];
          return n;
        });
      }
    } catch (err) {
      setCouponErrors((e) => ({
        ...e,
        [key]: err instanceof Error ? err.message : "Failed to save coupon.",
      }));
    } finally {
      setCouponSaving((s) => ({ ...s, [key]: false }));
    }
  }

  async function handleDeleteCoupon(coupon: DraftCoupon) {
    if (!confirm(`Delete coupon "${coupon.name}"? This cannot be undone.`))
      return;
    if (coupon.id) await deleteCoupon(coupon.id);
    setCoupons((prev) => prev.filter((c) => c._clientKey !== coupon._clientKey));
  }

  async function toggleHistory(couponId: string) {
    if (expandedHistoryId === couponId) {
      setExpandedHistoryId(null);
      return;
    }
    setExpandedHistoryId(couponId);
    if (!historyCache[couponId]) {
      setHistoryCache((h) => ({
        ...h,
        [couponId]: { loading: true, records: [] },
      }));
      try {
        const records = await getCouponRedemptions(couponId);
        setHistoryCache((h) => ({
          ...h,
          [couponId]: { loading: false, records },
        }));
      } catch {
        setHistoryCache((h) => ({
          ...h,
          [couponId]: { loading: false, records: [] },
        }));
      }
    }
  }

  /* ── Shared style constants ───────────────────────────────────────── */

  const inputCls =
    "w-full border border-neutral-200 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500";
  const selectCls =
    "border border-neutral-200 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500";
  const labelCls = "block text-xs font-medium text-neutral-500 mb-1";

  /* ── Render helpers ───────────────────────────────────────────────── */

  function renderDiscountItem(id: string, discount?: HydratedDiscount) {
    const isNew = id === "new";
    const expanded = expandedDiscountIds.has(id);
    const linked = !isNew && isLinked(id);
    const draft = discountDrafts[id] ?? (discount ? draftFromHydrated(discount) : EMPTY_DISCOUNT_DRAFT);
    const saving = discountSaving[id] ?? false;
    const error = discountErrors[id] ?? null;
    const rulesCount = discount?.discount_rules?.length ?? 0;

    return (
      <div
        key={id}
        className={`border rounded-lg overflow-hidden mb-1 ${
          linked ? "border-primary-200" : "border-neutral-200"
        }`}
        style={{ background: "var(--admin-surface)" }}
      >
        {/* Row header */}
        <div className="flex items-center gap-2.5 px-4 py-3">
          {/* Chevron */}
          <button
            onClick={() =>
              isNew
                ? setExpandedDiscountIds((prev) => {
                    const next = new Set(prev);
                    expanded ? next.delete("new") : next.add("new");
                    return next;
                  })
                : toggleExpandDiscount(id, discount)
            }
            className="shrink-0 transition-colors"
            style={{ color: "var(--admin-text-faint)" }}
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Link toggle (not shown for new) */}
          {!isNew && (
            <button
              role="switch"
              aria-checked={linked}
              onClick={() => toggleLink(id)}
              disabled={isLocked}
              className={`relative shrink-0 inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
                linked ? "bg-primary-600" : "bg-neutral-200"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
                  linked ? "translate-x-[18px]" : "translate-x-0.5"
                }`}
              />
            </button>
          )}

          {/* Name + badges */}
          <div className="flex-1 flex items-center gap-2 min-w-0 flex-wrap">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--admin-text)" }}
            >
              {isNew ? (draft.name || "New Discount") : (discount?.name ?? "")}
            </span>
            {linked && (
              <span className="text-xs font-semibold text-primary-600">
                Linked
              </span>
            )}
            {!isNew && (
              <>
                <span className="text-xs bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded-full capitalize">
                  {categoryLabel(discount!.category)}
                </span>
                <span className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
                  {rulesCount} rule{rulesCount !== 1 ? "s" : ""}
                </span>
              </>
            )}
          </div>

          {/* Delete / Cancel */}
          {!isLocked && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (isNew) {
                  setExpandedDiscountIds((prev) => {
                    const next = new Set(prev);
                    next.delete("new");
                    return next;
                  });
                  setDiscountDrafts((d) => {
                    const n = { ...d };
                    delete n["new"];
                    return n;
                  });
                } else {
                  if (!confirm(`Delete "${discount!.name}"? This cannot be undone.`)) return;
                  await deleteDiscount(id);
                  await refreshDiscounts();
                }
              }}
              className="shrink-0 text-xs font-medium transition-colors px-2 py-1 rounded hover:bg-red-50"
              style={{ color: "var(--admin-text-faint)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "rgb(220 38 38)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--admin-text-faint)")}
            >
              {isNew ? "Cancel" : "Delete"}
            </button>
          )}
        </div>

        {/* Expanded inline form */}
        {expanded && (
          <div
            className="px-4 pb-5 pt-4 space-y-4"
            style={{ borderTop: "1px solid var(--admin-border)" }}
          >
            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            {/* Name + Type */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-4">
              <div>
                <label className={labelCls}>Discount name</label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) =>
                    setDiscountDraftField(id, "name", e.target.value)
                  }
                  placeholder="Discount name"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Type</label>
                <select
                  value={draft.category}
                  onChange={(e) =>
                    setDiscountDraftField(
                      id,
                      "category",
                      e.target.value as DiscountCategory,
                    )
                  }
                  className={`${selectCls} w-full`}
                >
                  <option value="multi_person">Multi Person</option>
                  <option value="multi_session">Multi Session</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </div>

            {/* Eligible sessions */}
            <div>
              <label className={labelCls}>Eligible sessions</label>
              <div className="flex gap-5">
                <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                  <input
                    type="radio"
                    checked={draft.eligibleSessionsMode === "all"}
                    onChange={() =>
                      setDiscountDraftField(id, "eligibleSessionsMode", "all")
                    }
                    className="h-4 w-4 text-primary-600 border-neutral-300 focus:ring-primary-600"
                    style={{ accentColor: "var(--admin-sidebar-active)" }}
                  />
                  All sessions
                </label>
                <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                  <input
                    type="radio"
                    checked={draft.eligibleSessionsMode === "selected"}
                    onChange={() =>
                      setDiscountDraftField(
                        id,
                        "eligibleSessionsMode",
                        "selected",
                      )
                    }
                    className="h-4 w-4 text-primary-600 border-neutral-300 focus:ring-primary-600"
                    style={{ accentColor: "var(--admin-sidebar-active)" }}
                  />
                  Selected sessions
                </label>
              </div>
              {draft.eligibleSessionsMode === "selected" &&
                sessionOptions.length > 0 && (
                  <div className="mt-2 border border-neutral-200 rounded-md p-3 space-y-1.5 max-h-36 overflow-y-auto">
                    {sessionOptions.map((s) => (
                      <label
                        key={s.id}
                        className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={draft.selectedSessionIds.includes(s.id)}
                          onChange={(e) =>
                            setDiscountDraftField(
                              id,
                              "selectedSessionIds",
                              e.target.checked
                                ? [...draft.selectedSessionIds, s.id]
                                : draft.selectedSessionIds.filter(
                                    (x) => x !== s.id,
                                  ),
                            )
                          }
                          className="h-4 w-4 text-primary-600 border-neutral-300"
                          style={{ accentColor: "var(--admin-sidebar-active)" }}
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                )}
            </div>

            {/* Give discount to */}
            {(draft.category === "multi_person" ||
              draft.category === "multi_session") && (
              <div>
                <label className={labelCls}>Give discount to</label>
                {draft.category === "multi_person" ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={draft.giveSessionScope}
                      onChange={(e) =>
                        setDiscountDraftField(
                          id,
                          "giveSessionScope",
                          e.target.value as GiveSessionScope,
                        )
                      }
                      className={selectCls}
                    >
                      <option value="one_session">1 session</option>
                      <option value="all_sessions">All sessions</option>
                    </select>
                    <span className="text-sm text-neutral-500">for</span>
                    <select
                      value={draft.recipientScope}
                      onChange={(e) =>
                        setDiscountDraftField(
                          id,
                          "recipientScope",
                          e.target.value as RecipientScope,
                        )
                      }
                      className={selectCls}
                    >
                      <option value="threshold_only">
                        the threshold registrant only
                      </option>
                      <option value="threshold_and_additional">
                        threshold + additional registrants
                      </option>
                    </select>
                  </div>
                ) : (
                  <select
                    value={draft.giveSessionScope}
                    onChange={(e) =>
                      setDiscountDraftField(
                        id,
                        "giveSessionScope",
                        e.target.value as GiveSessionScope,
                      )
                    }
                    className={`${selectCls} w-full max-w-xs`}
                  >
                    <option value="all_sessions_once_threshold">
                      All sessions once threshold reached
                    </option>
                    <option value="threshold_session_only">
                      Threshold session only
                    </option>
                    <option value="threshold_and_additional_sessions">
                      Threshold + additional sessions
                    </option>
                  </select>
                )}
              </div>
            )}

            {/* Discount rules */}
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-widest mb-2"
                style={{ color: "var(--admin-text-faint)" }}
              >
                Discount rules
              </p>
              <div className="space-y-2">
                {draft.rules.map((rule, ri) => (
                  <div key={ri} className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-neutral-600">
                      If there are
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={rule.threshold}
                      onChange={(e) =>
                        updateDiscountRule(
                          id,
                          ri,
                          "threshold",
                          Number(e.target.value),
                        )
                      }
                      className="w-16 border border-neutral-200 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                    <span className="text-sm text-neutral-600">
                      {draft.category === "multi_person" ? "persons" : "sessions"}{" "}
                      registered, give
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={rule.value}
                      onChange={(e) =>
                        updateDiscountRule(
                          id,
                          ri,
                          "value",
                          Number(e.target.value),
                        )
                      }
                      className="w-20 border border-neutral-200 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                    <select
                      value={rule.valueType}
                      onChange={(e) =>
                        updateDiscountRule(
                          id,
                          ri,
                          "valueType",
                          e.target.value as "flat" | "percent",
                        )
                      }
                      className={selectCls}
                    >
                      <option value="flat">dollars off</option>
                      <option value="percent">% off</option>
                    </select>
                    {draft.rules.length > 1 && (
                      <button
                        onClick={() => removeDiscountRule(id, ri)}
                        className="text-xs text-neutral-400 hover:text-red-500 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={() => addDiscountRule(id)}
                className="mt-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
              >
                + Add another rule
              </button>
            </div>

            {/* Save */}
            <div className="flex justify-end pt-1">
              <button
                onClick={() => saveDiscount(id, isNew)}
                disabled={saving}
                className="text-sm font-semibold text-white rounded-lg px-4 py-2 transition-colors hover:opacity-90 disabled:opacity-60"
                style={{ background: "var(--admin-sidebar-active)" }}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderCouponItem(couponKey: string, coupon?: DraftCoupon) {
    const isNew = couponKey === "new";
    const expanded = expandedCouponKeys.has(couponKey);
    const draft =
      couponDrafts[couponKey] ??
      (coupon ? couponDraftFromExisting(coupon) : EMPTY_COUPON);
    const saving = couponSaving[couponKey] ?? false;
    const error = couponErrors[couponKey] ?? null;

    const valueText = coupon
      ? coupon.valueType === "flat"
        ? `$${coupon.value} off`
        : `${coupon.value}% off`
      : null;
    const usageText = coupon
      ? coupon.maxTotalUses !== null
        ? `${coupon.usesCount} / ${coupon.maxTotalUses} uses`
        : `${coupon.usesCount} uses`
      : null;

    return (
      <div
        key={couponKey}
        className="border border-neutral-200 rounded-lg overflow-hidden mb-1"
        style={{ background: "var(--admin-surface)" }}
      >
        {/* Row header */}
        <div className="flex items-center gap-2.5 px-4 py-3">
          {/* Chevron */}
          <button
            onClick={() =>
              isNew
                ? setExpandedCouponKeys((prev) => {
                    const next = new Set(prev);
                    expanded ? next.delete("new") : next.add("new");
                    return next;
                  })
                : toggleExpandCoupon(couponKey, coupon)
            }
            className="shrink-0 transition-colors"
            style={{ color: "var(--admin-text-faint)" }}
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Name + badges */}
          <div className="flex-1 flex items-center gap-2 min-w-0 flex-wrap">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--admin-text)" }}
            >
              {isNew ? (draft.name || "New Coupon") : (coupon?.name ?? "")}
            </span>
            {coupon?.code && (
              <span className="text-xs font-mono bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded">
                {coupon.code}
              </span>
            )}
            {coupon && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                  coupon.isActive
                    ? "bg-green-50 text-green-700"
                    : "bg-neutral-100 text-neutral-500"
                }`}
              >
                {coupon.isActive ? "Active" : "Inactive"}
              </span>
            )}
            {valueText && (
              <span
                className="text-xs"
                style={{ color: "var(--admin-text-faint)" }}
              >
                {valueText} · {usageText}
              </span>
            )}
          </div>

          {/* History + Delete/Cancel */}
          <div className="flex items-center gap-1 shrink-0">
            {coupon?.id && (
              <button
                onClick={() => toggleHistory(coupon.id!)}
                className="text-xs font-medium transition-colors px-2 py-1 rounded hover:bg-neutral-50"
                style={{ color: "var(--admin-text-faint)" }}
              >
                {expandedHistoryId === coupon.id ? "Hide history" : "History"}
              </button>
            )}
            {!isLocked && (
              <button
                onClick={async () => {
                  if (isNew) {
                    setExpandedCouponKeys((prev) => {
                      const next = new Set(prev);
                      next.delete("new");
                      return next;
                    });
                    setCouponDrafts((d) => {
                      const n = { ...d };
                      delete n["new"];
                      return n;
                    });
                  } else if (coupon) {
                    await handleDeleteCoupon(coupon);
                  }
                }}
                className="text-xs font-medium transition-colors px-2 py-1 rounded hover:bg-red-50"
                style={{ color: "var(--admin-text-faint)" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = "rgb(220 38 38)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "var(--admin-text-faint)")
                }
              >
                {isNew ? "Cancel" : "Delete"}
              </button>
            )}
          </div>
        </div>

        {/* Redemption history panel */}
        {coupon?.id && expandedHistoryId === coupon.id && (
          <div
            className="px-4 py-3"
            style={{ borderTop: "1px solid var(--admin-border)" }}
          >
            {historyCache[coupon.id]?.loading && (
              <p className="text-xs py-1" style={{ color: "var(--admin-text-faint)" }}>
                Loading…
              </p>
            )}
            {!historyCache[coupon.id]?.loading &&
              (historyCache[coupon.id]?.records.length ?? 0) === 0 && (
                <p className="text-xs py-1" style={{ color: "var(--admin-text-faint)" }}>
                  No redemptions yet.
                </p>
              )}
            {(historyCache[coupon.id]?.records ?? []).map((r) => (
              <div
                key={r.id}
                className="flex justify-between items-center text-xs py-1 border-b border-neutral-100 last:border-0"
                style={{ color: "var(--admin-text-muted)" }}
              >
                <span>{r.familyName ?? r.familyId}</span>
                <span style={{ color: "var(--admin-text-faint)" }}>
                  {new Date(r.redeemedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Expanded inline form */}
        {expanded && (
          <div
            className="px-4 pb-5 pt-4 space-y-4"
            style={{ borderTop: "1px solid var(--admin-border)" }}
          >
            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            {/* Name + Coupon code */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Name</label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) =>
                    setCouponDraftField(couponKey, "name", e.target.value)
                  }
                  placeholder="e.g. Fall Early Bird"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Coupon code</label>
                <input
                  type="text"
                  value={draft.code ?? ""}
                  onChange={(e) =>
                    setCouponDraftField(
                      couponKey,
                      "code",
                      e.target.value || null,
                    )
                  }
                  placeholder="e.g. FALL2026"
                  className={`${inputCls} font-mono uppercase`}
                />
                <p
                  className="text-xs mt-1"
                  style={{ color: "var(--admin-text-faint)" }}
                >
                  Leave blank to auto-apply by date range.
                </p>
              </div>
            </div>

            {/* Discount amount + Type + Max per family */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Discount amount</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={draft.value || ""}
                  onChange={(e) =>
                    setCouponDraftField(
                      couponKey,
                      "value",
                      parseFloat(e.target.value) || 0,
                    )
                  }
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Type</label>
                <select
                  value={draft.valueType}
                  onChange={(e) =>
                    setCouponDraftField(
                      couponKey,
                      "valueType",
                      e.target.value as "flat" | "percent",
                    )
                  }
                  className={`${selectCls} w-full`}
                >
                  <option value="flat">$ Off</option>
                  <option value="percent">% Off</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Max per family</label>
                <input
                  type="number"
                  min={1}
                  value={draft.maxPerFamily}
                  onChange={(e) =>
                    setCouponDraftField(
                      couponKey,
                      "maxPerFamily",
                      parseInt(e.target.value, 10) || 1,
                    )
                  }
                  className={inputCls}
                />
              </div>
            </div>

            {/* Valid from + Expires */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Valid from (optional)</label>
                <InlineDatePicker
                  value={draft.validFrom?.slice(0, 10) ?? ""}
                  onChange={(v) =>
                    setCouponDraftField(
                      couponKey,
                      "validFrom",
                      v ? new Date(v + "T00:00:00").toISOString() : null,
                    )
                  }
                />
              </div>
              <div>
                <label className={labelCls}>Expires (optional)</label>
                <InlineDatePicker
                  value={draft.validUntil?.slice(0, 10) ?? ""}
                  onChange={(v) =>
                    setCouponDraftField(
                      couponKey,
                      "validUntil",
                      v ? new Date(v + "T00:00:00").toISOString() : null,
                    )
                  }
                />
              </div>
            </div>

            {/* Max total uses */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Max total uses (optional)</label>
                <input
                  type="number"
                  min={1}
                  value={draft.maxTotalUses ?? ""}
                  onChange={(e) =>
                    setCouponDraftField(
                      couponKey,
                      "maxTotalUses",
                      e.target.value ? parseInt(e.target.value, 10) : null,
                    )
                  }
                  placeholder="Unlimited"
                  className={inputCls}
                />
              </div>
            </div>

            {/* Discount applies to */}
            <div>
              <label className={labelCls}>Discount applies to</label>
              <div className="flex flex-wrap gap-4">
                {(
                  [
                    ["tuition", "Tuition"],
                    ["registration_fee", "Registration fee"],
                    ["recital_fee", "Recital fee"],
                  ] as const
                ).map(([type, label]) => {
                  const checked = (
                    draft.eligibleLineItemTypes ?? []
                  ).includes(type);
                  return (
                    <label
                      key={type}
                      className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setCouponDraftField(
                            couponKey,
                            "eligibleLineItemTypes",
                            e.target.checked
                              ? [...(draft.eligibleLineItemTypes ?? []), type]
                              : (draft.eligibleLineItemTypes ?? []).filter(
                                  (t) => t !== type,
                                ),
                          )
                        }
                        className="h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-600"
                        style={{ accentColor: "var(--admin-sidebar-active)" }}
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Additional options */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.stackable}
                  onChange={(e) =>
                    setCouponDraftField(couponKey, "stackable", e.target.checked)
                  }
                  className="h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-600"
                  style={{ accentColor: "var(--admin-sidebar-active)" }}
                />
                Can stack with multi-class discounts
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.appliesToMostExpensiveOnly ?? false}
                  onChange={(e) =>
                    setCouponDraftField(
                      couponKey,
                      "appliesToMostExpensiveOnly",
                      e.target.checked,
                    )
                  }
                  className="h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-600"
                  style={{ accentColor: "var(--admin-sidebar-active)" }}
                />
                Apply to most expensive eligible item only
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(e) =>
                    setCouponDraftField(couponKey, "isActive", e.target.checked)
                  }
                  className="h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-600"
                  style={{ accentColor: "var(--admin-sidebar-active)" }}
                />
                Active
              </label>
            </div>

            {/* Save */}
            <div className="flex justify-end pt-1">
              <button
                onClick={() => saveCouponDraft(couponKey, coupon)}
                disabled={saving}
                className="text-sm font-semibold text-white rounded-lg px-4 py-2 transition-colors hover:opacity-90 disabled:opacity-60"
                style={{ background: "var(--admin-sidebar-active)" }}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Render ───────────────────────────────────────────────────────── */

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2
          className="text-xl font-semibold"
          style={{ color: "var(--admin-text)" }}
        >
          Discounts &amp; coupons
        </h2>
        <p className="text-sm mt-0.5" style={{ color: "var(--admin-text-muted)" }}>
          Link automatic discounts and create coupon codes for this semester.
        </p>
      </div>

      {isLocked && (
        <div className="mb-5 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          This semester has active registrations. Discounts and coupons are locked.
        </div>
      )}

      {/* Tabs */}
      <div
        className="flex items-center gap-6 mb-5"
        style={{ borderBottom: "1px solid var(--admin-border)" }}
      >
        {(["discounts", "coupons"] as TabId[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="relative pb-3 text-sm font-medium transition-colors"
            style={{
              color:
                activeTab === tab
                  ? "var(--admin-text)"
                  : "var(--admin-text-faint)",
            }}
          >
            {tab === "discounts" ? "Discounts" : "Coupons"}
            {activeTab === tab && (
              <span
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                style={{ background: "var(--admin-sidebar-active)" }}
              />
            )}
          </button>
        ))}
      </div>

      {/* ── Discounts Tab ──────────────────────────────────────────────── */}
      {activeTab === "discounts" && (
        <div>
          <div className="flex items-start justify-between mb-4">
            <p
              className="text-sm"
              style={{ color: "var(--admin-text-muted)" }}
            >
              Toggle to link a discount to this semester. Expand to view or
              edit its rules.
            </p>
            {!isLocked && (
              <button
                onClick={openCreateDiscount}
                className="shrink-0 ml-6 text-sm font-semibold text-white rounded-lg px-3 py-1.5 transition hover:opacity-90"
                style={{ background: "var(--admin-sidebar-active)" }}
              >
                + Create discount
              </button>
            )}
          </div>

          {expandedDiscountIds.has("new") && renderDiscountItem("new")}

          {allDiscounts.length === 0 && !expandedDiscountIds.has("new") && (
            <div
              className="rounded-lg border border-dashed p-8 text-center"
              style={{ borderColor: "var(--admin-border)" }}
            >
              <p
                className="text-sm"
                style={{ color: "var(--admin-text-faint)" }}
              >
                No discounts yet.
              </p>
            </div>
          )}

          {allDiscounts.map((d) => renderDiscountItem(d.id, d))}
        </div>
      )}

      {/* ── Coupons Tab ────────────────────────────────────────────────── */}
      {activeTab === "coupons" && (
        <div>
          <div className="flex items-start justify-between mb-4">
            <p
              className="text-sm"
              style={{ color: "var(--admin-text-muted)" }}
            >
              Coupon codes families can enter at checkout for this semester.
            </p>
            {!isLocked && (
              <button
                onClick={openCreateCoupon}
                className="shrink-0 ml-6 text-sm font-semibold text-white rounded-lg px-3 py-1.5 transition hover:opacity-90"
                style={{ background: "var(--admin-sidebar-active)" }}
              >
                + Create coupon
              </button>
            )}
          </div>

          {expandedCouponKeys.has("new") && renderCouponItem("new")}

          {coupons.length === 0 && !expandedCouponKeys.has("new") && (
            <div
              className="rounded-lg border border-dashed p-8 text-center"
              style={{ borderColor: "var(--admin-border)" }}
            >
              <p
                className="text-sm"
                style={{ color: "var(--admin-text-faint)" }}
              >
                No coupon codes yet.
              </p>
            </div>
          )}

          {coupons.map((c) => renderCouponItem(c._clientKey, c))}
        </div>
      )}
    </div>
  );
}
