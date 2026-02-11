"use client";

import { getDiscounts } from "@/queries/admin";
import {
  DiscountApplication,
  DiscountsStepProps,
  SemesterDiscount,
} from "@/types";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function DiscountsStep({
  state,
  dispatch,
  onNext,
  onBack,
}: DiscountsStepProps) {
  const [discounts, setDiscounts] = useState<SemesterDiscount[] | null>([]);
  const [applications, setApplications] = useState<DiscountApplication[]>(
    state.discounts?.appliedDiscounts ?? [],
  );

  /* ------------------------------------------------------------------------ */
  /* Data loading                                                             */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    let active = true;

    async function loadDiscounts() {
      const data = await getDiscounts();
      if (active) {
        setDiscounts(data);
      }
    }

    loadDiscounts();

    return () => {
      active = false;
    };
  }, []);

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

        {/* Create Discount Link */}
        <div>
          <Link
            href="/admin/semesters/new/discounts"
            className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-700 transition"
          >
            + Create New Discount
          </Link>
        </div>

        {/* Discount List */}
        <div className="space-y-4">
          {discounts?.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center">
              <p className="text-sm text-gray-500">No discounts available</p>
            </div>
          )}

          {discounts?.map((discount) => (
            <div
              key={discount.id}
              className="flex items-start gap-3 border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition"
            >
              <input
                id={`discount-${discount.id}`}
                type="checkbox"
                checked={isSelected(discount.id)}
                onChange={() => {
                  toggleSelection(discount.id);

                  console.table(
                    discounts?.map((d) => ({
                      discountId: d.id,
                      name: d.name,
                    })),
                  );

                  console.log(
                    "Toggled discount",
                    discount.id,
                    "Selected:",
                    !isSelected(discount.id),
                  );
                }}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />

              <label
                htmlFor={`discount-${discount.id}`}
                className="text-sm font-medium text-gray-800 cursor-pointer"
              >
                {discount.name}
              </label>
            </div>
          ))}
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
