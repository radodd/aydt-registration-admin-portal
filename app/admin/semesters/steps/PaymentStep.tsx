"use client";

import {
  DraftFeeConfig,
  DraftTuitionRateBand,
  PaymentFormState,
  PaymentStepProps,
} from "@/types";
import { useState } from "react";

/* -------------------------------------------------------------------------- */
/* Sub-step types                                                              */
/* -------------------------------------------------------------------------- */

type SubStep = "plans" | "tuition" | "fees";

const SUB_STEPS: { key: SubStep; label: string }[] = [
  { key: "plans", label: "1. Payment Plans" },
  { key: "tuition", label: "2. Tuition Rates" },
  { key: "fees", label: "3. Fee Config" },
];

const DIVISIONS = [
  { value: "early_childhood", label: "Early Childhood" },
  { value: "junior", label: "Junior" },
  { value: "senior", label: "Senior" },
  { value: "competition", label: "Competition" },
] as const;

const DEFAULT_FEE_CONFIG: DraftFeeConfig = {
  registration_fee_per_child: 40,
  family_discount_amount: 50,
  auto_pay_admin_fee_monthly: 5,
  auto_pay_installment_count: 5,
};

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export default function PaymentStep({
  state,
  dispatch,
  onNext,
  onBack,
  isLocked = false,
}: PaymentStepProps) {
  const [activeSubStep, setActiveSubStep] = useState<SubStep>("plans");

  /* ---- Payment plan state ---- */
  const [form, setForm] = useState<PaymentFormState>({
    type: state.paymentPlan?.type ?? "pay_in_full",
    dueDate: state.paymentPlan?.dueDate ?? "",
    installmentCount: state.paymentPlan?.installmentCount?.toString() ?? "",
  });

  /* ---- Tuition rate bands state ---- */
  const [bands, setBands] = useState<DraftTuitionRateBand[]>(
    state.tuitionRateBands ?? [],
  );
  const [newBand, setNewBand] = useState<
    Omit<DraftTuitionRateBand, "_clientKey" | "id">
  >({
    division: "junior",
    weekly_class_count: 1,
    base_tuition: 0,
    recital_fee_included: 0,
    notes: "",
  });

  /* ---- Fee config state ---- */
  const [feeConfig, setFeeConfig] = useState<DraftFeeConfig>(
    state.feeConfig ?? DEFAULT_FEE_CONFIG,
  );

  /* ------------------------------------------------------------------------ */
  /* Handlers — plans                                                          */
  /* ------------------------------------------------------------------------ */

  function updateField<K extends keyof PaymentFormState>(
    key: K,
    value: PaymentFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /* ------------------------------------------------------------------------ */
  /* Handlers — tuition rate bands                                             */
  /* ------------------------------------------------------------------------ */

  function addBand() {
    if (newBand.base_tuition <= 0) {
      alert("Base tuition must be greater than zero");
      return;
    }
    if (newBand.recital_fee_included > newBand.base_tuition) {
      alert("Recital fee cannot exceed base tuition");
      return;
    }
    const duplicate = bands.some(
      (b) =>
        b.division === newBand.division &&
        b.weekly_class_count === newBand.weekly_class_count,
    );
    if (duplicate) {
      alert(
        `A rate band for ${newBand.division} / ${newBand.weekly_class_count} class(es)/week already exists.`,
      );
      return;
    }
    setBands((prev) => [
      ...prev,
      { ...newBand, _clientKey: crypto.randomUUID() },
    ]);
    setNewBand((prev) => ({
      ...prev,
      weekly_class_count: prev.weekly_class_count + 1,
      base_tuition: 0,
      recital_fee_included: 0,
      notes: "",
    }));
  }

  function removeBand(clientKey: string) {
    setBands((prev) => prev.filter((b) => b._clientKey !== clientKey));
  }

  function updateBand(
    clientKey: string,
    field: keyof Omit<DraftTuitionRateBand, "_clientKey" | "id">,
    value: string | number,
  ) {
    setBands((prev) =>
      prev.map((b) =>
        b._clientKey === clientKey ? { ...b, [field]: value } : b,
      ),
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Handlers — fee config                                                     */
  /* ------------------------------------------------------------------------ */

  function updateFeeConfig<K extends keyof DraftFeeConfig>(
    key: K,
    value: DraftFeeConfig[K],
  ) {
    setFeeConfig((prev) => ({ ...prev, [key]: value }));
  }

  /* ------------------------------------------------------------------------ */
  /* Submit                                                                    */
  /* ------------------------------------------------------------------------ */

  function isPlansValid(): boolean {
    if (!form.dueDate) {
      alert("Payment due date required");
      return false;
    }
    return true;
  }

  function handleSubmit() {
    if (!isPlansValid()) {
      setActiveSubStep("plans");
      return;
    }

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

    dispatch({ type: "SET_TUITION_RATE_BANDS", payload: bands });
    dispatch({ type: "SET_FEE_CONFIG", payload: feeConfig });

    onNext();
  }

  /* ------------------------------------------------------------------------ */
  /* Render                                                                    */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Payment & Pricing
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Configure payment plans, tuition rates, and fee constants for this
            semester.
          </p>
        </div>

        {isLocked && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            This semester has active registrations. Payment settings are locked.
          </div>
        )}

        {/* Sub-step Tabs */}
        <div className="border-b border-gray-200">
          <div className="flex gap-1 overflow-x-auto">
            {SUB_STEPS.map((s) => (
              <button
                key={s.key}
                onClick={() => setActiveSubStep(s.key)}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                  activeSubStep === s.key
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Tab: Payment Plans                                                  */}
        {/* ------------------------------------------------------------------ */}
        {activeSubStep === "plans" && (
          <fieldset disabled={isLocked} className="space-y-6">
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-700">
                Payment type
              </label>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    {
                      value: "pay_in_full",
                      label: "Pay in Full",
                      desc: "Full payment due on one date",
                    },
                    {
                      value: "deposit_flat",
                      label: "Flat Deposit",
                      desc: "Fixed deposit, balance due later",
                    },
                    {
                      value: "deposit_percent",
                      label: "Percent Deposit",
                      desc: "% of total due upfront",
                    },
                    {
                      value: "installments",
                      label: "Installments",
                      desc: "Split into multiple payments",
                    },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={isLocked}
                    onClick={() => updateField("type", option.value)}
                    className={`text-left border rounded-xl px-4 py-3 transition focus:outline-none disabled:opacity-50 ${
                      form.type === option.value
                        ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                  >
                    <p
                      className={`text-sm font-medium ${form.type === option.value ? "text-indigo-700" : "text-gray-900"}`}
                    >
                      {option.label}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{option.desc}</p>
                  </button>
                ))}
              </div>
            </div>

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
          </fieldset>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Tab: Tuition Rates                                                  */}
        {/* ------------------------------------------------------------------ */}
        {activeSubStep === "tuition" && (
          <div className="space-y-6">
            <p className="text-sm text-gray-500">
              Enter the tuition chart for this semester. Each row maps a dancer
              division and weekly class count to a tuition amount. Volume
              discounts must already be baked into these numbers — do{" "}
              <strong>not</strong> apply them separately.
            </p>

            {/* Existing bands */}
            {bands.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
                  <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-3 text-left">Division</th>
                      <th className="px-4 py-3 text-left">Classes/Week</th>
                      <th className="px-4 py-3 text-left">Base Tuition</th>
                      <th className="px-4 py-3 text-left">Recital Fee</th>
                      <th className="px-4 py-3 text-left">Notes</th>
                      {!isLocked && (
                        <th className="px-4 py-3 text-left"></th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {bands.map((band) => (
                      <tr key={band._clientKey}>
                        <td className="px-4 py-3">
                          {isLocked ? (
                            <span className="capitalize">
                              {band.division.replace("_", " ")}
                            </span>
                          ) : (
                            <select
                              value={band.division}
                              onChange={(e) =>
                                updateBand(
                                  band._clientKey,
                                  "division",
                                  e.target.value,
                                )
                              }
                              className="rounded-lg border border-gray-300 px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            >
                              {DIVISIONS.map((d) => (
                                <option key={d.value} value={d.value}>
                                  {d.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isLocked ? (
                            band.weekly_class_count
                          ) : (
                            <input
                              type="number"
                              min={1}
                              value={band.weekly_class_count}
                              onChange={(e) =>
                                updateBand(
                                  band._clientKey,
                                  "weekly_class_count",
                                  Number(e.target.value),
                                )
                              }
                              className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isLocked ? (
                            `$${band.base_tuition.toFixed(2)}`
                          ) : (
                            <div className="relative">
                              <span className="absolute left-2 top-1.5 text-gray-400 text-sm">
                                $
                              </span>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={band.base_tuition}
                                onChange={(e) =>
                                  updateBand(
                                    band._clientKey,
                                    "base_tuition",
                                    Number(e.target.value),
                                  )
                                }
                                className="w-28 pl-5 rounded-lg border border-gray-300 px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isLocked ? (
                            `$${band.recital_fee_included.toFixed(2)}`
                          ) : (
                            <div className="relative">
                              <span className="absolute left-2 top-1.5 text-gray-400 text-sm">
                                $
                              </span>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={band.recital_fee_included}
                                onChange={(e) =>
                                  updateBand(
                                    band._clientKey,
                                    "recital_fee_included",
                                    Number(e.target.value),
                                  )
                                }
                                className="w-28 pl-5 rounded-lg border border-gray-300 px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isLocked ? (
                            band.notes ?? "—"
                          ) : (
                            <input
                              type="text"
                              placeholder="Optional"
                              value={band.notes ?? ""}
                              onChange={(e) =>
                                updateBand(
                                  band._clientKey,
                                  "notes",
                                  e.target.value,
                                )
                              }
                              className="w-36 rounded-lg border border-gray-300 px-2 py-1 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          )}
                        </td>
                        {!isLocked && (
                          <td className="px-4 py-3">
                            <button
                              onClick={() => removeBand(band._clientKey)}
                              className="text-xs text-red-600 hover:text-red-700"
                            >
                              Remove
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center">
                <p className="text-sm text-gray-500">
                  No rate bands configured yet. Add rows below.
                </p>
              </div>
            )}

            {/* Add new band row */}
            {!isLocked && (
              <div className="rounded-xl border border-gray-200 p-4 space-y-4">
                <h4 className="text-sm font-medium text-gray-700">
                  Add Rate Band
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">Division</label>
                    <select
                      value={newBand.division}
                      onChange={(e) =>
                        setNewBand((prev) => ({
                          ...prev,
                          division: e.target
                            .value as DraftTuitionRateBand["division"],
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {DIVISIONS.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">
                      Classes/Week
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={newBand.weekly_class_count}
                      onChange={(e) =>
                        setNewBand((prev) => ({
                          ...prev,
                          weekly_class_count: Number(e.target.value),
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">
                      Base Tuition ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="0.00"
                      value={newBand.base_tuition || ""}
                      onChange={(e) =>
                        setNewBand((prev) => ({
                          ...prev,
                          base_tuition: Number(e.target.value),
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">
                      Recital Fee ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="0.00"
                      value={newBand.recital_fee_included || ""}
                      onChange={(e) =>
                        setNewBand((prev) => ({
                          ...prev,
                          recital_fee_included: Number(e.target.value),
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">
                    Notes (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. includes costume deposit"
                    value={newBand.notes ?? ""}
                    onChange={(e) =>
                      setNewBand((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <button
                  onClick={addBand}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 transition"
                >
                  + Add Row
                </button>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Tab: Fee Config                                                      */}
        {/* ------------------------------------------------------------------ */}
        {activeSubStep === "fees" && (
          <fieldset disabled={isLocked} className="space-y-6">
            <p className="text-sm text-gray-500">
              These fee constants apply to all registrations in this semester.
              Changes here affect pricing calculations for all families.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Registration fee per child
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                    $
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={feeConfig.registration_fee_per_child}
                    onChange={(e) =>
                      updateFeeConfig(
                        "registration_fee_per_child",
                        Number(e.target.value),
                      )
                    }
                    disabled={isLocked}
                    className="w-full pl-7 rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                  />
                </div>
                <p className="text-xs text-gray-400">
                  One-time fee per dancer per semester (default $40).
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Family discount (once per family)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                    $
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={feeConfig.family_discount_amount}
                    onChange={(e) =>
                      updateFeeConfig(
                        "family_discount_amount",
                        Number(e.target.value),
                      )
                    }
                    disabled={isLocked}
                    className="w-full pl-7 rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                  />
                </div>
                <p className="text-xs text-gray-400">
                  Flat discount applied once per family per semester (default
                  $50).
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Auto-pay admin fee (per month)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                    $
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={feeConfig.auto_pay_admin_fee_monthly}
                    onChange={(e) =>
                      updateFeeConfig(
                        "auto_pay_admin_fee_monthly",
                        Number(e.target.value),
                      )
                    }
                    disabled={isLocked}
                    className="w-full pl-7 rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                  />
                </div>
                <p className="text-xs text-gray-400">
                  Added per installment for auto-pay plans (default $5/month).
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Auto-pay installment count
                </label>
                <input
                  type="number"
                  min={1}
                  value={feeConfig.auto_pay_installment_count}
                  onChange={(e) =>
                    updateFeeConfig(
                      "auto_pay_installment_count",
                      Number(e.target.value),
                    )
                  }
                  disabled={isLocked}
                  className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                />
                <p className="text-xs text-gray-400">
                  Number of monthly payments for auto-pay plan (default 5).
                </p>
              </div>
            </div>
          </fieldset>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-4 border-t border-gray-100">
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
