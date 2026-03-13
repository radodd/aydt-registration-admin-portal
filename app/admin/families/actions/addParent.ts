"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/requireAdmin";

export interface AddParentInput {
  familyId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export async function addParent(input: AddParentInput): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("users").insert({
    family_id: input.familyId,
    first_name: input.firstName,
    last_name: input.lastName,
    email: input.email,
    phone_number: input.phone || null,
    is_primary_parent: false,
    role: "parent",
    status: "active",
  });

  if (error) throw new Error(error.message);
}
