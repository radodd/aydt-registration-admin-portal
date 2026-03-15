import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
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

  if (file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "Only PDF files are supported" },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File exceeds 10 MB limit" },
      { status: 400 },
    );
  }

  const storagePath = `pdfs/${uuidv4()}.pdf`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: "application/pdf", upsert: false });

  if (storageError) {
    console.error("[upload-pdf] storage:", storageError.message);
    return NextResponse.json({ error: storageError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);

  return NextResponse.json({
    url: urlData.publicUrl,
    filename: file.name,
  });
}
