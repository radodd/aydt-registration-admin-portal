"use client";

import { createClient } from "@/utils/supabase/client";
import React, { useEffect, useState } from "react";

interface RegistrationFormProps {
  participantFirstName: string;
  participantLastName: string;
  participantDob: string;
  user: any;
  registerSelf: boolean;
  program: any;
}

export default function RegistrationForm({
  participantFirstName,
  participantLastName,
  participantDob,
  user,
  registerSelf = true,
  program,
}: RegistrationFormProps) {
  const supabase = createClient();

  const [formData, setFormData] = useState({
    first_name: participantFirstName || "",
    last_name: participantLastName || "",
    birth_date: participantDob || "",
    email: user?.email || "",
    phone_number: user?.phone_number || "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    zipcode: "",
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => console.log(formData.first_name));

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      first_name: participantFirstName,
      last_name: participantLastName,
      birth_date: participantDob,
    }));
  }, [participantFirstName, participantLastName, participantDob]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const { data: dancerData, error: dancerError } = await supabase
        .from("dancers")
        .insert([
          {
            family_id: user.family_id || null, // optional
            user_id: user.id, // who manages the dancer
            first_name: participantFirstName,
            last_name: participantLastName,
            birth_date: participantDob || null,
            email: formData.email,
            phone_number: formData.phone_number,
            address_line1: formData.address_line1,
            address_line2: formData.address_line2,
            city: formData.city,
            state: formData.state,
            zipcode: formData.zipcode,
            is_self: registerSelf,
          },
        ])
        .select("id")
        .single();

      if (dancerError) throw dancerError;

      const { error: regError } = await supabase.from("registrations").insert([
        {
          dancer_id: dancerData.id,
          user_id: user.id,
          program_id: program.id,
          total_amount: program.price,
          status: "pending",
        },
      ]);

      if (regError) throw regError;

      setMessage("✅ Participant successfully added!");
      setFormData({
        first_name: "",
        last_name: "",
        birth_date: "",
        email: user?.email || "",
        phone_number: "",
        address_line1: "",
        address_line2: "",
        city: "",
        state: "",
        zipcode: "",
      });
    } catch (err: any) {
      console.error("Insert dancer error:", err.message);
      setMessage(`❌ Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">
        Registration Forms
      </h2>
      <form
        onSubmit={handleSubmit}
        className="border rounded-xl p-4 bg-gray-50 space-y-4"
      >
        <h3 className="font-semibold text-lg">Participant Information</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-600">First name</label>
            <input
              type="text"
              name="first_name"
              value={formData.first_name}
              onChange={handleChange}
              className="border rounded-lg px-3 py-2 w-full"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600">Last name</label>
            <input
              type="text"
              name="last_name"
              value={formData.last_name}
              onChange={handleChange}
              className="border rounded-lg px-3 py-2 w-full"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600">Date of Birth</label>
            <input
              type="date"
              name="birth_date"
              value={participantDob}
              onChange={handleChange}
              className="border rounded-lg px-3 py-2 w-full"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600">Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="border rounded-lg px-3 py-2 w-full"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600">Phone</label>
            <input
              type="tel"
              name="phone_number"
              value={formData.phone_number}
              onChange={handleChange}
              className="border rounded-lg px-3 py-2 w-full"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm text-gray-600">Address</label>
            <input
              type="text"
              name="address_line1"
              placeholder="Street address"
              value={formData.address_line1}
              onChange={handleChange}
              className="border rounded-lg px-3 py-2 w-full mb-2"
            />
            <input
              type="text"
              name="address_line2"
              placeholder="Address line 2 (optional)"
              value={formData.address_line2}
              onChange={handleChange}
              className="border rounded-lg px-3 py-2 w-full"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600">City</label>
            <input
              type="text"
              name="city"
              value={formData.city}
              onChange={handleChange}
              className="border rounded-lg px-3 py-2 w-full"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600">State</label>
            <select
              name="state"
              value={formData.state}
              onChange={handleChange}
              className="border rounded-lg px-3 py-2 w-full"
            >
              <option value="">Select one</option>
              <option value="CA">CA</option>
              <option value="NY">NY</option>
              <option value="TX">NC</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-600">ZIP</label>
            <input
              type="text"
              name="zipcode"
              value={formData.zipcode}
              onChange={handleChange}
              className="border rounded-lg px-3 py-2 w-full"
            />
          </div>
        </div>

        <button
          type="submit"
          className="mt-6 bg-blue-600 text-white rounded-lg px-6 py-2 font-semibold hover:bg-blue-700 disabled:opacity-60"
          disabled={loading}
          //   onClick={() => RegisterDancerForProgram(dancerId)}
        >
          {loading ? "Saving..." : "Save Participant"}
        </button>

        {message && (
          <p className="mt-3 text-sm text-center text-gray-700">{message}</p>
        )}
      </form>
    </section>
  );
}
