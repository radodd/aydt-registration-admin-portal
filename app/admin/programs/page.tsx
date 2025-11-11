"use client";

import { createClient } from "@/utils/supabase/client";
import { useEffect, useState } from "react";
import ListPrograms from "./(components)/ListPrograms";
import CreateProgram from "./(components)/CreateProgram";

export default function AdminProgramsPage() {
  const supabase = createClient();
  const [programs, setPrograms] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("programs")
        .select("*")
        .order("start_date", { ascending: false });

      if (!error) {
        setPrograms(data);
      }
    })();
  }, [supabase]);

  return (
    <div className="text-gray-600">
      <h1 className="text-2xl font-bold mb-6">Manage Programs</h1>
      <button onClick={() => setShowForm((prev) => !prev)}>
        {showForm ? "Cancel" : "+ Add New Program"}
      </button>
      {showForm && <CreateProgram />}
      <ListPrograms programs={programs} setPrograms={setPrograms} />
    </div>
  );
}
