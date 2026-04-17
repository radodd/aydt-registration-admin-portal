"use server";

import { createClient } from "@/utils/supabase/server";
import type { FamilyContactType } from "@/types";

export interface UpsertFamilyContactInput {
  id?: string;                      // omit for INSERT, provide for UPDATE
  type: FamilyContactType;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  relationship?: string;
  is_authorized_pickup?: boolean;
  notes?: string;
}

export interface UpsertFamilyContactResult {
  contactId?: string;
  error?: string;
}

export async function upsertFamilyContact(
  input: UpsertFamilyContactInput,
): Promise<UpsertFamilyContactResult> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return { error: "Not authenticated" };

  const { data: userRow } = await supabase
    .from("users")
    .select("family_id")
    .eq("id", authUser.id)
    .single();

  if (!userRow?.family_id) return { error: "Family not found" };

  const payload = {
    family_id: userRow.family_id,
    type: input.type,
    first_name: input.first_name?.trim() || null,
    last_name: input.last_name?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    relationship: input.relationship?.trim() || null,
    is_authorized_pickup: input.is_authorized_pickup ?? false,
    notes: input.notes?.trim() || null,
  };

  if (input.id) {
    // UPDATE — verify ownership via RLS
    const { data, error } = await supabase
      .from("family_contacts")
      .update(payload)
      .eq("id", input.id)
      .select("id")
      .single();

    if (error) return { error: error.message };
    return { contactId: data.id };
  } else {
    // INSERT
    const { data, error } = await supabase
      .from("family_contacts")
      .insert(payload)
      .select("id")
      .single();

    if (error) return { error: error.message };
    return { contactId: data.id };
  }
}

export async function deleteFamilyContact(
  contactId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("family_contacts")
    .delete()
    .eq("id", contactId);

  if (error) return { error: error.message };
  return {};
}
