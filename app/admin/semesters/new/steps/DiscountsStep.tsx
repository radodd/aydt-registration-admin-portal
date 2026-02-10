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
    <div>
      <h2>Discounts</h2>

      <Link className="text-slate-700" href="/admin/semesters/new/discounts">
        Create New Discount
      </Link>

      {discounts?.map((discount) => (
        <label key={discount.id}>
          <input
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
                !isSelected(discount.discountId),
              );
            }}
          />
          {discount.name}
        </label>
      ))}

      <div>
        <button onClick={onBack}>Back</button>
        <button onClick={handleSubmit}>Next</button>
      </div>
    </div>
  );
}
