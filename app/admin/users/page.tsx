"use client";

import { getUsers } from "@/queries/admin";
import { User } from "@/types";
import { createClient } from "@/utils/supabase/client";
import { useEffect, useState } from "react";

export default function UsersAdmin() {
  const supabase = createClient();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const data = await getUsers();
      setUsers(data || []);
      setLoading(false);
    })();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this user?")) return;

    setDeletingId(id);

    const { error } = await supabase.from("users").delete().eq("id", id);

    setDeletingId(null);

    if (error) {
      alert("Failed to delete user.");
      return;
    }

    setUsers((prev) => prev.filter((u) => u.id !== id));
  };

  return (
    <main className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      {/* ============================================================
          Header
      ============================================================ */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage parent and admin accounts.
          </p>
        </div>

        <button
          className="inline-flex items-center px-5 py-2.5 rounded-2xl text-sm font-medium
                     bg-indigo-600 text-white hover:bg-indigo-700 transition"
        >
          + Add User
        </button>
      </header>

      {/* ============================================================
          Content
      ============================================================ */}
      {loading ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-gray-500">
          Loading users...
        </div>
      ) : users.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-10 text-center text-gray-500">
          No users found.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            {/* Header */}
            <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wide text-gray-600">
              <tr>
                <th className="px-6 py-4 text-left font-medium">Name</th>
                <th className="px-6 py-4 text-left font-medium">Phone</th>
                <th className="px-6 py-4 text-left font-medium">Email</th>
                <th className="px-6 py-4 text-left font-medium">Primary</th>
                <th className="px-6 py-4 text-right font-medium">Actions</th>
              </tr>
            </thead>

            {/* Body */}
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4 font-medium text-gray-900">
                    {user.first_name} {user.last_name}
                  </td>

                  <td className="px-6 py-4 text-gray-600">
                    {user.phone_number || "—"}
                  </td>

                  <td className="px-6 py-4 text-gray-600">
                    {user.email || "—"}
                  </td>

                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${
                        user.is_primary_parent
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {user.is_primary_parent ? "Yes" : "No"}
                    </span>
                  </td>

                  <td className="px-6 py-4 text-right space-x-3">
                    <button
                      className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-medium
                                 bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
                      onClick={() => alert(`Edit user ${user.first_name}`)}
                    >
                      Edit
                    </button>

                    <button
                      disabled={deletingId === user.id}
                      className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-medium
                                 bg-red-50 text-red-600 hover:bg-red-100 transition
                                 disabled:opacity-50"
                      onClick={() => handleDelete(user.id)}
                    >
                      {deletingId === user.id ? "Deleting..." : "Delete"}
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
