"use client";

import {
  DraftFeeConfig,
  DraftSpecialProgramTuition,
  DraftTuitionRateBand,
  PaymentFormState,
  PaymentStepProps,
} from "@/types";
import { useState } from "react";

/* -------------------------------------------------------------------------- */
/* Sub-step types                                                              */
/* -------------------------------------------------------------------------- */

type SubStep = "plans" | "tuition" | "programs" | "fees";

const SUB_STEPS: { key: SubStep; label: string }[] = [
  { key: "plans", label: "1. Payment Plans" },
  { key: "tuition", label: "2. Tuition Rates" },
  { key: "programs", label: "3. Special Programs" },
  { key: "fees", label: "4. Fee Config" },
];

const DIVISIONS = [
  { value: "early_childhood", label: "Early Childhood" },
  { value: "junior", label: "Junior" },
  { value: "senior", label: "Senior" },
  { value: "competition", label: "Competition" },
] as const;

const SPECIAL_PROGRAM_KEYS: { value: string; label: string }[] = [
  { value: "early_childhood", label: "Early Childhood (9-class session)" },
  { value: "technique", label: "Technique 1 / 2 / 3" },
  { value: "pre_pointe", label: "Pre-Pointe (2×/week)" },
  { value: "pointe", label: "Pointe (2×/week)" },
  { value: "competition_junior", label: "Competition Team — Junior" },
  { value: "competition_senior", label: "Competition Team — Senior" },
];

const DEFAULT_FEE_CONFIG: DraftFeeConfig = {
  registration_fee_per_child: 40,
  family_discount_amount: 50,
  auto_pay_admin_fee_monthly: 5,
  auto_pay_installment_count: 5,
  senior_video_fee_per_registrant: 15,
  senior_costume_fee_per_class: 65,
  junior_costume_fee_per_class: 55,
};

