"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/requireAdmin";

export interface AddDancerInput {
  familyId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
}

export async function addDancer(input: AddDancerInput): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("dancers").insert({
    family_id: input.familyId,
    first_name: input.firstName,
    last_name: input.lastName,
    birth_date: input.birthDate || null,
    gender: input.gender || null,
    is_self: false,
  });

  if (error) throw new Error(error.message);
}
