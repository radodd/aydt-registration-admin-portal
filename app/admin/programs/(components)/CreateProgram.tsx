"use client";

import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CreateProgram() {
  const supabase = createClient();
  const router = useRouter();

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "",
    type: "",
    location: "",
    price: "",
    start_date: "",
    end_date: "",
    days_of_week: [],
    start_time: "",
    end_time: "",
    capacity: "",
  });

  const handleChange = (e: any) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    const { data, error } = await supabase.from("programs").insert([
      {
        title: formData.title,
        description: formData.description,
        category: formData.category,
        type: formData.type,
        location: formData.location,
        price: parseFloat(formData.price),
        start_date: formData.start_date,
        end_date: formData.end_date,
        days_of_week: formData.days_of_week.length
          ? formData.days_of_week
          : ["Monday"],
        start_time: formData.start_time,
        end_time: formData.end_time,
        capacity: parseInt(formData.capacity) || null,
      },
    ]);

    if (error) {
      alert("Error creating program." + error.message);
    } else {
      alert("Program added successfully");
      setFormData({
        title: "",
        description: "",
        category: "session",
        type: "",
        location: "",
        price: "",
        start_date: "",
        end_date: "",
        days_of_week: [],
        start_time: "",
        end_time: "",
        capacity: "",
      });

      router.refresh();
    }
  };

  return (
    <form
      onSubmit={handleCreate}
      className="border rounded-lg p-4 bg-gray-50 mb-6 space-y-4"
    >
      <div className="grid grid-cols-2 gap-4">
        <input
          name="title"
          placeholder="Program Title"
          value={formData.title}
          onChange={handleChange}
          className="border rounded-lg px-3 py-2"
          required
        />
        <input
          name="type"
          placeholder="Type (e.g. Tap, Ballet)"
          value={formData.type}
          onChange={handleChange}
          className="border rounded-lg px-3 py-2"
        />
        <input
          name="location"
          placeholder="Location"
          value={formData.location}
          onChange={handleChange}
          className="border rounded-lg px-3 py-2"
        />
        <input
          name="price"
          type="number"
          placeholder="Price"
          value={formData.price}
          onChange={handleChange}
          className="border rounded-lg px-3 py-2"
          step="0.01"
        />
        <select
          name="category"
          value={formData.category}
          onChange={handleChange}
          className="border rounded-lg px-3 py-2"
        >
          <option value="session">Session</option>
          <option value="workshop">Workshop</option>
        </select>
        <input
          name="capacity"
          type="number"
          placeholder="Capacity"
          value={formData.capacity}
          onChange={handleChange}
          className="border rounded-lg px-3 py-2"
        />
        <input
          name="start_date"
          type="date"
          value={formData.start_date}
          onChange={handleChange}
          className="border rounded-lg px-3 py-2"
        />
        <input
          name="end_date"
          type="date"
          value={formData.end_date}
          onChange={handleChange}
          className="border rounded-lg px-3 py-2"
        />
        <input
          name="start_time"
          type="time"
          value={formData.start_time}
          onChange={handleChange}
          className="border rounded-lg px-3 py-2"
        />
        <input
          name="end_time"
          type="time"
          value={formData.end_time}
          onChange={handleChange}
          className="border rounded-lg px-3 py-2"
        />
      </div>
      <textarea
        name="description"
        placeholder="Program description"
        value={formData.description}
        onChange={handleChange}
        className="border rounded-lg px-3 py-2 w-full"
      />
      <button
        type="submit"
        className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700"
      >
        Save Program
      </button>
    </form>
  );
}
