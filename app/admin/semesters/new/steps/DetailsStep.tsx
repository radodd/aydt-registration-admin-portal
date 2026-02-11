"use client";

import { DetailsFormState, DetailsStepProps } from "@/types";
import { useState } from "react";
import { createSemesterDraft } from "../../actions/createSemesterDraft";
import { updateSemesterDetails } from "../../actions/updateSemesterDetails";

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
    <div>
      <h2 className="text-xl font-semibold mb-4">Semester Details</h2>

      <div className="flex flex-col gap-6">
        <input
          placeholder="Semester name"
          value={form.name}
          onChange={(e) => updateField("name", e.target.value)}
        />

        <label>
          <input
            type="checkbox"
            checked={form.trackingMode}
            onChange={(e) => updateField("trackingMode", e.target.checked)}
          />
          Enable attendance tracking
        </label>

        <label>
          Display remaining capacity when capacity is
          <input
            type="number"
            placeholder="80"
            value={form.capacityWarningThreshold}
            onChange={(e) =>
              updateField("capacityWarningThreshold", e.target.value)
            }
          />
          % full, display &quot;Only X spots left&quot; message to users.
        </label>

        <button className="mouse" onClick={() => handleDetailsNext(form)}>
          Next
        </button>
      </div>
    </div>
  );
}
