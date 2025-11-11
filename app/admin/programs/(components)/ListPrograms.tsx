import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

export default function ListPrograms({ programs, setPrograms }: any) {
  const router = useRouter();
  const supabase = createClient();

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this program?")) return;

    const { error } = await supabase.from("programs").delete().eq("id", id);

    if (error) {
      alert("Failed to delete this program." + error.message);
    } else {
      alert("Program deleted.");
      setPrograms((prev: any) => prev.filter((p: any) => p.id !== id));
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
        {programs.map((p: any) => (
          <tr key={p.id} className="border-b hover:bg-gray-50">
            <td className="p-2 font-medium">{p.title}</td>
            <td className="p-2">{p.category}</td>
            <td className="p-2">{p.type}</td>
            <td className="p-2">
              {p.start_date} → {p.end_date}
            </td>
            <td className="p-2">${p.price}</td>
            <td className="p-2">{p.is_active ? "✅" : "❌"}</td>
            <td className="p-2 flex gap-3">
              <button
                onClick={() => router.push(`/admin/programs/edit/${p.id}`)}
                className="text-blue-600 hover:underline"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(p.id)}
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
