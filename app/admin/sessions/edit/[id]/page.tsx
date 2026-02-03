"use client";

import { createClient } from "@/utils/supabase/client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function EditProgramPage() {
  const { id } = useParams();
  const router = useRouter();
  const supabase = createClient();

  const [program, setProgram] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("programs")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.error(error);
      } else {
        setProgram(data);
      }
    })();
  }, [id, supabase]);

  const handleChange = (e: any) => {
    const { name, value } = e.target;
    setProgram((prev: any) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    const { error } = await supabase
      .from("programs")
      .update(program)
      .eq("id", id);

    if (error) {
      alert("Failed to save changes to program." + error.message);
    } else {
      alert("Changes to program saved successfully.");
      router.push("/admin/programs");
    }
  };

  if (!program) return <p className="text-center mt-10">Loading program...</p>;

  return (
    <main className="max-w-3xl mx-auto p-6 text-black">
      <h1 className="text-2xl font-bold mb-4">Edit Program</h1>

      <input
        name="title"
        value={program.title}
        onChange={handleChange}
        className="border rounded-lg px-3 py-2 w-full mb-2"
      />
      <textarea
        name="description"
        value={program.description || ""}
        onChange={handleChange}
        className="border rounded-lg px-3 py-2 w-full mb-2"
      />
      <input
        name="price"
        type="number"
        value={program.price}
        onChange={handleChange}
        className="border rounded-lg px-3 py-2 w-full mb-2"
      />
      <button
        onClick={handleSave}
        className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
      >
        Save Changes
      </button>
    </main>
  );
}
