import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "email-assets";

function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = serviceClient();

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (typeof body.display_name === "string" && body.display_name.trim()) {
    updates.display_name = body.display_name.trim();
  }
  if (typeof body.folder === "string") {
    updates.folder = body.folder;
  }
  if (Array.isArray(body.tags)) {
    updates.tags = body.tags;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("media_images")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ image: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = serviceClient();

  // Fetch storage path first
  const { data: image, error: fetchError } = await supabase
    .from("media_images")
    .select("storage_path")
    .eq("id", id)
    .single();

  if (fetchError || !image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  // Remove from storage (best-effort — don't block DB delete on failure)
  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([image.storage_path]);

  if (storageError) {
    console.error("[media delete] storage:", storageError.message);
  }

  const { error: dbError } = await supabase
    .from("media_images")
    .delete()
    .eq("id", id);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
