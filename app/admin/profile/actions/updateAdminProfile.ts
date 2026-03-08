"use server";

import { createClient } from "@/utils/supabase/server";
import { SignatureConfig } from "@/types";

function buildSignatureHtml(config: SignatureConfig): string {
  const { name, title, phone, website } = config;
  if (!name && !title && !phone && !website) return "";

  const namePart = name
    ? `<div style="font-weight:bold;font-size:14px;color:#111827;">${name}</div>`
    : "";
  const titlePart = title
    ? `<div style="font-size:13px;color:#6b7280;margin-top:2px;">${title}</div>`
    : "";

  const metaParts = [phone, website].filter(Boolean).join(" &nbsp;·&nbsp; ");
  const metaPart = metaParts
    ? `<div style="font-size:12px;color:#9ca3af;margin-top:4px;">${metaParts}</div>`
    : "";

  return `<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,sans-serif;line-height:1.5;">
  <tr>
    <td style="padding-top:12px;border-top:1px solid #e5e7eb;">
      ${namePart}${titlePart}${metaPart}
    </td>
  </tr>
</table>`;
}

export async function updateAdminProfile(config: SignatureConfig) {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Unauthorized");

  const { data: admin } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", authUser.id)
    .single();

  if (!admin || !["admin", "super_admin"].includes(admin.role)) {
    throw new Error("Unauthorized");
  }

  const signature_html = buildSignatureHtml(config);

  const { error } = await supabase
    .from("users")
    .update({
      display_name: config.name || null,
      signature_html: signature_html || null,
      signature_config: config,
    })
    .eq("id", admin.id);

  if (error) throw new Error(error.message);
}
