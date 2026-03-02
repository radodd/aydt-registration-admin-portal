"use server";

import { createClient } from "@/utils/supabase/server";
import type { NewDancerInput } from "@/lib/schemas/registration";

interface CreateDancerResult {
  dancerId: string | null;
  error: string | null;
}

/**
 * Creates a new dancer record linked to the given family.
 * Called during the participant assignment step when the parent chooses
 * "Add new dancer" rather than selecting an existing one.
 */
export async function createDancer(
  familyId: string,
  input: NewDancerInput,
): Promise<CreateDancerResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("dancers")
    .insert({
      family_id: familyId,
      first_name: input.firstName,
      last_name: input.lastName,
      birth_date: input.dateOfBirth,
      gender: input.gender ?? null,
      is_self: false,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { dancerId: null, error: error?.message ?? "Failed to create dancer" };
  }

  return { dancerId: data.id, error: null };
}
