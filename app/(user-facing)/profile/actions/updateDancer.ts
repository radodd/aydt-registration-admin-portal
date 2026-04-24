"use server";

import { createClient } from "@/utils/supabase/server";

export interface UpdateDancerInput {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  grade: string;
  school: string;
  secondary_email?: string;
  phone_number?: string;
}

export async function updateDancer(input: UpdateDancerInput): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) throw new Error("Not authenticated");

  const { data: userRow } = await supabase
    .from("users")
    .select("family_id")
    .eq("id", authUser.id)
    .single();

  if (!userRow?.family_id) throw new Error("Family not found");

  const { error } = await supabase
    .from("dancers")
    .update({
      first_name: input.first_name,
      last_name: input.last_name,
      birth_date: input.birth_date || null,
      grade: input.grade || null,
      secondary_email: input.secondary_email || null,
      phone_number: input.phone_number || null,
      school: input.school || null,
    })
    .eq("id", input.id)
    .eq("family_id", userRow.family_id);

  if (error) throw new Error(error.message);
}
