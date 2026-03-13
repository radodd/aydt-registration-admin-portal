"use client";

import CreateDiscountForm from "@/app/components/semester-flow/CreateDiscountForm";
import EditDiscountForm from "@/app/components/semester-flow/EditDiscountForm";
import { deleteDiscount } from "@/app/admin/semesters/new/discounts/DeleteDiscount";
import { createCoupon } from "@/app/admin/semesters/new/discounts/createCoupon";
import { updateCoupon } from "@/app/admin/semesters/new/discounts/updateCoupon";
import { deleteCoupon } from "@/app/admin/semesters/new/discounts/deleteCoupon";
import { getCouponRedemptions } from "@/app/admin/semesters/actions/getCouponRedemptions";
import { getDiscounts } from "@/queries/admin";
import {
  AppliedSemesterDiscount,
  CouponRedemptionRecord,
  DiscountsStepProps,
  DraftCoupon,
  HydratedDiscount,
} from "@/types";

import { useEffect, useState } from "react";

type TabId = "discounts" | "coupons";

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

export default function DiscountsStep({
  state,
  dispatch,
  onNext,
  onBack,
  isLocked = false,
}: DiscountsStepProps) {
  const [activeTab, setActiveTab] = useState<TabId>("discounts");

  /* ────────────────────────────── Discounts tab state ─────────────────── */
  const [allDiscounts, setAllDiscounts] = useState<HydratedDiscount[]>([]);
  const [applications, setApplications] = useState<AppliedSemesterDiscount[]>(
    state.discounts?.appliedDiscounts ?? [],
  );
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingDiscount, setEditingDiscount] =
    useState<HydratedDiscount | null>(null);

  /* ────────────────────────────── Coupons tab state ───────────────────── */
  const [coupons, setCoupons] = useState<DraftCoupon[]>(
    state.coupons ?? [],
  );
  const [showCouponForm, setShowCouponForm] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<DraftCoupon | null>(null);
  const [couponDraft, setCouponDraft] = useState<
    Omit<DraftCoupon, "_clientKey" | "id">
  >(EMPTY_COUPON);
  const [couponSaving, setCouponSaving] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [historyCache, setHistoryCache] = useState<
    Record<string, { loading: boolean; records: CouponRedemptionRecord[] }>
  >({});

  /* ────────────────────────────── Session options ──────────────────────── */
  const sessionOptions = (state.sessions?.classes ?? []).flatMap((cls) =>
    (cls.schedules ?? []).map((cs) => ({
      id: cs.id ?? "",
      name: `${cls.name} — ${cs.daysOfWeek
        .map((d) => d.charAt(0).toUpperCase() + d.slice(1))
        .join(", ")}`,
    })),
  );

  /* ────────────────────────────── Discount loading ─────────────────────── */
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

  /* ────────────────────────────── Discount handlers ────────────────────── */

  function isSelected(discountId: string) {
    return applications.some((a) => a.discountId === discountId);
  }

  function toggleSelection(discountId: string) {
    setApplications((prev) =>
      prev.some((a) => a.discountId === discountId)
        ? prev.filter((a) => a.discountId !== discountId)
        : [...prev, { discountId, scope: "all_sessions" }],
    );
  }

  /* ────────────────────────────── Coupon handlers ──────────────────────── */

  function openCreateCoupon() {
    setCouponDraft(EMPTY_COUPON);
    setEditingCoupon(null);
    setCouponError(null);
    setShowCouponForm(true);
  }

  function openEditCoupon(coupon: DraftCoupon) {
    setCouponDraft({
      name: coupon.name,
      code: coupon.code,
      value: coupon.value,
      valueType: coupon.valueType,
      validFrom: coupon.validFrom,
      validUntil: coupon.validUntil,
      maxTotalUses: coupon.maxTotalUses,
      usesCount: coupon.usesCount,
      maxPerFamily: coupon.maxPerFamily,
      stackable: coupon.stackable,
      eligibleSessionsMode: coupon.eligibleSessionsMode,
      sessionIds: coupon.sessionIds ?? [],
      isActive: coupon.isActive,
      appliesToMostExpensiveOnly: coupon.appliesToMostExpensiveOnly ?? false,
      eligibleLineItemTypes: coupon.eligibleLineItemTypes ?? ["tuition", "registration_fee", "recital_fee"],
    });
    setEditingCoupon(coupon);
    setCouponError(null);
    setShowCouponForm(true);
  }

  async function saveCoupon() {
    if (!couponDraft.name.trim()) {
      setCouponError("Coupon name is required.");
      return;
    }
    if (couponDraft.value <= 0) {
      setCouponError("Discount value must be greater than 0.");
      return;
    }
    if (!state.id) {
      setCouponError("Save the semester first before adding coupons.");
      return;
    }
    setCouponSaving(true);
    setCouponError(null);
    try {
      if (editingCoupon?.id) {
        await updateCoupon({ ...couponDraft, id: editingCoupon.id });
        setCoupons((prev) =>
          prev.map((c) =>
            c.id === editingCoupon.id
              ? { ...couponDraft, _clientKey: editingCoupon._clientKey, id: editingCoupon.id }
              : c,
          ),
        );
      } else {
        const newId = await createCoupon({
          ...couponDraft,
          semesterId: state.id!,
        });
        const newCoupon: DraftCoupon = {
          ...couponDraft,
          _clientKey: newId,
          id: newId,
        };
        setCoupons((prev) => [...prev, newCoupon]);
      }
      setShowCouponForm(false);
    } catch (err) {
      setCouponError(
        err instanceof Error ? err.message : "Failed to save coupon.",
      );
    } finally {
      setCouponSaving(false);
    }
  }

  async function handleDeleteCoupon(coupon: DraftCoupon) {
    if (!confirm(`Delete coupon "${coupon.name}"? This cannot be undone.`))
      return;
    if (coupon.id) {
      await deleteCoupon(coupon.id);
    }
    setCoupons((prev) => prev.filter((c) => c._clientKey !== coupon._clientKey));
  }

  async function toggleHistory(couponId: string) {
    if (expandedHistoryId === couponId) {
      setExpandedHistoryId(null);
      return;
    }
    setExpandedHistoryId(couponId);
    if (!historyCache[couponId]) {
      setHistoryCache((h) => ({ ...h, [couponId]: { loading: true, records: [] } }));
      try {
        const records = await getCouponRedemptions(couponId);
        setHistoryCache((h) => ({ ...h, [couponId]: { loading: false, records } }));
      } catch {
        setHistoryCache((h) => ({ ...h, [couponId]: { loading: false, records: [] } }));
      }
    }
  }

  /* ────────────────────────────── Submit ───────────────────────────────── */

  function handleSubmit() {
    dispatch({
      type: "SET_DISCOUNTS",
      payload: { appliedDiscounts: applications },
    });
    dispatch({ type: "SET_COUPONS", payload: coupons });
    onNext();
  }

  /* ────────────────────────────── Render ───────────────────────────────── */

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Discounts & Coupons
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Configure automatic discounts and promo codes for this semester.
          </p>
        </div>

        {isLocked && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            This semester has active registrations. Discounts and coupons are locked.
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {(["discounts", "coupons"] as TabId[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition capitalize ${
                activeTab === tab
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "discounts" ? "Discounts" : "Promo Codes"}
            </button>
          ))}
        </div>

        {/* ── Discounts Tab ─────────────────────────────────────────────── */}
        {activeTab === "discounts" && (
          <div className="space-y-4">
            {!isLocked && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-700 transition"
              >
                + Create New Discount
              </button>
            )}

            {showCreateModal && (
              <div className="fixed inset-0 bg-blur bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-2xl shadow-lg p-8 max-w-2xl w-full mx-4">
                  <CreateDiscountForm
                    sessions={sessionOptions}
                    onCreated={async () => {
                      await refreshDiscounts();
                      setShowCreateModal(false);
                    }}
                    onCancel={() => setShowCreateModal(false)}
                  />
                </div>
              </div>
            )}

            {editingDiscount && (
              <EditDiscountForm
                discount={editingDiscount}
                sessions={sessionOptions}
                onSaved={async () => {
                  await refreshDiscounts();
                  setEditingDiscount(null);
                }}
                onCancel={() => setEditingDiscount(null)}
              />
            )}

            {allDiscounts.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center">
                <p className="text-sm text-gray-500">No discounts available</p>
              </div>
            )}

            {allDiscounts.map((discount) => {
              const selected = isSelected(discount.id);
              const categoryLabel = discount.category.replaceAll("_", " ");
              const rulesCount = discount.discount_rules?.length ?? 0;

              return (
                <div
                  key={discount.id}
                  onClick={() => !isLocked && toggleSelection(discount.id)}
                  className={`flex items-start gap-3 border rounded-xl p-4 transition cursor-pointer ${
                    selected
                      ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-400"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  } ${isLocked ? "cursor-default opacity-60" : ""}`}
                >
                  <input
                    id={`discount-${discount.id}`}
                    type="checkbox"
                    checked={selected}
                    onChange={() => !isLocked && toggleSelection(discount.id)}
                    disabled={isLocked}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <label
                      htmlFor={`discount-${discount.id}`}
                      className={`text-sm font-medium cursor-pointer ${selected ? "text-indigo-800" : "text-gray-800"}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {discount.name}
                    </label>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">
                        {categoryLabel}
                      </span>
                      <span className="text-xs text-gray-400">
                        {rulesCount} rule{rulesCount !== 1 ? "s" : ""}
                      </span>
                      {discount.eligible_sessions_mode === "selected" && (
                        <span className="text-xs text-amber-600">
                          Selected sessions only
                        </span>
                      )}
                    </div>
                  </div>
                  {!isLocked && (
                    <div
                      className="flex items-center gap-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => setEditingDiscount(discount)}
                        className="text-xs font-medium text-gray-400 hover:text-indigo-600 transition px-2 py-1 rounded-lg hover:bg-indigo-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={async () => {
                          if (
                            !confirm(
                              `Delete "${discount.name}"? This cannot be undone.`,
                            )
                          )
                            return;
                          await deleteDiscount(discount.id);
                          await refreshDiscounts();
                        }}
                        className="text-xs font-medium text-gray-400 hover:text-red-600 transition px-2 py-1 rounded-lg hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Coupons Tab ───────────────────────────────────────────────── */}
        {activeTab === "coupons" && (
          <div className="space-y-4">
            {!isLocked && (
              <button
                onClick={openCreateCoupon}
                className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-700 transition"
              >
                + Create New Promo Code
              </button>
            )}

            {/* Coupon form modal */}
            {showCouponForm && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl shadow-xl p-8 max-w-lg w-full space-y-5">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {editingCoupon ? "Edit Promo Code" : "New Promo Code"}
                  </h3>

                  {couponError && (
                    <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                      {couponError}
                    </div>
                  )}

                  <div className="space-y-4">
                    {/* Name */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Name
                      </label>
                      <input
                        type="text"
                        value={couponDraft.name}
                        onChange={(e) =>
                          setCouponDraft((d) => ({ ...d, name: e.target.value }))
                        }
                        placeholder="e.g. Fall Early Registration"
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    {/* Code */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Promo Code{" "}
                        <span className="text-gray-400 font-normal">
                          (leave blank for auto-apply by date)
                        </span>
                      </label>
                      <input
                        type="text"
                        value={couponDraft.code ?? ""}
                        onChange={(e) =>
                          setCouponDraft((d) => ({
                            ...d,
                            code: e.target.value || null,
                          }))
                        }
                        placeholder="e.g. FALL2026"
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    {/* Value + Type */}
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Discount Amount
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={couponDraft.value}
                          onChange={(e) =>
                            setCouponDraft((d) => ({
                              ...d,
                              value: parseFloat(e.target.value) || 0,
                            }))
                          }
                          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="w-32">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Type
                        </label>
                        <select
                          value={couponDraft.valueType}
                          onChange={(e) =>
                            setCouponDraft((d) => ({
                              ...d,
                              valueType: e.target.value as "flat" | "percent",
                            }))
                          }
                          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="flat">$ Off</option>
                          <option value="percent">% Off</option>
                        </select>
                      </div>
                    </div>

                    {/* Valid From / Until */}
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Valid From{" "}
                          <span className="text-gray-400 font-normal">
                            (optional)
                          </span>
                        </label>
                        <input
                          type="date"
                          value={couponDraft.validFrom?.slice(0, 10) ?? ""}
                          onChange={(e) =>
                            setCouponDraft((d) => ({
                              ...d,
                              validFrom: e.target.value
                                ? new Date(e.target.value).toISOString()
                                : null,
                            }))
                          }
                          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Expires{" "}
                          <span className="text-gray-400 font-normal">
                            (optional)
                          </span>
                        </label>
                        <input
                          type="date"
                          value={couponDraft.validUntil?.slice(0, 10) ?? ""}
                          onChange={(e) =>
                            setCouponDraft((d) => ({
                              ...d,
                              validUntil: e.target.value
                                ? new Date(e.target.value).toISOString()
                                : null,
                            }))
                          }
                          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    {/* Max Uses / Per Family */}
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Max Total Uses{" "}
                          <span className="text-gray-400 font-normal">
                            (optional)
                          </span>
                        </label>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={couponDraft.maxTotalUses ?? ""}
                          onChange={(e) =>
                            setCouponDraft((d) => ({
                              ...d,
                              maxTotalUses: e.target.value
                                ? parseInt(e.target.value, 10)
                                : null,
                            }))
                          }
                          placeholder="Unlimited"
                          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="w-36">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Max Per Family
                        </label>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={couponDraft.maxPerFamily}
                          onChange={(e) =>
                            setCouponDraft((d) => ({
                              ...d,
                              maxPerFamily: parseInt(e.target.value, 10) || 1,
                            }))
                          }
                          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    {/* Stackable toggle */}
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={couponDraft.stackable}
                        onChange={(e) =>
                          setCouponDraft((d) => ({
                            ...d,
                            stackable: e.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700">
                        Can stack with multi-class discounts
                      </span>
                    </label>

                    {/* Most expensive item only */}
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={couponDraft.appliesToMostExpensiveOnly ?? false}
                        onChange={(e) =>
                          setCouponDraft((d) => ({
                            ...d,
                            appliesToMostExpensiveOnly: e.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700">
                        Apply to most expensive eligible item only
                      </span>
                    </label>

                    {/* Eligible line item types */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-2">
                        Discount applies to
                      </label>
                      <div className="flex flex-wrap gap-4">
                        {(
                          [
                            ["tuition", "Tuition"],
                            ["registration_fee", "Registration Fee"],
                            ["recital_fee", "Recital Fee"],
                          ] as const
                        ).map(([type, label]) => {
                          const checked = (
                            couponDraft.eligibleLineItemTypes ?? []
                          ).includes(type);
                          return (
                            <label
                              key={type}
                              className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  setCouponDraft((d) => ({
                                    ...d,
                                    eligibleLineItemTypes: e.target.checked
                                      ? [
                                          ...(d.eligibleLineItemTypes ?? []),
                                          type,
                                        ]
                                      : (d.eligibleLineItemTypes ?? []).filter(
                                          (t) => t !== type,
                                        ),
                                  }))
                                }
                                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              {label}
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Session eligibility */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Applies To
                      </label>
                      <select
                        value={couponDraft.eligibleSessionsMode}
                        onChange={(e) =>
                          setCouponDraft((d) => ({
                            ...d,
                            eligibleSessionsMode: e.target.value as
                              | "all"
                              | "selected",
                            sessionIds:
                              e.target.value === "all" ? [] : d.sessionIds,
                          }))
                        }
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="all">All classes</option>
                        <option value="selected">Specific classes only</option>
                      </select>

                      {couponDraft.eligibleSessionsMode === "selected" &&
                        sessionOptions.length > 0 && (
                          <div className="mt-2 space-y-1 max-h-40 overflow-y-auto border border-gray-200 rounded-xl p-2">
                            {sessionOptions.map((s) => (
                              <label
                                key={s.id}
                                className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={(
                                    couponDraft.sessionIds ?? []
                                  ).includes(s.id)}
                                  onChange={(e) =>
                                    setCouponDraft((d) => ({
                                      ...d,
                                      sessionIds: e.target.checked
                                        ? [...(d.sessionIds ?? []), s.id]
                                        : (d.sessionIds ?? []).filter(
                                            (id) => id !== s.id,
                                          ),
                                    }))
                                  }
                                  className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                                />
                                {s.name}
                              </label>
                            ))}
                          </div>
                        )}
                    </div>

                    {/* Active toggle */}
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={couponDraft.isActive}
                        onChange={(e) =>
                          setCouponDraft((d) => ({
                            ...d,
                            isActive: e.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700">Active</span>
                    </label>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={() => setShowCouponForm(false)}
                      className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveCoupon}
                      disabled={couponSaving}
                      className="px-5 py-2 rounded-xl bg-indigo-600 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60 transition"
                    >
                      {couponSaving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Coupon list */}
            {coupons.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center">
                <p className="text-sm text-gray-500">No promo codes yet</p>
              </div>
            )}

            {coupons.map((coupon) => {
              const usageText =
                coupon.maxTotalUses !== null
                  ? `${coupon.usesCount} / ${coupon.maxTotalUses} uses`
                  : `${coupon.usesCount} uses`;

              const valueText =
                coupon.valueType === "flat"
                  ? `$${coupon.value.toFixed(2)} off`
                  : `${coupon.value}% off`;

              return (
                <div
                  key={coupon._clientKey}
                  className={`border rounded-xl bg-white ${
                    coupon.isActive
                      ? "border-gray-200"
                      : "border-gray-200 opacity-50"
                  } ${isLocked ? "opacity-60" : ""}`}
                >
                  <div className="flex items-start gap-3 p-4">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">
                          {coupon.name}
                        </span>
                        {coupon.code && (
                          <span className="text-xs font-mono bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                            {coupon.code}
                          </span>
                        )}
                        {!coupon.code && (
                          <span className="text-xs text-gray-400 italic">
                            auto-apply
                          </span>
                        )}
                        {!coupon.isActive && (
                          <span className="text-xs text-red-500">Inactive</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500">
                        <span>{valueText}</span>
                        <span>{usageText}</span>
                        {coupon.validUntil && (
                          <span>
                            Expires{" "}
                            {new Date(coupon.validUntil).toLocaleDateString()}
                          </span>
                        )}
                        {coupon.stackable && (
                          <span className="text-green-600">Stackable</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {coupon.id && (
                        <button
                          onClick={() => toggleHistory(coupon.id!)}
                          className="text-xs font-medium text-gray-400 hover:text-gray-600 transition px-2 py-1 rounded-lg hover:bg-gray-50"
                        >
                          {expandedHistoryId === coupon.id
                            ? "Hide history"
                            : "History"}
                        </button>
                      )}
                      {!isLocked && (
                        <>
                          <button
                            onClick={() => openEditCoupon(coupon)}
                            className="text-xs font-medium text-gray-400 hover:text-indigo-600 transition px-2 py-1 rounded-lg hover:bg-indigo-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteCoupon(coupon)}
                            className="text-xs font-medium text-gray-400 hover:text-red-600 transition px-2 py-1 rounded-lg hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Redemption history panel */}
                  {expandedHistoryId === coupon.id && coupon.id && (
                    <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                      {historyCache[coupon.id]?.loading && (
                        <p className="text-xs text-gray-400">Loading…</p>
                      )}
                      {!historyCache[coupon.id]?.loading &&
                        (historyCache[coupon.id]?.records.length ?? 0) === 0 && (
                          <p className="text-xs text-gray-400">No redemptions yet.</p>
                        )}
                      {(historyCache[coupon.id]?.records ?? []).map((r) => (
                        <div
                          key={r.id}
                          className="flex justify-between items-center text-xs text-gray-600 py-1 border-b border-gray-50 last:border-0"
                        >
                          <span>{r.familyName ?? r.familyId}</span>
                          <span className="text-gray-400">
                            {new Date(r.redeemedAt).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <button
            onClick={onBack}
            className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            Back
          </button>
          <button
            onClick={handleSubmit}
            className="px-6 py-2.5 rounded-xl bg-indigo-600 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
