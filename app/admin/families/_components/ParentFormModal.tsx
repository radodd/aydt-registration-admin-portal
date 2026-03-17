"use client";

import { useState } from "react";
import { FormField, ModalActions, inputCls } from "./FormHelpers";
import type { AddParentInput } from "../actions/addParent";
import type { UpdateParentInput } from "../actions/updateParent";

interface ParentLike {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string | null;
}

export function ParentFormModal({
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
  initial?: ParentLike;
  familyId: string;
  onAdd: (input: AddParentInput) => void;
  onUpdate: (input: UpdateParentInput) => void;
  onClose: () => void;
  error: string | null;
  isPending: boolean;
}) {
  const [firstName, setFirstName] = useState(initial?.first_name ?? "");
  const [lastName, setLastName] = useState(initial?.last_name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone_number ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "add") {
      onAdd({ familyId, firstName, lastName, email, phone });
    } else {
      onUpdate({ userId: initial!.id, firstName, lastName, email, phone });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-5">
      <h2 className="text-lg font-semibold text-neutral-900">
        {mode === "add" ? "Add Additional Parent" : "Edit Parent"}
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

        <FormField label="Email" required>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={inputCls}
          />
        </FormField>

        <FormField label="Phone">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputCls}
          />
        </FormField>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ModalActions
        onClose={onClose}
        isPending={isPending}
        submitLabel={mode === "add" ? "Add Parent" : "Save Changes"}
      />
    </form>
  );
}
