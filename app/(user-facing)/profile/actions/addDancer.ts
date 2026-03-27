"use server";

import { createClient } from "@/utils/supabase/server";

export interface AddDancerInput {
  first_name: string;
  last_name: string;
  birth_date?: string;
  grade?: string;
}

export interface AddDancerResult {
  dancerId?: string;
  error?: string;
}

export async function addDancer(input: AddDancerInput): Promise<AddDancerResult> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return { error: "Not authenticated" };

  // Resolve family_id server-side — never trust a client-supplied value
  const { data: userRow } = await supabase
    .from("users")
    .select("family_id")
    .eq("id", authUser.id)
    .single();

  if (!userRow?.family_id) return { error: "Family not found" };

  const { data, error } = await supabase
    .from("dancers")
    .insert({
      first_name: input.first_name,
      last_name: input.last_name,
      birth_date: input.birth_date || null,
      grade: input.grade || null,
      family_id: userRow.family_id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  return { dancerId: data.id };
}
