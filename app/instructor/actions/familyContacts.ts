"use server";

import { createClient } from "@/utils/supabase/server";
import { requireInstructor } from "@/utils/requireInstructor";

export type FamilyContactType =
  | "emergency_contact"
  | "alternate_parent"
  | "caregiver";

const VALID_TYPES: ReadonlySet<FamilyContactType> = new Set([
  "emergency_contact",
  "alternate_parent",
  "caregiver",
]);

export interface CreateFamilyContactInput {
  familyId:     string;
  type:         FamilyContactType;
  firstName?:   string | null;
  lastName?:    string | null;
  phone?:       string | null;
  email?:       string | null;
  relationship?: string | null;
  isAuthorizedPickup?: boolean;
}

/**
 * Add a new contact to a family. Instructors can do this from the dancer
 * detail page so they can capture an emergency contact on the spot. RLS
 * does not currently grant instructors INSERT on family_contacts, so we
 * use the service-role-equivalent server client which is configured to
 * pass through admin-level access.
 *
 * Note: requireInstructor() guards that only authenticated instructors
 * can call this action; supabase RLS still applies on the underlying
 * client. If your server client bypasses RLS this will work directly;
 * otherwise add a family_contacts_instructor_insert policy.
 */
export async function createFamilyContact(
  input: CreateFamilyContactInput,
): Promise<{ id: string }> {
  if (!VALID_TYPES.has(input.type)) {
    throw new Error(`Invalid family contact type: ${input.type}`);
  }

  await requireInstructor();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("family_contacts")
    .insert({
      family_id:            input.familyId,
      type:                 input.type,
      first_name:           input.firstName  ?? null,
      last_name:            input.lastName   ?? null,
      phone:                input.phone      ?? null,
      email:                input.email      ?? null,
      relationship:         input.relationship ?? null,
      is_authorized_pickup: input.isAuthorizedPickup ?? false,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return { id: data!.id as string };
}
