"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/requireAdmin";

export type SemesterOption = {
  id: string;
  name: string;
  status: string;
};

export async function fetchActiveSemesters(): Promise<SemesterOption[]> {
  await requireAdmin();
  const supabase = await createClient();
  // Only published semesters are registerable from the admin flow — drafts are
  // not yet open and should not appear in the register picker.
  const { data } = await supabase
    .from("semesters")
    .select("id, name, status")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(20);

  return (data ?? []).map((s: any) => ({
    id: s.id as string,
    name: s.name as string,
    status: s.status as string,
  }));
}
