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
          form.type === "installments"
            ? Number(form.installmentCount)
            : undefined,
      },
    });

    console.groupEnd();
    onNext();
  }

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-8">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Payment Plan
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Configure how tuition payments will be structured.
          </p>
        </div>

        <div className="space-y-6">
          {/* Plan Type */}
          <div className="space-y-2">
            <label
              htmlFor="payment-type"
              className="text-sm font-medium text-gray-700"
            >
              Payment type
            </label>
            <select
              id="payment-type"
              value={form.type}
              onChange={(e) =>
                updateField("type", e.target.value as PaymentFormState["type"])
              }
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition bg-white"
            >
              <option value="pay_in_full">Pay in Full</option>
              <option value="deposit_flat">Flat Deposit</option>
              <option value="deposit_percent">Percent Deposit</option>
              <option value="installments">Installments</option>
            </select>
          </div>

          {/* Installment Count (Conditional) */}
          {form.type === "installments" && (
            <div className="space-y-2">
              <label
                htmlFor="installment-count"
                className="text-sm font-medium text-gray-700"
              >
                Number of installments
              </label>
              <input
                id="installment-count"
                type="number"
                min={1}
                placeholder="3"
                value={form.installmentCount}
                onChange={(e) =>
                  updateField(
                    "installmentCount",
                    e.target.value as PaymentFormState["installmentCount"],
                  )
                }
                className="w-40 rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
              />
            </div>
          )}

          {/* Due Date */}
          <div className="space-y-2">
            <label
              htmlFor="due-date"
              className="text-sm font-medium text-gray-700"
            >
              First payment due date
            </label>
            <input
              id="due-date"
              type="date"
              value={form.dueDate}
              onChange={(e) =>
                updateField(
                  "dueDate",
                  e.target.value as PaymentFormState["dueDate"],
                )
              }
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
            />
          </div>
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
