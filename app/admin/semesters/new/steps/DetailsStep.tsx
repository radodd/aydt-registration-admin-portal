"use client";

import { useState } from "react";

export default function DetailsStep({ state, dispatch, onNext }: any) {
  const [form, setForm] = useState({
    name: state.details?.name ?? "",
    trackingMode: state.details?.trackingMode ?? false,
    capacityWarningThreshold: state.details?.capacityWarningThreshold ?? "",
    // publishAt: state.details?.publishAt ?? "",
  });

  function submit() {
    if (!form.name) {
      alert("Name is required");
      return;
    }

    dispatch({
      type: "SET_DETAILS",
      payload: {
        name: form.name,
        trackingMode: form.trackingMode,
        capacityWarningThreshold:
          form.capacityWarningThreshold !== ""
            ? Number(form.capacityWarningThreshold)
            : null,
        // publishAt: new Date(form.publishAt),
      },
    });

    onNext();
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Semester Details</h2>

      <div className="flex flex-col gap-6">
        <input
          placeholder="Semester name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />

        <label>
          <input
            type="checkbox"
            checked={form.trackingMode}
            onChange={(e) =>
              setForm({ ...form, trackingMode: e.target.checked })
            }
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
              setForm({
                ...form,
                capacityWarningThreshold: e.target.value,
              })
            }
          />
          % full, display &quot;Only X spots left&quot; message to users.
        </label>
        {/* 
        <input
          type="datetime-local"
          value={form.publishAt}
          onChange={(e) => setForm({ ...form, publishAt: e.target.value })}
        /> */}

        <button className="mouse" onClick={submit}>
          Next
        </button>
      </div>
    </div>
  );
}
