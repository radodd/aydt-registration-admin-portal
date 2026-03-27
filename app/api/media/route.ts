import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/utils/requireAdmin";
import { createAdminClient } from "@/utils/supabase/admin";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { searchParams } = req.nextUrl;

  const search = searchParams.get("search") ?? "";
  const folder = searchParams.get("folder") ?? "";
  const limit = Math.min(Number(searchParams.get("limit") ?? 60), 100);
  const offset = Number(searchParams.get("offset") ?? 0);

  let query = supabase
    .from("media_images")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.ilike("display_name", `%${search}%`);
  }

  if (folder) {
    query = query.eq("folder", folder);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ images: data ?? [] });
}
