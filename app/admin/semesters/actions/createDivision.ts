"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/requireAdmin";
import type { Division } from "@/types";

function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function createDivision(input: {
  label: string;
  isDropIn?: boolean;
  id?: string;
}): Promise<Division> {
  await requireAdmin();
  const supabase = await createClient();

  const label = input.label.trim();
  if (!label) throw new Error("Division label is required");

  const id = (input.id?.trim() || slugify(label));
  if (!id) throw new Error("Could not derive a valid division id from label");

  const { data: existing } = await supabase
    .from("divisions")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (existing) throw new Error(`Division "${id}" already exists`);

  const { data: maxRow } = await supabase
    .from("divisions")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = (maxRow?.sort_order ?? 0) + 10;

  const { data, error } = await supabase
    .from("divisions")
    .insert({
      id,
      label,
      sort_order: nextSort,
      is_drop_in: input.isDropIn ?? false,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as Division;
}
