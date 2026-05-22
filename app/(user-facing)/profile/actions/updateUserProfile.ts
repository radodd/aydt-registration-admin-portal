"use server";

import { createClient } from "@/utils/supabase/server";

export interface UpdateUserProfileInput {
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  phone_number_alt?: string;
  cc_alternate_parent?: boolean;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zipcode?: string;
}

export async function updateUserProfile(
  input: UpdateUserProfileInput,
): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) throw new Error("Not authenticated");

  // Partial update: only touch fields the caller actually provided, so an
  // address-only save can't blank name/phone (and a profile save can't blank
  // the address). Empty strings on nullable columns are normalized to null.
  const updates: Record<string, string | boolean | null> = {};
  if (input.first_name !== undefined) updates.first_name = input.first_name;
  if (input.last_name !== undefined) updates.last_name = input.last_name;
  if (input.phone_number !== undefined)
    updates.phone_number = input.phone_number;
  if (input.phone_number_alt !== undefined)
    updates.phone_number_alt = input.phone_number_alt || null;
  if (input.cc_alternate_parent !== undefined)
    updates.cc_alternate_parent = input.cc_alternate_parent;
  if (input.address_line1 !== undefined)
    updates.address_line1 = input.address_line1 || null;
  if (input.address_line2 !== undefined)
    updates.address_line2 = input.address_line2 || null;
  if (input.city !== undefined) updates.city = input.city || null;
  if (input.state !== undefined) updates.state = input.state || null;
  if (input.zipcode !== undefined) updates.zipcode = input.zipcode || null;

  if (Object.keys(updates).length === 0) return;

  const { error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", authUser.id);

  if (error) throw new Error(error.message);
}
