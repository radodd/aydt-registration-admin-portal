"use server";

import { createClient } from "@/utils/supabase/server";

export interface UpdateUserProfileInput {
  first_name: string;
  last_name: string;
  phone_number: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zipcode: string;
}

export async function updateUserProfile(
  input: UpdateUserProfileInput,
): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("users")
    .update({
      first_name: input.first_name,
      last_name: input.last_name,
      phone_number: input.phone_number,
      address_line1: input.address_line1 || null,
      address_line2: input.address_line2 || null,
      city: input.city || null,
      state: input.state || null,
      zipcode: input.zipcode || null,
    })
    .eq("id", authUser.id);

  if (error) throw new Error(error.message);
}
