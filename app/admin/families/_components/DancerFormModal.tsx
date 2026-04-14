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
  grade?: string | null;
  secondary_email?: string | null;
  school?: string | null;
}

const GRADE_OPTIONS = [
  { value: "", label: "Select..." },
  { value: "Pre-K", label: "Pre-K" },
  { value: "K", label: "Kindergarten" },
  { value: "1", label: "1st grade" },
  { value: "2", label: "2nd grade" },
  { value: "3", label: "3rd grade" },
  { value: "4", label: "4th grade" },
  { value: "5", label: "5th grade" },
  { value: "6", label: "6th grade" },
  { value: "7", label: "7th grade" },
  { value: "8", label: "8th grade" },
  { value: "9", label: "9th grade" },
  { value: "10", label: "10th grade" },
  { value: "11", label: "11th grade (Junior)" },
  { value: "12", label: "12th grade (Senior)" },
];

function isUpperclassman(grade: string): boolean {
  return grade === "11" || grade === "12";
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
  const [grade, setGrade] = useState(initial?.grade ?? "");
  const [secondaryEmail, setSecondaryEmail] = useState(initial?.secondary_email ?? "");
  const [school, setSchool] = useState(initial?.school ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "add") {
      onAdd({ familyId: familyId!, firstName, lastName, birthDate, gender, grade, secondaryEmail, school });
    } else {
      onUpdate({ dancerId: initial!.id, firstName, lastName, birthDate, gender, grade, secondaryEmail, school });
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

        <div className="grid grid-cols-2 gap-3">
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

          <FormField label="Grade">
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className={inputCls}
            >
              {GRADE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </FormField>
        </div>

        <FormField label="School">
          <input
            type="text"
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            placeholder="e.g. PS 123, Lincoln High School"
            className={inputCls}
          />
        </FormField>

        {isUpperclassman(grade) && (
          <FormField label="Student Email">
            <input
              type="email"
              value={secondaryEmail}
              onChange={(e) => setSecondaryEmail(e.target.value)}
              placeholder="student@email.com"
              className={inputCls}
            />
            <p className="text-xs text-neutral-400 mt-1">
              Notifications will also be sent directly to this student.
            </p>
          </FormField>
        )}
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
