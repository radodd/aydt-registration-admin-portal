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

    const { data, error } = await supabase
      .from("dancers")
      .insert({
        first_name: firstName,
        last_name: lastName,
        birth_date: birthDate || null,
        grade: grade || null,
        family_id: familyId,
      })
      .select("*")
      .single();

    setIsSubmitting(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    // Redirect back to profile page
    router.push("/profile");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 border p-6 rounded-xl bg-gray-50"
    >
      {errorMsg && <p className="text-red-600 font-medium">{errorMsg}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <input
          type="text"
          placeholder="First Name"
          className="border rounded-lg p-2"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="Last Name"
          className="border rounded-lg p-2"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <input
          type="date"
          placeholder="Birth Date"
          className="border rounded-lg p-2"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
        />
        <input
          type="text"
          placeholder="Grade"
          className="border rounded-lg p-2"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
      >
        {isSubmitting ? "Adding..." : "Add Dancer"}
      </button>
    </form>
  );
}
