"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { notFound } from "next/navigation";
import { useRouter } from "next/navigation";
import { Program, ProgramAvailableDay } from "@/types";

export default function ProgramDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [program, setProgram] = useState<Program>();
  const [availableDays, setAvailableDays] = useState<ProgramAvailableDay[]>([]);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { id } = await params;
      const supabase = createClient();

      // Fetch program details
      const { data: prog, error: progError } = await supabase
        .from("programs")
        .select("*")
        .eq("id", id)
        .single();

      if (progError || !prog) {
        console.error("Error loading program details.", progError?.message);
        setError("Program not found.");
        setLoading(false);
        return;
      }

      setProgram(prog);

      // If it's a workshop, fetch available days
      if (prog.category === "workshop") {
        const { data: days, error: daysError } = await supabase
          .from("program_available_days")
          .select("id, date, start_time, end_time, capacity")
          .eq("program_id", prog.id)
          .order("date", { ascending: true });

        if (daysError) console.error("Error loading available days", daysError);
        setAvailableDays(days || []);
      }

      setLoading(false);
    })();
  }, [params]);

  const toggleDay = (dayId: string) => {
    setSelectedDays((prev) =>
      prev.includes(dayId)
        ? prev.filter((id) => id !== dayId)
        : [...prev, dayId]
    );
  };

  const handleClick = async () => {
    if (program?.category === "workshop") {
      alert(`Selected days: ${selectedDays.length}`);
    }
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error) {
      console.error("Auth check error.", error.message);
    }
    if (user) {
      router.push(`/registration?program=${program?.id}`);
    } else {
      router.push("/auth");
    }
  };

  if (loading) return <p className="text-center mt-10">Loading program...</p>;
  if (error || !program) notFound();

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-gray-900 mb-4">{program.title}</h1>

      <p className="text-gray-600 mb-2">
        <strong>Category:</strong> {program.category}
      </p>
      <p className="text-gray-600 mb-2">
        <strong>Type:</strong> {program.type}
      </p>
      <p className="text-gray-600 mb-2">
        <strong>Location:</strong> {program.location}
      </p>

      <p className="text-gray-700 mt-4 mb-4">{program.description}</p>

      <section className="bg-gray-50 text-gray-700 rounded-xl p-4 space-y-2 mb-6">
        <h2 className="font-semibold text-lg mb-2">Program Details</h2>
        <p>
          <strong>Dates:</strong> {program.start_date} → {program.end_date}
        </p>
        <p>
          <strong>Days of Week:</strong>{" "}
          {program.days_of_week ? program.days_of_week.join(", ") : "N/A"}
        </p>
        <p>
          <strong>Time:</strong> {program.start_time} – {program.end_time}
        </p>
        <p>
          <strong>Capacity:</strong> {program.capacity ?? "Unlimited"}
        </p>
      </section>

      {program.category === "workshop" && (
        <section className="bg-blue-50 text-gray-800 rounded-xl p-4 space-y-3 mb-6">
          <h2 className="font-semibold text-lg mb-3">Select Workshop Days</h2>

          {availableDays.length > 0 ? (
            <ul className="space-y-2">
              {availableDays.map((day) => {
                const isSelected = selectedDays.includes(day.id);
                const dateLabel = new Date(day.date).toLocaleDateString(
                  undefined,
                  {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  }
                );
                return (
                  <li key={day.id}>
                    <button
                      type="button"
                      onClick={() => toggleDay(day.id)}
                      className={`w-full flex justify-between items-center px-4 py-2 rounded-lg border transition ${
                        isSelected
                          ? "bg-blue-600 text-white border-blue-700"
                          : "bg-white text-gray-800 border-gray-300 hover:bg-gray-100"
                      }`}
                    >
                      <span>{dateLabel}</span>
                      <span className="text-sm">
                        {day.start_time} – {day.end_time}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-gray-600">No available days listed yet.</p>
          )}
        </section>
      )}

      <section className="space-y-2">
        <p className="text-lg font-medium">
          💲 Tuition:{" "}
          <span className="font-bold">${program.price?.toFixed(2)}</span>
        </p>
        {program.registration_fee && (
          <p className="text-gray-600">
            Registration Fee: ${program.registration_fee.toFixed(2)}
          </p>
        )}
        {program.discount && program.discount.length > 0 && (
          <p className="text-green-600">
            Discounts: {program.discount.join(", ")}
          </p>
        )}
      </section>

      <button
        className="mt-6 w-full bg-blue-600 text-white rounded-xl py-3 text-lg font-semibold hover:bg-blue-700 transition"
        onClick={() => handleClick()}
      >
        {program.category === "workshop"
          ? "Continue with Selected Days"
          : "Register for this Program"}
      </button>
    </main>
  );
}
