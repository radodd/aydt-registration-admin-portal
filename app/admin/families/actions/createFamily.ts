"use server";

import { createClient } from "@/utils/supabase/server";

export interface CreateFamilyInput {
  familyName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  sendInvite: boolean;
}

export async function createFamily(
  input: CreateFamilyInput,
): Promise<{ familyId: string }> {
  const supabase = await createClient();

  const { data: family, error: familyErr } = await supabase
    .from("families")
    .insert({ family_name: input.familyName })
    .select("id")
    .single();

  if (familyErr || !family) {
    throw new Error(familyErr?.message ?? "Failed to create family");
  }

  const { error: userErr } = await supabase.from("users").insert({
    family_id: family.id,
    first_name: input.firstName,
    last_name: input.lastName,
    email: input.email,
    phone_number: input.phone || null,
    is_primary_parent: true,
    role: "parent",
    status: "active",
  });

  if (userErr) throw new Error(userErr.message);

  // TODO: if input.sendInvite, send welcome/invite email via Resend once auth is set up

  return { familyId: family.id };
}
