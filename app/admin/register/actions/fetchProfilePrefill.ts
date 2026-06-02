"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/requireAdmin";
import type { ProfileFieldKey } from "@/types";

/**
 * Meeting-plan #16: auto-populate the admin manual-reg Questions step from a
 * selected dancer/family's saved profile. Mirrors the parent-facing seeding in
 * `app/(user-facing)/register/form/page.tsx` (profileMap + address block), but
 * resolves the data server-side from the admin-selected family/dancer instead
 * of the logged-in user. Replicated in-zone on purpose — see CLAUDE.md scope.
 */

export type ProfileAddress = {
  street: string;
  line2: string;
  city: string;
  state: string;
  zip: string;
};

export type ProfilePrefill = {
  /** Single-field profile mappings, keyed exactly like the public flow. */
  profileMap: Partial<Record<ProfileFieldKey, string>>;
  /** Multi-field parent address for `inputType: "address"` questions. */
  address: ProfileAddress | null;
};

const EMPTY: ProfilePrefill = { profileMap: {}, address: null };

export async function fetchProfilePrefill(args: {
  familyId: string | null;
  /** Existing dancer being registered (null for a brand-new dancer). */
  dancerId: string | null;
}): Promise<ProfilePrefill> {
  await requireAdmin();
  const { familyId, dancerId } = args;
  if (!familyId) return EMPTY;

  const supabase = await createClient();

  const [{ data: userRows }, { data: contactRows }, dancerRes] = await Promise.all([
    supabase
      .from("users")
      .select(
        "id, first_name, last_name, email, phone_number, address_line1, address_line2, city, state, zipcode, is_primary_parent",
      )
      .eq("family_id", familyId),
    supabase
      .from("family_contacts")
      .select("type, first_name, last_name, phone, email, relationship")
      .eq("family_id", familyId),
    dancerId
      ? supabase
          .from("dancers")
          .select(
            "first_name, last_name, birth_date, grade, school, secondary_email, phone_number",
          )
          .eq("id", dancerId)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  const users = (userRows ?? []) as Array<Record<string, unknown>>;
  const parent =
    users.find((u) => u.is_primary_parent) ?? users[0] ?? null;
  const contacts = (contactRows ?? []) as Array<Record<string, unknown>>;
  const dancer = (dancerRes as { data: Record<string, unknown> | null }).data;

  const alternateParent = contacts.find((c) => c.type === "alternate_parent") ?? null;
  const caregiver = contacts.find((c) => c.type === "caregiver") ?? null;
  const emergencyContact = contacts.find((c) => c.type === "emergency_contact") ?? null;

  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() ? v : undefined;

  const profileMap: Partial<Record<ProfileFieldKey, string>> = {};
  const put = (key: ProfileFieldKey, value: unknown) => {
    const v = str(value);
    if (v) profileMap[key] = v;
  };

  // Dancer / student
  put("dancer_first_name", dancer?.first_name);
  put("dancer_last_name", dancer?.last_name);
  put("dancer_birth_date", dancer?.birth_date);
  put("dancer_grade", dancer?.grade);
  put("dancer_school", dancer?.school);
  put("dancer_email", dancer?.secondary_email);
  put("dancer_phone", dancer?.phone_number);
  // Primary parent
  put("parent_first_name", parent?.first_name);
  put("parent_last_name", parent?.last_name);
  put("parent_email", parent?.email);
  put("parent_phone", parent?.phone_number);
  put("parent_address_line1", parent?.address_line1);
  put("parent_address_line2", parent?.address_line2);
  put("parent_city", parent?.city);
  put("parent_state", parent?.state);
  put("parent_zipcode", parent?.zipcode);
  // Alternate parent
  put("alt_parent_first_name", alternateParent?.first_name);
  put("alt_parent_last_name", alternateParent?.last_name);
  put("alt_parent_phone", alternateParent?.phone);
  put("alt_parent_email", alternateParent?.email);
  put("alt_parent_relationship", alternateParent?.relationship);
  // Caregiver
  put("caregiver_first_name", caregiver?.first_name);
  put("caregiver_last_name", caregiver?.last_name);
  put("caregiver_phone", caregiver?.phone);
  put("caregiver_email", caregiver?.email);
  put("caregiver_relationship", caregiver?.relationship);
  // Emergency contact
  put("emergency_contact_first_name", emergencyContact?.first_name);
  put("emergency_contact_last_name", emergencyContact?.last_name);
  put("emergency_contact_phone", emergencyContact?.phone);
  put("emergency_contact_email", emergencyContact?.email);
  put("emergency_contact_relationship", emergencyContact?.relationship);

  const address: ProfileAddress = {
    street: str(parent?.address_line1) ?? "",
    line2: str(parent?.address_line2) ?? "",
    city: str(parent?.city) ?? "",
    state: str(parent?.state) ?? "",
    zip: str(parent?.zipcode) ?? "",
  };
  const hasAddress =
    Boolean(address.street || address.city || address.state || address.zip);

  return { profileMap, address: hasAddress ? address : null };
}
