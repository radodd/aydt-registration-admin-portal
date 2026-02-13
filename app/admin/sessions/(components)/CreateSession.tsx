"use client";

import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface CreateSessionProps {
  onSuccess?: () => void;
}

export default function CreateSession({ onSuccess }: CreateSessionProps) {
  const supabase = createClient();
  const router = useRouter();

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "session",
    type: "",
    location: "",
    price: "",
    start_date: "",
    end_date: "",
    days_of_week: "Monday",
    start_time: "",
    end_time: "",
    capacity: "",
  });

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    const { error } = await supabase.from("sessions").insert([
      {
        semester_id: "11111111-1111-1111-1111-111111111111",
        title: formData.title,
        description: formData.description,
        category: formData.category,
        type: formData.type,
        location: formData.location,
        price: parseFloat(formData.price),
        start_date: formData.start_date,
        end_date: formData.end_date,
        days_of_week: [formData.days_of_week],
        start_time: formData.start_time,
        end_time: formData.end_time,
        capacity: parseInt(formData.capacity) || null,
      },
    ]);

    if (error) {
      console.error("Create Session Error:", error);
      console.error("Error details:", error.details);
      console.error("Error hint:", error.hint);
      console.error("Error message:", error.message);
      setToast({
        type: "error",
        message: error.message,
      });
      return;
    }

    setToast({
      type: "success",
      message: "Session created successfully.",
    });

    setTimeout(() => {
      onSuccess?.();
      router.refresh();
    }, 1000);
    return;
  };

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50">
          <div
            className={`px-5 py-3 rounded-2xl shadow-lg text-sm font-medium
              ${
                toast.type === "success"
                  ? "bg-indigo-600 text-white"
                  : "bg-red-600 text-white"
              }`}
          >
            {toast.message}
          </div>
        </div>
      )}
      <form
        onSubmit={handleCreate}
        className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-10"
      >
        {/* Header */}
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">
            Create Session
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Add a new class or workshop offering.
          </p>
        </div>

        {/* ============================================================
          Basic Info
      ============================================================ */}
        <section className="space-y-6">
          <h3 className="text-sm font-medium uppercase tracking-wide text-gray-600">
            Basic Information
          </h3>

          <div className="grid md:grid-cols-2 gap-6">
            <Input
              label="Title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
            />
            <Input
              label="Type"
              name="type"
              value={formData.type}
              onChange={handleChange}
            />
            <Input
              label="Location"
              name="location"
              value={formData.location}
              onChange={handleChange}
            />
            <Input
              label="Price"
              name="price"
              type="number"
              step="0.01"
              value={formData.price}
              onChange={handleChange}
              required
            />
            <Select
              label="Category"
              name="category"
              value={formData.category}
              onChange={handleChange}
              options={[
                { label: "Session", value: "session" },
                { label: "Workshop", value: "workshop" },
              ]}
            />
            <Input
              label="Capacity"
              name="capacity"
              type="number"
              value={formData.capacity}
              onChange={handleChange}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
              rows={4}
            />
          </div>
        </section>

        {/* ============================================================
          Schedule
      ============================================================ */}
        <section className="space-y-6">
          <h3 className="text-sm font-medium uppercase tracking-wide text-gray-600">
            Schedule
          </h3>

          <div className="grid md:grid-cols-3 gap-6">
            <Input
              label="Start Date"
              name="start_date"
              type="date"
              value={formData.start_date}
              onChange={handleChange}
              required
            />
            <Input
              label="End Date"
              name="end_date"
              type="date"
              value={formData.end_date}
              onChange={handleChange}
              required
            />
            <Select
              label="Day of Week"
              name="days_of_week"
              value={formData.days_of_week}
              onChange={handleChange}
              options={[
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
                "Sunday",
              ].map((d) => ({ label: d, value: d }))}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Input
              label="Start Time"
              name="start_time"
              type="time"
              value={formData.start_time}
              onChange={handleChange}
              required
            />
            <Input
              label="End Time"
              name="end_time"
              type="time"
              value={formData.end_time}
              onChange={handleChange}
              required
            />
          </div>
        </section>

        {/* Submit */}
        <div className="pt-4 border-t border-gray-100 flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center px-6 py-2.5 rounded-2xl
                     bg-indigo-600 text-white text-sm font-medium
                     hover:bg-indigo-700 transition"
          >
            Save Session
          </button>
        </div>
      </form>{" "}
    </>
  );
}

/* ============================================================
   Reusable Styled Inputs
============================================================ */

function Input({ label, ...props }: any) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </label>
      <input
        {...props}
        className="w-full rounded-xl border text-gray-700 border-gray-300 px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
      />
    </div>
  );
}

function Select({ label, options, ...props }: any) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </label>
      <select
        {...props}
        className="w-full rounded-xl border text-gray-700 border-gray-300 px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
      >
        {options.map((o: any) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