const EMPTY_PROGRAM: Omit<DraftSpecialProgramTuition, "_clientKey" | "id"> = {
  programKey: "technique",
  programLabel: "Technique 1 / 2 / 3",
  semesterTotal: 0,
  autoPayInstallmentAmount: null,
  autoPayInstallmentCount: 5,
  notes: "",
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
    progressive_discount_percent: 0,
    semester_total: undefined,
    autopay_installment_amount: undefined,
    notes: "",
  });

  /* ---- Special program tuition state ---- */
  const [programs, setPrograms] = useState<DraftSpecialProgramTuition[]>(
    state.specialProgramTuition ?? [],
  );
  const [newProgram, setNewProgram] = useState<
    Omit<DraftSpecialProgramTuition, "_clientKey" | "id">
  >({ ...EMPTY_PROGRAM });

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
      alert("Base tuition must be greater than zero.");
      return;
    }
    if (
      newBand.progressive_discount_percent < 0 ||
      newBand.progressive_discount_percent > 100
    ) {
      alert("Discount percent must be between 0 and 100.");
      return;
    }
    if (
      newBand.semester_total !== undefined &&
      newBand.semester_total < 0
    ) {
      alert("Semester total cannot be negative.");
      return;
    }
    if (
      newBand.autopay_installment_amount !== undefined &&
      newBand.semester_total !== undefined &&
      newBand.autopay_installment_amount > newBand.semester_total
    ) {
      alert("Auto-pay installment amount cannot exceed semester total.");
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
      progressive_discount_percent: 0,
      semester_total: undefined,
      autopay_installment_amount: undefined,
      notes: "",
    }));
  }

  function removeBand(clientKey: string) {
    setBands((prev) => prev.filter((b) => b._clientKey !== clientKey));
  }

  function updateBand(
    clientKey: string,
    field: keyof Omit<DraftTuitionRateBand, "_clientKey" | "id">,
    value: string | number | undefined,
  ) {
    setBands((prev) =>
      prev.map((b) =>
        b._clientKey === clientKey ? { ...b, [field]: value } : b,
      ),
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Handlers — special programs                                               */
  /* ------------------------------------------------------------------------ */

  function addProgram() {
    if (newProgram.semesterTotal <= 0) {
      alert("Semester total must be greater than zero.");
      return;
    }
    if (
      newProgram.autoPayInstallmentAmount !== null &&
      newProgram.autoPayInstallmentAmount > newProgram.semesterTotal
    ) {
      alert("Auto-pay installment amount cannot exceed semester total.");
      return;
    }
    const duplicate = programs.some((p) => p.programKey === newProgram.programKey);
    if (duplicate) {
      alert(`A special program entry for "${newProgram.programLabel}" already exists.`);
      return;
    }
    setPrograms((prev) => [
      ...prev,
      { ...newProgram, _clientKey: crypto.randomUUID() },
    ]);
    setNewProgram({ ...EMPTY_PROGRAM });
  }

  function removeProgram(clientKey: string) {
    setPrograms((prev) => prev.filter((p) => p._clientKey !== clientKey));
  }

  function updateProgram(
    clientKey: string,
    patch: Partial<Omit<DraftSpecialProgramTuition, "_clientKey" | "id">>,
  ) {
    setPrograms((prev) =>
      prev.map((p) => (p._clientKey === clientKey ? { ...p, ...patch } : p)),
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
    if (form.type !== "pay_in_full" && !form.dueDate) {
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

    // Warn if any band's semester_total changed by more than 10% vs what was
    // loaded from state (guards against accidental large changes).
    const origBands = state.tuitionRateBands ?? [];
    const hasBigChange = bands.some((b) => {
      if (!b.semester_total) return false;
      const orig = origBands.find(
        (ob) =>
          ob.division === b.division &&
          ob.weekly_class_count === b.weekly_class_count,
      );
      if (!orig?.semester_total) return false;
      const pctChange =
        Math.abs(b.semester_total - orig.semester_total) / orig.semester_total;
      return pctChange > 0.1;
    });
    if (hasBigChange) {
      const ok = window.confirm(
        "One or more tuition totals have changed by more than 10%. This will affect all future registrations for this semester. Continue?",
      );
      if (!ok) return;
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
    dispatch({ type: "SET_SPECIAL_PROGRAM_TUITION", payload: programs });

    onNext();
  }

  /* ------------------------------------------------------------------------ */
  /* Render                                                                    */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Payment & Pricing
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Configure payment plans, tuition rates, special programs, and fee
            constants for this semester.
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
                      desc: "Full payment at time of checkout",
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
                    <p className="text-xs text-gray-500 mt-0.5">
                      {option.desc}
                    </p>
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
            {form.type !== "pay_in_full" && (
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
            )}
          </fieldset>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Tab: Tuition Rates                                                  */}
        {/* ------------------------------------------------------------------ */}
        {activeSubStep === "tuition" && (
          <div className="space-y-6">
            <p className="text-sm text-gray-500">
              Division-based tuition using a progressive discount model. The
              base tuition applies to the first class; each additional class
              receives a progressively larger discount. Set the pre-calculated{" "}
              <strong>Semester Total</strong> and <strong>Auto-Pay</strong> for
              admin reference and auto-fill in class setup.
            </p>

            {/* Existing bands */}
            {bands.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
                  <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-3 py-3 text-left whitespace-nowrap">Division</th>
                      <th className="px-3 py-3 text-left whitespace-nowrap">Classes/Wk</th>
                      <th className="px-3 py-3 text-left whitespace-nowrap">Base Tuition</th>
                      <th className="px-3 py-3 text-left whitespace-nowrap">Discount %</th>
                      <th className="px-3 py-3 text-left whitespace-nowrap">Semester Total</th>
                      <th className="px-3 py-3 text-left whitespace-nowrap">Auto-Pay /mo</th>
                      <th className="px-3 py-3 text-left whitespace-nowrap">Notes</th>
                      {!isLocked && <th className="px-3 py-3" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {bands.map((band) => (
                      <tr key={band._clientKey}>
                        <td className="px-3 py-2">
                          {isLocked ? (
                            <span className="capitalize">
                              {band.division.replace("_", " ")}
                            </span>
                          ) : (
                            <select
                              value={band.division}
                              onChange={(e) =>
                                updateBand(band._clientKey, "division", e.target.value)
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
                        <td className="px-3 py-2">
                          {isLocked ? (
                            band.weekly_class_count
                          ) : (
                            <input
                              type="number"
                              min={1}
                              value={band.weekly_class_count}
                              onChange={(e) =>
                                updateBand(band._clientKey, "weekly_class_count", Number(e.target.value))
                              }
                              className="w-14 rounded-lg border border-gray-300 px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isLocked ? (
                            `$${band.base_tuition.toFixed(2)}`
                          ) : (
                            <div className="relative">
                              <span className="absolute left-2 top-1.5 text-gray-400 text-xs">$</span>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={band.base_tuition}
                                onChange={(e) =>
                                  updateBand(band._clientKey, "base_tuition", Number(e.target.value))
                                }
                                className="w-24 pl-4 rounded-lg border border-gray-300 px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isLocked ? (
                            `${band.progressive_discount_percent}%`
                          ) : (
                            <div className="relative">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={0.01}
                                value={band.progressive_discount_percent}
                                onChange={(e) =>
                                  updateBand(band._clientKey, "progressive_discount_percent", Number(e.target.value))
                                }
                                className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isLocked ? (
                            band.semester_total != null ? `$${band.semester_total.toFixed(2)}` : "—"
                          ) : (
                            <div className="relative">
                              <span className="absolute left-2 top-1.5 text-gray-400 text-xs">$</span>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                placeholder="0.00"
                                value={band.semester_total ?? ""}
                                onChange={(e) =>
                                  updateBand(
                                    band._clientKey,
                                    "semester_total",
                                    e.target.value ? Number(e.target.value) : undefined,
                                  )
                                }
                                className="w-24 pl-4 rounded-lg border border-gray-300 px-2 py-1 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isLocked ? (
                            band.autopay_installment_amount != null
                              ? `$${band.autopay_installment_amount.toFixed(2)}`
                              : "—"
                          ) : (
                            <div className="space-y-0.5">
                              <div className="relative">
                                <span className="absolute left-2 top-1.5 text-gray-400 text-xs">$</span>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  placeholder="0.00"
                                  value={band.autopay_installment_amount ?? ""}
                                  onChange={(e) =>
                                    updateBand(
                                      band._clientKey,
                                      "autopay_installment_amount",
                                      e.target.value ? Number(e.target.value) : undefined,
                                    )
                                  }
                                  className="w-24 pl-4 rounded-lg border border-gray-300 px-2 py-1 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                              </div>
                              {band.autopay_installment_amount && band.semester_total ? (
                                <p className="text-xs text-gray-400 pl-1">
                                  5× = ${(band.autopay_installment_amount * 5).toFixed(2)}
                                </p>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isLocked ? (
                            band.notes ?? "—"
                          ) : (
                            <input
                              type="text"
                              placeholder="Optional"
                              value={band.notes ?? ""}
                              onChange={(e) =>
                                updateBand(band._clientKey, "notes", e.target.value)
                              }
                              className="w-32 rounded-lg border border-gray-300 px-2 py-1 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          )}
                        </td>
                        {!isLocked && (
                          <td className="px-3 py-2">
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
                          division: e.target.value as DraftTuitionRateBand["division"],
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
                    <label className="text-xs text-gray-500">Classes/Week</label>
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
                    <label className="text-xs text-gray-500">Base Tuition ($)</label>
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
                    <label className="text-xs text-gray-500">Discount % (nth class)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      placeholder="0"
                      value={newBand.progressive_discount_percent || ""}
                      onChange={(e) =>
                        setNewBand((prev) => ({
                          ...prev,
                          progressive_discount_percent: Number(e.target.value),
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">Semester Total ($)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="0.00"
                      value={newBand.semester_total ?? ""}
                      onChange={(e) =>
                        setNewBand((prev) => ({
                          ...prev,
                          semester_total: e.target.value ? Number(e.target.value) : undefined,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">Auto-Pay /mo ($)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="0.00"
                      value={newBand.autopay_installment_amount ?? ""}
                      onChange={(e) =>
                        setNewBand((prev) => ({
                          ...prev,
                          autopay_installment_amount: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {newBand.autopay_installment_amount && (
                      <p className="text-xs text-gray-400">
                        5× = ${(newBand.autopay_installment_amount * 5).toFixed(2)}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">Notes (optional)</label>
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
        {/* Tab: Special Programs                                               */}
        {/* ------------------------------------------------------------------ */}
        {activeSubStep === "programs" && (
          <div className="space-y-6">
            <p className="text-sm text-gray-500">
              Fixed-tuition programs that bypass division-based progressive
              discount calculations. These amounts are used exactly as entered —
              no additional discounts apply.
            </p>

            {programs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
                  <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-3 text-left">Program</th>
                      <th className="px-4 py-3 text-left">Semester Total</th>
                      <th className="px-4 py-3 text-left">Auto-Pay /mo</th>
                      <th className="px-4 py-3 text-left">Installments</th>
                      <th className="px-4 py-3 text-left">Reg. Fee Override</th>
                      <th className="px-4 py-3 text-left">Notes</th>
                      {!isLocked && <th className="px-4 py-3" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {programs.map((prog) => (
                      <tr key={prog._clientKey}>
                        <td className="px-4 py-2">
                          {isLocked ? (
                            <span>{prog.programLabel}</span>
                          ) : (
                            <select
                              value={prog.programKey}
                              onChange={(e) => {
                                const selected = SPECIAL_PROGRAM_KEYS.find(
                                  (k) => k.value === e.target.value,
                                );
                                updateProgram(prog._clientKey, {
                                  programKey: e.target.value,
                                  programLabel: selected?.label ?? e.target.value,
                                });
                              }}
                              className="rounded-lg border border-gray-300 px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            >
                              {SPECIAL_PROGRAM_KEYS.map((k) => (
                                <option key={k.value} value={k.value}>
                                  {k.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {isLocked ? (
                            `$${prog.semesterTotal.toFixed(2)}`
                          ) : (
                            <div className="relative">
                              <span className="absolute left-2 top-1.5 text-gray-400 text-xs">$</span>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={prog.semesterTotal}
                                onChange={(e) =>
                                  updateProgram(prog._clientKey, {
                                    semesterTotal: Number(e.target.value),
                                  })
                                }
                                className="w-28 pl-4 rounded-lg border border-gray-300 px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {isLocked ? (
                            prog.autoPayInstallmentAmount != null
                              ? `$${prog.autoPayInstallmentAmount.toFixed(2)}`
                              : "N/A"
                          ) : (
                            <div className="space-y-0.5">
                              <div className="relative">
                                <span className="absolute left-2 top-1.5 text-gray-400 text-xs">$</span>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  placeholder="N/A"
                                  value={prog.autoPayInstallmentAmount ?? ""}
                                  onChange={(e) =>
                                    updateProgram(prog._clientKey, {
                                      autoPayInstallmentAmount: e.target.value
                                        ? Number(e.target.value)
                                        : null,
                                    })
                                  }
                                  className="w-24 pl-4 rounded-lg border border-gray-300 px-2 py-1 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                              </div>
                              {prog.autoPayInstallmentAmount &&
                              prog.autoPayInstallmentCount ? (
                                <p className="text-xs text-gray-400 pl-1">
                                  {prog.autoPayInstallmentCount}× = $
                                  {(
                                    prog.autoPayInstallmentAmount *
                                    prog.autoPayInstallmentCount
                                  ).toFixed(2)}
                                </p>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {isLocked ? (
                            prog.autoPayInstallmentCount ?? "N/A"
                          ) : (
                            <input
                              type="number"
                              min={1}
                              placeholder="5"
                              value={prog.autoPayInstallmentCount ?? ""}
                              onChange={(e) =>
                                updateProgram(prog._clientKey, {
                                  autoPayInstallmentCount: e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                })
                              }
                              className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {isLocked ? (
                            prog.registrationFeeOverride != null
                              ? prog.registrationFeeOverride === 0
                                ? "Exempt ($0)"
                                : `$${prog.registrationFeeOverride.toFixed(2)}`
                              : "Global"
                          ) : (
                            <div className="space-y-0.5">
                              <div className="relative">
                                <span className="absolute left-2 top-1.5 text-gray-400 text-xs">$</span>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  placeholder="Global"
                                  value={prog.registrationFeeOverride ?? ""}
                                  onChange={(e) =>
                                    updateProgram(prog._clientKey, {
                                      registrationFeeOverride: e.target.value !== ""
                                        ? Number(e.target.value)
                                        : null,
                                    })
                                  }
                                  className="w-24 pl-4 rounded-lg border border-gray-300 px-2 py-1 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                              </div>
                              <p className="text-xs text-gray-400 pl-1">
                                0 = exempt; blank = global
                              </p>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {isLocked ? (
                            prog.notes ?? "—"
                          ) : (
                            <input
                              type="text"
                              placeholder="Optional"
                              value={prog.notes ?? ""}
                              onChange={(e) =>
                                updateProgram(prog._clientKey, { notes: e.target.value })
                              }
                              className="w-36 rounded-lg border border-gray-300 px-2 py-1 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          )}
                        </td>
                        {!isLocked && (
                          <td className="px-4 py-2">
                            <button
                              onClick={() => removeProgram(prog._clientKey)}
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
                  No special program rates configured yet. Add programs below.
                </p>
              </div>
            )}

            {/* Add new program */}
            {!isLocked && (
              <div className="rounded-xl border border-gray-200 p-4 space-y-4">
                <h4 className="text-sm font-medium text-gray-700">
                  Add Special Program
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs text-gray-500">Program</label>
                    <select
                      value={newProgram.programKey}
                      onChange={(e) => {
                        const selected = SPECIAL_PROGRAM_KEYS.find(
                          (k) => k.value === e.target.value,
                        );
                        setNewProgram((prev) => ({
                          ...prev,
                          programKey: e.target.value,
                          programLabel: selected?.label ?? e.target.value,
                        }));
                      }}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {SPECIAL_PROGRAM_KEYS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">Semester Total ($)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="0.00"
                      value={newProgram.semesterTotal || ""}
                      onChange={(e) =>
                        setNewProgram((prev) => ({
                          ...prev,
                          semesterTotal: Number(e.target.value),
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">Auto-Pay /mo ($)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="N/A"
                      value={newProgram.autoPayInstallmentAmount ?? ""}
                      onChange={(e) =>
                        setNewProgram((prev) => ({
                          ...prev,
                          autoPayInstallmentAmount: e.target.value
                            ? Number(e.target.value)
                            : null,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {newProgram.autoPayInstallmentAmount &&
                    newProgram.autoPayInstallmentCount ? (
                      <p className="text-xs text-gray-400">
                        {newProgram.autoPayInstallmentCount}× = $
                        {(
                          newProgram.autoPayInstallmentAmount *
                          newProgram.autoPayInstallmentCount
                        ).toFixed(2)}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">Installments</label>
                    <input
                      type="number"
                      min={1}
                      placeholder="5"
                      value={newProgram.autoPayInstallmentCount ?? ""}
                      onChange={(e) =>
                        setNewProgram((prev) => ({
                          ...prev,
                          autoPayInstallmentCount: e.target.value
                            ? Number(e.target.value)
                            : null,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-3">
                    <label className="text-xs text-gray-500">Notes (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. 9-class session, no recital"
                      value={newProgram.notes ?? ""}
                      onChange={(e) =>
                        setNewProgram((prev) => ({ ...prev, notes: e.target.value }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <button
                  onClick={addProgram}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 transition"
                >
                  + Add Program
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
                  Flat discount applied once per family per semester (default $50).
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

            <div className="border-t border-gray-100 pt-6">
              <p className="text-sm font-medium text-gray-700 mb-1">
                Junior Division Fees
              </p>
              <p className="text-xs text-gray-400 mb-4">
                Applied to standard junior classes only. Technique, Pointe, Competition, and Early Childhood are exempt.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Recital Costume Fee (per class, junior)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                      $
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={feeConfig.junior_costume_fee_per_class}
                      onChange={(e) =>
                        updateFeeConfig(
                          "junior_costume_fee_per_class",
                          Number(e.target.value),
                        )
                      }
                      disabled={isLocked}
                      className="w-full pl-7 rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    Per-class recital costume fee for junior dancers; multiplied by weekly
                    class count (default $55).
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-6">
              <p className="text-sm font-medium text-gray-700 mb-1">
                Senior Division Fees
              </p>
              <p className="text-xs text-gray-400 mb-4">
                Applied to standard senior classes only. Technique, Pointe, and Competition are exempt.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Video fee (per senior registrant)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                      $
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={feeConfig.senior_video_fee_per_registrant}
                      onChange={(e) =>
                        updateFeeConfig(
                          "senior_video_fee_per_registrant",
                          Number(e.target.value),
                        )
                      }
                      disabled={isLocked}
                      className="w-full pl-7 rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    Flat fee charged once per senior dancer per semester (default $15).
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Recital Costume Fee (per class, senior)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                      $
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={feeConfig.senior_costume_fee_per_class}
                      onChange={(e) =>
                        updateFeeConfig(
                          "senior_costume_fee_per_class",
                          Number(e.target.value),
                        )
                      }
                      disabled={isLocked}
                      className="w-full pl-7 rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    Per-class recital costume fee for senior dancers; multiplied by weekly
                    class count (default $65).
                  </p>
                </div>
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
