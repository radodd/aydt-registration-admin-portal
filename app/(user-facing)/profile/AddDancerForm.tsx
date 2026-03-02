"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

interface AddDancerFormProps {
  familyId: string;
}

export default function AddDancerForm({ familyId }: AddDancerFormProps) {
  const supabase = createClient();
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [grade, setGrade] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;

    setIsSubmitting(true);
    setErrorMsg("");

    const { error } = await supabase.from("dancers").insert({
      first_name: firstName,
      last_name: lastName,
      birth_date: birthDate || null,
      grade: grade || null,
      family_id: familyId,
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    router.refresh(); // cleaner than push for dashboard updates
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm space-y-6"
    >
      {/* Error */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {errorMsg}
        </div>
      )}

      {/* Name Fields */}
      <div className="grid sm:grid-cols-2 gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">
            First Name
          </label>
          <input
            type="text"
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-slate-700
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                       transition"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">Last Name</label>
          <input
            type="text"
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-slate-700
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                       transition"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
        </div>
      </div>

      {/* Secondary Fields */}
      <div className="grid sm:grid-cols-2 gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">
            Birth Date
          </label>
          <input
            type="date"
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-slate-700
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                       transition"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">Grade</label>
          <input
            type="text"
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                       transition"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            placeholder="Optional"
          />
        </div>
      </div>

      {/* Submit */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full sm:w-auto inline-flex items-center justify-center
                     rounded-2xl bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white
                     hover:bg-indigo-700 transition
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Adding..." : "Add Dancer"}
        </button>
      </div>
    </form>
  );
}
