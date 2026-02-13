"use client";

import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface ListSessionsProps {
  sessions: any[];
  setSessions: React.Dispatch<React.SetStateAction<any[]>>;
}

export default function ListSessions({
  sessions,
  setSessions,
}: ListSessionsProps) {
  const router = useRouter();
  const supabase = createClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this session?")) return;

    setDeletingId(id);

    const { error } = await supabase.from("sessions").delete().eq("id", id);

    setDeletingId(null);

    if (error) {
      alert("Failed to delete session.");
      return;
    }

    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        {/* Header */}
        <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 uppercase text-xs tracking-wide">
          <tr>
            <th className="px-6 py-4 text-left font-medium">Title</th>
            <th className="px-6 py-4 text-left font-medium">Category</th>
            <th className="px-6 py-4 text-left font-medium">Type</th>
            <th className="px-6 py-4 text-left font-medium">Dates</th>
            <th className="px-6 py-4 text-left font-medium">Price</th>
            <th className="px-6 py-4 text-left font-medium">Status</th>
            <th className="px-6 py-4 text-right font-medium">Actions</th>
          </tr>
        </thead>

        {/* Body */}
        <tbody className="divide-y divide-gray-100">
          {sessions.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-6 py-10 text-center text-gray-500">
                No sessions found.
              </td>
            </tr>
          ) : (
            sessions.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50 transition">
                <td className="px-6 py-4 font-medium text-gray-900">
                  {s.title}
                </td>

                <td className="px-6 py-4 text-gray-600">{s.category}</td>

                <td className="px-6 py-4 text-gray-600">{s.type}</td>

                <td className="px-6 py-4 text-gray-600">
                  {s.start_date} – {s.end_date}
                </td>

                <td className="px-6 py-4 text-gray-900 font-medium">
                  ${s.price}
                </td>

                {/* Status Badge */}
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${
                      s.is_active
                        ? "bg-indigo-100 text-indigo-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {s.is_active ? "Active" : "Inactive"}
                  </span>
                </td>

                {/* Actions */}
                <td className="px-6 py-4 text-right space-x-3">
                  <button
                    onClick={() => router.push(`/admin/sessions/edit/${s.id}`)}
                    className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-medium
                               bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => handleDelete(s.id)}
                    disabled={deletingId === s.id}
                    className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-medium
                               bg-red-50 text-red-600 hover:bg-red-100 transition
                               disabled:opacity-50"
                  >
                    {deletingId === s.id ? "Deleting..." : "Delete"}
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
