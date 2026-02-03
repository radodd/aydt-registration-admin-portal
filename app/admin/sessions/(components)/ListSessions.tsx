import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

export default function ListSessions({ sessions, setSessions }: any) {
  const router = useRouter();
  const supabase = createClient();

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this session?")) return;

    const { error } = await supabase.from("sessions").delete().eq("id", id);

    if (error) {
      alert("Failed to delete this session." + error.message);
    } else {
      alert("Session deleted.");
      setSessions((prev: any) => prev.filter((s: any) => s.id !== id));
    }
  };

  return (
    <table className="w-full border text-left">
      <thead className="bg-gray-200">
        <tr>
          <th className="p-2">Title</th>
          <th className="p-2">Category</th>
          <th className="p-2">Type</th>
          <th className="p-2">Dates</th>
          <th className="p-2">Price</th>
          <th className="p-2">Status</th>
          <th className="p-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        {sessions.map((s: any) => (
          <tr key={s.id} className="border-b hover:bg-gray-50">
            <td className="p-2 font-medium">{s.title}</td>
            <td className="p-2">{s.category}</td>
            <td className="p-2">{s.type}</td>
            <td className="p-2">
              {s.start_date} → {s.end_date}
            </td>
            <td className="p-2">${s.price}</td>
            <td className="p-2">{s.is_active ? "✅" : "❌"}</td>
            <td className="p-2 flex gap-3">
              <button
                onClick={() => router.push(`/admin/sessions/edit/${s.id}`)}
                className="text-blue-600 hover:underline"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(s.id)}
                className="text-red-600 hover:underline"
              >
                Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
