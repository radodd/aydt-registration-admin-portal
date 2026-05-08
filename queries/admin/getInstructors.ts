import { createClient } from "@/utils/supabase/client";

export interface InstructorOption {
  id: string;
  fullName: string;
  email: string;
}

/** Active users with role = 'instructor', sorted by name. */
export async function getInstructors(): Promise<InstructorOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, first_name, last_name, display_name, email")
    .eq("role", "instructor")
    .eq("status", "active")
    .order("first_name", { ascending: true });
  if (error) {
    console.error("getInstructors:", error.message);
    return [];
  }
  return (data ?? []).map((u) => {
    const display = (u.display_name as string | null)?.trim();
    const fullName =
      display && display.length > 0
        ? display
        : `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
    return { id: u.id as string, fullName, email: (u.email as string) ?? "" };
  });
}
