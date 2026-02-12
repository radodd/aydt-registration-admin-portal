"use client";

import { DetailsFormState, DetailsStepProps } from "@/types";
import { useState } from "react";
import { createSemesterDraft } from "../actions/createSemesterDraft";
import { updateSemesterDetails } from "../actions/updateSemesterDetails";

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function DetailsStep({
  state,
  dispatch,
  onNext,
}: DetailsStepProps) {
  const [form, setForm] = useState({
    name: state.details?.name ?? "",
    trackingMode: state.details?.trackingMode ?? false,
    capacityWarningThreshold: state.details?.capacityWarningThreshold ?? "",
  });

  /* ------------------------------------------------------------------------ */
  /* Handlers                                                                 */
  /* ------------------------------------------------------------------------ */

  function updateField<K extends keyof DetailsFormState>(
    key: K,
    value: DetailsFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleDetailsNext(formValues: DetailsFormState) {
    if (!form.name.trim()) {
      alert("Name is required");
      return;
    }

    try {
      let semesterId = state.id;

      if (!semesterId) {
        // First time → create draft
        semesterId = await createSemesterDraft();
        dispatch({ type: "SET_ID", payload: semesterId });
      }

      await updateSemesterDetails(semesterId!, formValues);

      // router.push("/admin/semesters/new?step=sessions");

      dispatch({
        type: "SET_DETAILS",
        payload: {
          name: form.name.trim(),
          trackingMode: form.trackingMode,
          capacityWarningThreshold:
            form.capacityWarningThreshold !== ""
              ? Number(form.capacityWarningThreshold)
              : 0,
        },
      });

      onNext();
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-8">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
            Semester Details
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Configure general semester settings and enrollment behavior.
          </p>
        </div>

        <div className="space-y-6">
          {/* Semester Name */}
          <div className="space-y-2">
            <label
              htmlFor="semester-name"
              className="text-sm font-medium text-gray-700"
            >
              Semester name
            </label>
            <input
              id="semester-name"
              type="text"
              placeholder="Fall 2026"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
            />
          </div>

          {/* Attendance Tracking */}
          <div className="flex items-start gap-3 rounded-xl border border-gray-200 p-4">
            <input
              id="tracking-mode"
              type="checkbox"
              checked={form.trackingMode}
              onChange={(e) => updateField("trackingMode", e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div className="space-y-1">
              <label
                htmlFor="tracking-mode"
                className="text-sm font-medium text-gray-800"
              >
                Enable attendance tracking
              </label>
              <p className="text-xs text-gray-500">
                Track student attendance for reporting and compliance.
              </p>
            </div>
          </div>

          {/* Capacity Warning */}
          <div className="space-y-2">
            <label
              htmlFor="capacity-threshold"
              className="text-sm font-medium text-gray-700"
            >
              Capacity warning threshold
            </label>

            <div className="flex items-center gap-3">
              <input
                id="capacity-threshold"
                type="number"
                min={0}
                max={100}
                placeholder="80"
                value={form.capacityWarningThreshold}
                onChange={(e) =>
                  updateField("capacityWarningThreshold", e.target.value)
                }
                className="w-28 rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
              />
              <span className="text-sm text-gray-500">% full</span>
            </div>

            <p className="text-xs text-gray-500">
              When enrollment reaches this percentage, users will see “Only X
              spots left”.
            </p>
          </div>

          {/* Actions */}
          <div className="pt-4 flex justify-end">
            <button
              onClick={() => handleDetailsNext(form)}
              className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
