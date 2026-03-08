"use server";

import { createClient } from "@/utils/supabase/server";

export interface UpdateDancerInput {
  dancerId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
}

export async function updateDancer(input: UpdateDancerInput): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("dancers")
    .update({
      first_name: input.firstName,
      last_name: input.lastName,
      birth_date: input.birthDate || null,
      gender: input.gender || null,
    })
    .eq("id", input.dancerId);

  if (error) throw new Error(error.message);
}
