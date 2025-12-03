"use client";

import { User } from "@/types";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function ListUsers() {
  const router = useRouter();
  const supabase = createClient();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      const { data: users, error } = await supabase
        .from("users")
        .select(
          `
            id,
            first_name,
            last_name,
            email,
            phone_number,
            is_primary_parent,
            created_at
          `
        )
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Failed to load users.", error.message);
      } else {
        setUsers(users || []);
      }
      setLoading(false);
    })();
  }, [supabase]);

  const handleDelete = async (id: string) => {
    if (!confirm("are you sure you want to delete this user?")) return;

    const { error } = await supabase.from("users").delete().eq("id", id);

    if (error) {
      alert("Failed to delete this user." + error.message);
      setUsers((prev) => prev.filter((p) => p.id !== id));
    }
  };

  return (
    <main className="max-w-6xl mx-auto p-6 text-black">
      {loading ? (
        <p>Loading users...</p>
      ) : (
        <>
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Users</h1>
            <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
              + Add User
            </button>
          </div>

          {users.length === 0 ? (
            <p className="text-gray-600 text-center mt-10">No dancers found.</p>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-gray-200 text-left text-gray-700">
                  <tr>
                    <th className="p-2">Name</th>
                    <th className="p-2">Phone</th>
                    <th className="p-2">Email</th>
                    <th className="p-2">Primary Parent</th>
                    <th className="p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-t hover:bg-gray-50 transition"
                    >
                      <td className="p-2 font-medium">
                        {user.first_name} {user.last_name}
                      </td>
                      <td className="p-2">{user.phone_number || "—"}</td>
                      <td className="p-2">{user.email || "—"}</td>
                      <td className="p-2 text-sm text-gray-700">
                        {user.is_primary_parent ? "Yes" : "No"}
                      </td>

                      <td className="p-2 flex gap-3">
                        <button
                          className="text-blue-600 hover:underline"
                          onClick={() => alert(`Edit user ${user.first_name}`)}
                        >
                          Edit
                        </button>
                        <button
                          className="text-red-600 hover:underline"
                          onClick={() => handleDelete(user.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
