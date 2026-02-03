"use client";

import { useState } from "react";

export default function PaymentStep({ state, dispatch, onNext, onBack }) {
  const [form, setForm] = useState(
    state.paymentPlan ?? {
      type: "pay_in_full",
      dueDate: "",
      installmentCount: "",
    },
  );

  function submit() {
    if (!form.dueDate) {
      alert("Payment due date required");
      return;
    }

    dispatch({
      type: "SET_PAYMENT",
      payload: {
        ...form,
        installmentCount:
          form.type === "installments" ? Number(form.installmentCount) : null,
      },
    });

    onNext();
  }

  return (
    <div>
      <h2>Payment Plan</h2>

      <select
        value={form.type}
        onChange={(e) => setForm({ ...form, type: e.target.value })}
      >
        <option value="pay_in_full">Pay in Full</option>
        <option value="deposit_flat">Flat Deposit</option>
        <option value="deposit_percent">Percent Deposit</option>
        <option value="installments">Installments</option>
      </select>

      {form.type === "installments" && (
        <input
          type="number"
          placeholder="Number of installments"
          value={form.installmentCount}
          onChange={(e) =>
            setForm({ ...form, installmentCount: e.target.value })
          }
        />
      )}

      <input
        type="date"
        value={form.dueDate}
        onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
      />

      <div>
        <button onClick={onBack}>Back</button>
        <button onClick={submit}>Next</button>
      </div>
    </div>
  );
}
