import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: NextRequest) {
  const supabase = serviceClient();
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
