import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import { imageSize } from "image-size";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const BUCKET = "email-assets";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const supabase = serviceClient();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Unsupported type. Allowed: JPEG, PNG, GIF, WebP" },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File exceeds 5 MB limit" },
      { status: 400 },
    );
  }

  const folder = (form.get("folder") as string | null) ?? "general";
  const displayName =
    (form.get("display_name") as string | null)?.trim() ||
    file.name.replace(/\.[^/.]+$/, "");
  const rawTags = form.get("tags") as string | null;
  const tags: string[] = rawTags ? (JSON.parse(rawTags) as string[]) : [];

  const ext = file.name.split(".").pop() ?? "jpg";
  const storagePath = `email-images/${uuidv4()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  // Detect dimensions — synchronous, pure-JS, no native deps
  let imgWidth: number | null = null;
  let imgHeight: number | null = null;
  const warnings: string[] = [];

  try {
    const dims = imageSize(buffer);
    imgWidth  = dims.width  ?? null;
    imgHeight = dims.height ?? null;
  } catch { /* non-fatal: dimensions stay null */ }

  // Warn (never block) for email-banners folder
  if (folder === "email-banners") {
    if (imgWidth !== null && imgWidth !== 600)
      warnings.push(`Width is ${imgWidth}px — recommended 600px for email banners.`);
    if (imgHeight !== null && (imgHeight < 200 || imgHeight > 300))
      warnings.push(`Height is ${imgHeight}px — recommended 200–300px for email banners.`);
    if (file.size > 500 * 1024)
      warnings.push(`File is ${Math.round(file.size / 1024)} KB — recommended under 500 KB for email banners.`);
  }

  // Upload to storage
  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (storageError) {
    console.error("[upload-image] storage:", storageError.message);
    return NextResponse.json({ error: storageError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);

  // Write metadata
  const { data: image, error: dbError } = await supabase
    .from("media_images")
    .insert({
      display_name: displayName,
      storage_path: storagePath,
      public_url: urlData.publicUrl,
      folder,
      tags,
      mime_type: file.type,
      size_bytes: file.size,
      width: imgWidth,
      height: imgHeight,
    })
    .select()
    .single();

  if (dbError) {
    // Best-effort cleanup so storage and DB stay in sync
    await supabase.storage.from(BUCKET).remove([storagePath]);
    console.error("[upload-image] db:", dbError.message);
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({
    id: image.id,
    url: urlData.publicUrl,
    display_name: displayName,
    width: imgWidth,
    height: imgHeight,
    warnings,
  });
}
