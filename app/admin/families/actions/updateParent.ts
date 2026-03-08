"use server";

import { createClient } from "@/utils/supabase/server";

export interface UpdateParentInput {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export async function updateParent(input: UpdateParentInput): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("users")
    .update({
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      phone_number: input.phone || null,
    })
    .eq("id", input.userId);

  if (error) throw new Error(error.message);
}
