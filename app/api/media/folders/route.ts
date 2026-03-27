import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/utils/requireAdmin";
import { createAdminClient } from "@/utils/supabase/admin";

function toSlug(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("media_folders")
    .select("name, label, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ folders: data ?? [] });
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const body = await req.json();
  const label = (typeof body.label === "string" ? body.label : "").trim();

  if (!label) {
    return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
  }

  const name = toSlug(label);

  if (!name) {
    return NextResponse.json({ error: "Invalid folder name" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("media_folders")
    .insert({ name, label })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A folder with that name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ folder: data }, { status: 201 });
}
