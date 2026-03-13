"use server";

import { createClient } from "@/utils/supabase/server";

export type FamilyPersonOption = {
  id: string;
  /** "dancer" = record in dancers table; "user" = record in users table (parent) */
  type: "dancer" | "user";
  firstName: string;
  lastName: string;
  birthDate: string | null;
  gender: string | null;
  grade: string | null;
  isPrimaryParent: boolean;
  /** Display label: "Primary parent", "Secondary parent", "Child / Other person" */
  relationLabel: string;
};

export type FamilyDetails = {
  id: string;
  familyName: string | null;
  phone: string | null;
  primaryParentId: string | null;
  members: FamilyPersonOption[];
};

export async function fetchFamilyMembers(
  familyId: string
): Promise<FamilyDetails | null> {
  if (!familyId) return null;
  const supabase = await createClient();

  const { data: family } = await supabase
    .from("families")
    .select(
      "id, family_name, users:users!family_id(id, first_name, last_name, phone_number, is_primary_parent), dancers:dancers!family_id(id, first_name, last_name, birth_date, gender, grade)"
    )
    .eq("id", familyId)
    .single();

  if (!family) return null;

  const f = family as any;
  const users: any[] = Array.isArray(f.users)
    ? f.users.filter(Boolean)
    : f.users
    ? [f.users]
    : [];
  const dancers: any[] = Array.isArray(f.dancers)
    ? f.dancers.filter(Boolean)
    : f.dancers
    ? [f.dancers]
    : [];

  const primaryParent = users.find((u: any) => u.is_primary_parent) ?? users[0] ?? null;
  const phone = primaryParent?.phone_number ?? null;

  const members: FamilyPersonOption[] = [
    // Parents first
    ...users.map((u: any) => ({
      id: u.id as string,
      type: "user" as const,
      firstName: u.first_name as string,
      lastName: u.last_name as string,
      birthDate: null,
      gender: null,
      grade: null,
      isPrimaryParent: u.is_primary_parent as boolean,
      relationLabel: u.is_primary_parent ? "Primary parent" : "Secondary parent",
    })),
    // Dancers (children/adults)
    ...dancers.map((d: any) => ({
      id: d.id as string,
      type: "dancer" as const,
      firstName: d.first_name as string,
      lastName: d.last_name as string,
      birthDate: d.birth_date as string | null,
      gender: d.gender as string | null,
      grade: d.grade as string | null,
      isPrimaryParent: false,
      relationLabel: "Child / Other person",
    })),
  ];

  return {
    id: f.id as string,
    familyName: f.family_name as string | null,
    phone,
    primaryParentId: primaryParent?.id ?? null,
    members,
  };
}
