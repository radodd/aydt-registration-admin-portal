"use client";

import { getDancers } from "@/queries/admin";
import { Dancer } from "@/types";
import { createClient } from "@/utils/supabase/client";
import { useEffect, useState } from "react";

export default function DancersAdmin() {
  const supabase = createClient();

  const [dancers, setDancers] = useState<Dancer[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const data = await getDancers();
      setDancers(data || []);
      setLoading(false);
    })();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this dancer?")) return;

    setDeletingId(id);

    const { error } = await supabase.from("dancers").delete().eq("id", id);

    setDeletingId(null);

    if (error) {
      alert("Failed to delete dancer.");
      return;
    }

    setDancers((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <main className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      {/* ============================================================
          Header
      ============================================================ */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Dancers</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage dancer profiles across families.
          </p>
        </div>

        <button
          className="inline-flex items-center px-5 py-2.5 rounded-2xl text-sm font-medium
                           bg-indigo-600 text-white hover:bg-indigo-700 transition"
        >
          + Add Dancer
        </button>
      </header>

      {/* ============================================================
          Content
      ============================================================ */}
      {loading ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-gray-500">
          Loading dancers...
        </div>
      ) : dancers.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-10 text-center text-gray-500">
          No dancers found.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            {/* Header */}
            <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wide text-gray-600">
              <tr>
                <th className="px-6 py-4 text-left font-medium">Name</th>
                <th className="px-6 py-4 text-left font-medium">Birth Date</th>
                <th className="px-6 py-4 text-left font-medium">Grade</th>
                <th className="px-6 py-4 text-left font-medium">Location</th>
                <th className="px-6 py-4 text-left font-medium">Contact</th>
                <th className="px-6 py-4 text-left font-medium">Managed By</th>
                <th className="px-6 py-4 text-center font-medium">Self</th>
                <th className="px-6 py-4 text-right font-medium">Actions</th>
              </tr>
            </thead>

            {/* Body */}
            <tbody className="divide-y divide-gray-100">
              {dancers.map((dancer) => (
                <tr key={dancer.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4 font-medium text-gray-900">
                    {dancer.first_name} {dancer.last_name}
                  </td>

                  <td className="px-6 py-4 text-gray-600">
                    {dancer.birth_date
                      ? new Date(dancer.birth_date).toLocaleDateString()
                      : "—"}
                  </td>

                  <td className="px-6 py-4 text-gray-600">
                    {dancer.grade || "—"}
                  </td>

                  <td className="px-6 py-4 text-gray-600">
                    {[dancer.city, dancer.state].filter(Boolean).join(", ") ||
                      "—"}
                  </td>

                  <td className="px-6 py-4 text-gray-600">
                    <div>{dancer.phone_number || "—"}</div>
                    <div className="text-xs text-gray-400">
                      {dancer.email || ""}
                    </div>
                  </td>

                  <td className="px-6 py-4 text-gray-600">
                    {Array.isArray(dancer.users) && dancer.users.length > 0
                      ? `${dancer.users[0].first_name} ${dancer.users[0].last_name}`
                      : "—"}
                  </td>

                  <td className="px-6 py-4 text-center">
                    <span
                      className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${
                        dancer.is_self
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {dancer.is_self ? "Yes" : "No"}
                    </span>
                  </td>

                  <td className="px-6 py-4 text-right space-x-3">
                    <button
                      className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-medium
                                 bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
                      onClick={() => alert(`Edit dancer ${dancer.first_name}`)}
                    >
                      Edit
                    </button>

                    <button
                      disabled={deletingId === dancer.id}
                      className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-medium
                                 bg-red-50 text-red-600 hover:bg-red-100 transition
                                 disabled:opacity-50"
                      onClick={() => handleDelete(dancer.id)}
                    >
                      {deletingId === dancer.id ? "Deleting..." : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
