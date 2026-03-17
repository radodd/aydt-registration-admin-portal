"use client";

import { useState } from "react";
import { FormField, ModalActions, inputCls } from "./FormHelpers";
import type { AddDancerInput } from "../actions/addDancer";
import type { UpdateDancerInput } from "../actions/updateDancer";

interface DancerLike {
  id: string;
  first_name: string;
  last_name: string;
  birth_date?: string | null;
  gender?: string | null;
}

export function DancerFormModal({
  mode,
  initial,
  familyId,
  onAdd,
  onUpdate,
  onClose,
  error,
  isPending,
}: {
  mode: "add" | "edit";
  initial?: DancerLike;
  familyId?: string;
  onAdd: (input: AddDancerInput) => void;
  onUpdate: (input: UpdateDancerInput) => void;
  onClose: () => void;
  error: string | null;
  isPending: boolean;
}) {
  const [firstName, setFirstName] = useState(initial?.first_name ?? "");
  const [lastName, setLastName] = useState(initial?.last_name ?? "");
  const [birthDate, setBirthDate] = useState(initial?.birth_date ?? "");
  const [gender, setGender] = useState(initial?.gender ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "add") {
      onAdd({ familyId: familyId!, firstName, lastName, birthDate, gender });
    } else {
      onUpdate({ dancerId: initial!.id, firstName, lastName, birthDate, gender });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-5">
      <h2 className="text-lg font-semibold text-neutral-900">
        {mode === "add" ? "Add Dancer" : "Edit Dancer"}
      </h2>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="First Name" required>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className={inputCls}
            />
          </FormField>
          <FormField label="Last Name" required>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className={inputCls}
            />
          </FormField>
        </div>

        <FormField label="Date of Birth">
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className={inputCls}
          />
        </FormField>

        <FormField label="Gender">
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className={inputCls}
          >
            <option value="">Select...</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="non_binary">Non-binary</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </FormField>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ModalActions
        onClose={onClose}
        isPending={isPending}
        submitLabel={mode === "add" ? "Add Dancer" : "Save Changes"}
      />
    </form>
  );
}
