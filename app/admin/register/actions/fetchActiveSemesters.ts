"use server";

import { createClient } from "@/utils/supabase/server";

export type SemesterOption = {
  id: string;
  name: string;
  status: string;
};

export async function fetchActiveSemesters(): Promise<SemesterOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("semesters")
    .select("id, name, status")
    .in("status", ["published", "draft"])
    .order("created_at", { ascending: false })
    .limit(20);

  return (data ?? []).map((s: any) => ({
    id: s.id as string,
    name: s.name as string,
    status: s.status as string,
  }));
}
