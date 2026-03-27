import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/utils/requireAdmin";
import { createAdminClient } from "@/utils/supabase/admin";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name } = await params;
  const supabase = createAdminClient();

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
