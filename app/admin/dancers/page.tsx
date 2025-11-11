"use client";

import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function ListDancers() {
  const router = useRouter();
  const supabase = createClient();

  const [dancers, setDancers] = useState<any>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      const { data: dancers, error } = await supabase
        .from("dancers")
        .select(
          `
            id,
            first_name,
            last_name,
            email,
            phone_number,
            birth_date,
            grade,
            city,
            state,
            is_self,
            created_at,
            users (
              first_name,
              last_name,
              email
            )
          `
        )
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Failed to load dancers.", error.message);
      } else {
        setDancers(dancers || []);
      }
      setLoading(false);
    })();
  }, [supabase]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this dancer?")) return;

    const { error } = await supabase.from("dancers").delete().eq("id", id);

    if (error) {
      alert("Failed to delete this dancer." + error.message);
    } else {
      alert("Dancer deleted.");
      setDancers((prev: any) => prev.filter((p: any) => p.id !== id));
    }
  };

  return (
    <main className="max-w-6xl mx-auto p-6 text-black">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Dancers</h1>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          + Add Dancer
        </button>
      </div>

      {dancers.length === 0 ? (
        <p className="text-gray-600 text-center mt-10">No dancers found yet.</p>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-200 text-left text-gray-700">
              <tr>
                <th className="p-2">Name</th>
                <th className="p-2">Birth Date</th>
                <th className="p-2">Grade</th>
                <th className="p-2">City</th>
                <th className="p-2">State</th>
                <th className="p-2">Phone</th>
                <th className="p-2">Email</th>
                <th className="p-2">Managed By</th>
                <th className="p-2 text-center">Is Self?</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {dancers.map((dancer: any) => (
                <tr
                  key={dancer.id}
                  className="border-t hover:bg-gray-50 transition"
                >
                  <td className="p-2 font-medium">
                    {dancer.first_name} {dancer.last_name}
                  </td>
                  <td className="p-2">
                    {dancer.birth_date
                      ? new Date(dancer.birth_date).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="p-2">{dancer.grade || "—"}</td>
                  <td className="p-2">{dancer.city || "—"}</td>
                  <td className="p-2">{dancer.state || "—"}</td>
                  <td className="p-2">{dancer.phone_number || "—"}</td>
                  <td className="p-2">{dancer.email || "—"}</td>
                  <td className="p-2 text-sm text-gray-700">
                    {dancer.users
                      ? `${dancer.users.first_name} ${dancer.users.last_name}`
                      : "—"}
                  </td>
                  <td className="p-2 text-center">
                    {dancer.is_self ? "✅" : "❌"}
                  </td>
                  <td className="p-2 flex gap-3">
                    <button
                      className="text-blue-600 hover:underline"
                      onClick={() => alert(`Edit dancer ${dancer.first_name}`)}
                    >
                      Edit
                    </button>
                    <button
                      className="text-red-600 hover:underline"
                      onClick={() => handleDelete(dancer.id)}
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
    </main>
  );
}
