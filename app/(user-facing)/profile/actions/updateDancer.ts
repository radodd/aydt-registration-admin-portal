"use server";

import { createClient } from "@/utils/supabase/server";

export interface UpdateDancerInput {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
}

export async function updateDancer(input: UpdateDancerInput): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) throw new Error("Not authenticated");

  // Verify the dancer belongs to the authenticated user's family
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
    })
    .eq("id", input.id)
    .eq("family_id", userRow.family_id);

  if (error) throw new Error(error.message);
}
