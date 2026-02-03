"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function DiscountsStep({ state, dispatch, onNext, onBack }) {
  const [discounts, setDiscounts] = useState([]);
  const [selected, setSelected] = useState<string[]>(
    state.discounts?.semesterDiscountIds ?? [],
  );

  useEffect(() => {
    // TODO: fetch from discounts table
    setDiscounts([
      { id: "d1", name: "Sibling Discount" },
      { id: "d2", name: "Early Bird" },
    ]);
  }, []);

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
