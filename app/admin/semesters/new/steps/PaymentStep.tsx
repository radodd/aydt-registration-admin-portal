"use client";

import { PaymentFormState, PaymentStepProps } from "@/types";
import { useState } from "react";

export default function PaymentStep({
  state,
  dispatch,
  onNext,
  onBack,
}: PaymentStepProps) {
  const [form, setForm] = useState<PaymentFormState>({
    type: state.paymentPlan?.type ?? "pay_in_full",
    dueDate: state.paymentPlan?.dueDate ?? "",
    installmentCount: state.paymentPlan?.installmentCount?.toString() ?? "",
  });

  /* ------------------------------------------------------------------------ */
  /* Helpers                                                                  */
  /* ------------------------------------------------------------------------ */

  function updateField<K extends keyof PaymentFormState>(
    key: K,
    value: PaymentFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function isValid(): boolean {
    if (!form.dueDate) {
      alert("Payment due date required");
      return false;
    }
    if (
      form.type === "installments" &&
      (!form.installmentCount || Number(form.installmentCount) <= 0)
    ) {
      alert("Installment count must be greater than zero");
      return false;
    }
    return true;
  }

  /* ------------------------------------------------------------------------ */
  /* Handlers                                                                 */
  /* ------------------------------------------------------------------------ */

  function handleSubmit() {
    if (!isValid()) return;

    dispatch({
      type: "SET_PAYMENT",
      payload: {
        type: form.type,
        dueDate: form.dueDate,
        installmentCount:
          form.type === "installments" ? Number(form.installmentCount) : undefined,
      },
    });
    onNext();
  }

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <div>
      <h2>Payment Plan</h2>

      <select
        value={form.type}
        onChange={(e) =>
          updateField("type", e.target.value as PaymentFormState["type"])
        }
      >
        <option value="pay_in_full">Pay in Full</option>
        <option value="deposit_flat">Flat Deposit</option>
        <option value="deposit_percent">Percent Deposit</option>
        <option value="installments">Installments</option>
      </select>

      {form.type === "installments" && (
        <input
          type="number"
          min={1}
          placeholder="Number of installments"
          value={form.installmentCount}
          onChange={(e) =>
            updateField(
              "installmentCount",
              e.target.value as PaymentFormState["installmentCount"],
            )
          }
        />
      )}

      <input
        type="date"
        value={form.dueDate}
        onChange={(e) =>
          updateField("dueDate", e.target.value as PaymentFormState["dueDate"])
        }
      />

      <div>
        <button onClick={onBack}>Back</button>
        <button onClick={handleSubmit}>Next</button>
      </div>
    </div>
  );
}
