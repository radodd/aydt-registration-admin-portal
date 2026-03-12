import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const supabase = serviceClient();

  // Block deletion if folder contains images
  const { count, error: countError } = await supabase
    .from("media_images")
    .select("*", { count: "exact", head: true })
    .eq("folder", name);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  if (count && count > 0) {
    return NextResponse.json(
      { error: `Folder contains ${count} image${count === 1 ? "" : "s"}. Move or delete them first.` },
      { status: 409 },
    );
  }

  const { error } = await supabase
    .from("media_folders")
    .delete()
    .eq("name", name);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
