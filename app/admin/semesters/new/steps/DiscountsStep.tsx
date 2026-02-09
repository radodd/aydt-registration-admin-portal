"use client";

import { getDiscounts } from "@/queries/admin";
import { DiscountCategory, SemesterDiscount } from "@/types";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function DiscountsStep({ state, dispatch, onNext, onBack }) {
  const [discounts, setDiscounts] = useState([]);
  const [selected, setSelected] = useState<string[]>(
    state.discounts?.semesterDiscountIds ?? [],
  );
  const [availableDiscounts, setAvailableDiscounts] = useState<
    DiscountCategory[]
  >([]);
  const [appliedDiscounts, setAppliedDiscounts] = useState<SemesterDiscount[]>(
    state.discounts?.semesterDiscounts ?? [],
  );

  function applyDiscount(discount: SemesterDiscount) {
    if (appliedDiscounts.some((d) => d.discountId === discount.id)) return;

    setAppliedDiscounts((prev) => [
      ...prev,
      {
        discountId: discount.id,
        name: discount.name,
        category: discount.category,
        eligibleSessionsMode: discount.eligibleSessionsMode,
        eligibleSessionIds: discount.eligibleSessionIds,
        rules: discount.rules,
        enabled: true,
      },
    ]);
  }

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    );
  }

  function submit() {
    dispatch({
      type: "SET_DISCOUNTS",
      payload: {
        semesterDiscountIds: selected,
        sessionDiscounts: {},
      },
    });
    onNext();
  }

  useEffect(() => {
    let active = true;

    async function load() {
      const data = await getDiscounts();
      if (active) {
        setDiscounts(data);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div>
      <h2>Discounts</h2>

      <Link className="text-slate-700" href="/admin/semesters/new/discounts">
        Create New Discount
      </Link>

      {discounts.map((d) => (
        <label key={d.id}>
          <input
            type="checkbox"
            checked={selected.includes(d.id)}
            onChange={() => toggle(d.id)}
          />
          {d.name}
        </label>
      ))}

      <div>
        <button onClick={onBack}>Back</button>
        <button onClick={submit}>Next</button>
      </div>
    </div>
  );
}
