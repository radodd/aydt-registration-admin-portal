"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/requireAdmin";

export type DancerSearchResult = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  gender: string | null;
  grade: string | null;
  familyId: string | null;
  familyName: string | null;
  primaryParentId: string | null;
  primaryParentName: string | null;
};

export type FamilySearchResult = {
  id: string;
  familyName: string | null;
  primaryParentName: string | null;
};

export async function searchDancersByCriteria(params: {
  firstName?: string;
  lastName?: string;
  birthDate?: string;
}): Promise<DancerSearchResult[]> {
  await requireAdmin();
  const { firstName, lastName, birthDate } = params;
  const hasAny = (firstName?.trim() ?? "").length > 0 ||
    (lastName?.trim() ?? "").length > 0 ||
    (birthDate?.trim() ?? "").length > 0;
  if (!hasAny) return [];

  const supabase = await createClient();

  let builder = supabase
    .from("dancers")
    .select(
      "id, first_name, last_name, birth_date, gender, grade, family_id, families:families!family_id(id, family_name, users:users!family_id(id, first_name, last_name, is_primary_parent))"
    );

  if (firstName?.trim()) {
    builder = (builder as any).ilike("first_name", `%${firstName.trim()}%`);
  }
  if (lastName?.trim()) {
    builder = (builder as any).ilike("last_name", `%${lastName.trim()}%`);
  }
  if (birthDate?.trim()) {
    builder = (builder as any).eq("birth_date", birthDate.trim());
  }

  const { data } = await (builder as any).limit(30);

  return (data ?? []).map((d: any) => {
    const fam = Array.isArray(d.families) ? d.families[0] : d.families;
    const users: any[] = fam
      ? Array.isArray(fam.users)
        ? fam.users.filter(Boolean)
        : [fam.users].filter(Boolean)
      : [];
    const primary = users.find((u) => u?.is_primary_parent) ?? users[0] ?? null;
    return {
      id: d.id as string,
      firstName: d.first_name as string,
      lastName: d.last_name as string,
      birthDate: d.birth_date as string | null,
      gender: d.gender as string | null,
      grade: d.grade as string | null,
      familyId: d.family_id as string | null,
      familyName: fam?.family_name ?? null,
      primaryParentId: primary?.id ?? null,
      primaryParentName: primary ? `${primary.first_name} ${primary.last_name}` : null,
    };
  });
}

// Legacy single-query search kept for backwards compatibility
export async function searchDancers(query: string): Promise<DancerSearchResult[]> {
  await requireAdmin();
  const q = query.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();

  const parts = q.split(/\s+/);

  let builder = supabase
    .from("dancers")
    .select(
      "id, first_name, last_name, birth_date, gender, grade, family_id, families:families!family_id(id, family_name, users:users!family_id(id, first_name, last_name, is_primary_parent))"
    );

  if (parts.length >= 2) {
    builder = (builder as any)
      .ilike("first_name", `%${parts[0]}%`)
      .ilike("last_name", `%${parts[1]}%`);
  } else {
    builder = (builder as any).or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`);
  }

  const { data } = await (builder as any).limit(20);

  return (data ?? []).map((d: any) => {
    const fam = Array.isArray(d.families) ? d.families[0] : d.families;
    const users: any[] = fam
      ? Array.isArray(fam.users)
        ? fam.users.filter(Boolean)
        : [fam.users].filter(Boolean)
      : [];
    const primary = users.find((u) => u?.is_primary_parent) ?? users[0] ?? null;

    return {
      id: d.id as string,
      firstName: d.first_name as string,
      lastName: d.last_name as string,
      birthDate: d.birth_date as string | null,
      gender: d.gender as string | null,
      grade: d.grade as string | null,
      familyId: d.family_id as string | null,
      familyName: fam?.family_name ?? null,
      primaryParentId: primary?.id ?? null,
      primaryParentName: primary ? `${primary.first_name} ${primary.last_name}` : null,
    };
  });
}

export async function searchFamilies(query: string): Promise<FamilySearchResult[]> {
  await requireAdmin();
  const q = query.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();

  const { data } = await supabase
    .from("families")
    .select("id, family_name, users:users!family_id(id, first_name, last_name, is_primary_parent)")
    .ilike("family_name", `%${q}%`)
    .limit(10);

  return (data ?? []).map((f: any) => {
    const users: any[] = Array.isArray(f.users)
      ? f.users.filter(Boolean)
      : [f.users].filter(Boolean);
    const primary = users.find((u) => u?.is_primary_parent) ?? users[0] ?? null;
    return {
      id: f.id as string,
      familyName: f.family_name as string | null,
      primaryParentName: primary ? `${primary.first_name} ${primary.last_name}` : null,
    };
  });
}
