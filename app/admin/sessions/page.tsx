"use client";

import { createClient } from "@/utils/supabase/client";
import { useEffect, useState } from "react";
import ListSessions from "./(components)/ListSessions";
import CreateSession from "./(components)/CreateSession";
import { getSessions } from "@/queries/admin";
import { Session } from "@/types";

export default function AdminSessionsPage() {
  const supabase = createClient();
  const [sessions, setSessions] = useState<Session[] | null>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    (async () => {
      const data = await getSessions();

      setSessions(data);
    })();
  }, [supabase]);

  return (
    <div className="text-gray-600">
      <h1 className="text-2xl font-bold mb-6">Manage Sessions</h1>
      <button onClick={() => setShowForm((prev) => !prev)}>
        {showForm ? "Cancel" : "+ Add New Session"}
      </button>
      {showForm && <CreateSession />}
      <ListSessions sessions={sessions} setSessions={setSessions} />
    </div>
  );
}
