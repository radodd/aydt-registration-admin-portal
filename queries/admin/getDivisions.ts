import { createClient } from "@/utils/supabase/client";
import type { Division } from "@/types";

export async function getDivisions(): Promise<Division[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("divisions")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("getDivisions:", error.message);
    return [];
  }
  return (data ?? []) as Division[];
}
