"use client";

import CreateDiscountForm from "@/app/components/semester-flow/CreateDiscountForm";
import EditDiscountForm from "@/app/components/semester-flow/EditDiscountForm";
import { deleteDiscount } from "@/app/admin/semesters/new/discounts/DeleteDiscount";
import { getDiscounts } from "@/queries/admin";
import {
  AppliedSemesterDiscount,
  DiscountsStepProps,
  HydratedDiscount,
} from "@/types";

import { useEffect, useState } from "react";

export default function DiscountsStep({
  state,
  dispatch,
  onNext,
  onBack,
  isLocked = false,
}: DiscountsStepProps) {
  const [allDiscounts, setAllDiscounts] = useState<HydratedDiscount[]>([]);
  const [applications, setApplications] = useState<AppliedSemesterDiscount[]>(
    state.discounts?.appliedDiscounts ?? [],
  );
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<HydratedDiscount | null>(null);

  /* ------------------------------------------------------------------------ */
  /* Data loading                                                             */
  /* ------------------------------------------------------------------------ */

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

  function isSelected(discountId: string) {
    return applications.some((a) => a.discountId === discountId);
  }

  /* ------------------------------------------------------------------------ */
  /* Handlers                                                                 */
  /* ------------------------------------------------------------------------ */

  function toggleSelection(discountId: string) {
    setApplications((prev) =>
      prev.some((a) => a.discountId === discountId)
        ? prev.filter((a) => a.discountId !== discountId)
        : [
            ...prev,
            {
              discountId,
              scope: "all_sessions", // default; refined later
            },
          ],
    );
  }

  function handleSubmit() {
    dispatch({
      type: "SET_DISCOUNTS",
      payload: {
        appliedDiscounts: applications,
      },
    });

    onNext();
  }

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-8">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Discounts
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Select discounts that will be available for this semester.
          </p>
        </div>

        {isLocked && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            This semester has active registrations. Discounts are locked.
          </div>
        )}

        {/* Create Discount Link */}
        {!isLocked && (
          <div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-700 transition"
            >
              + Create New Discount
            </button>
          </div>
        )}

        {showCreateModal && (
          <div className="fixed inset-0 bg-blur  bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-lg p-8 max-w-2xl w-full mx-4">
              <CreateDiscountForm
                sessions={(state.sessions?.classes ?? []).flatMap((cls) =>
                  (cls.schedules ?? []).map((cs) => ({
                    id: cs.id ?? "",
                    name: `${cls.name} — ${cs.daysOfWeek.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(", ")}`,
                  })),
                )}
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
            sessions={(state.sessions?.classes ?? []).flatMap((cls) =>
              (cls.schedules ?? []).map((cs) => ({
                id: cs.id ?? "",
                name: `${cls.name} — ${cs.daysOfWeek.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(", ")}`,
              })),
            )}
            onSaved={async () => {
              await refreshDiscounts();
              setEditingDiscount(null);
            }}
            onCancel={() => setEditingDiscount(null)}
          />
        )}

        {/* Discount List */}
        <div className="space-y-4">
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
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setEditingDiscount(discount)}
                      className="text-xs font-medium text-gray-400 hover:text-indigo-600 transition px-2 py-1 rounded-lg hover:bg-indigo-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Delete "${discount.name}"? This cannot be undone.`)) return;
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
