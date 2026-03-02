"use server";

import { createClient } from "@/utils/supabase/server";
import { PaginatedResult, TemplateListRow } from "@/types";

const PAGE_SIZE = 20;

export async function listTemplates(
  page: number = 0,
): Promise<PaginatedResult<TemplateListRow>> {
  const supabase = await createClient();

  const { data, error, count } = await supabase
    .from("email_templates")
    .select(
      `*,
       created_by:users!email_templates_created_by_admin_id_fkey(first_name, last_name)`,
      { count: "exact" },
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

  if (error) throw new Error(error.message);

  return {
    data: (data ?? []) as unknown as TemplateListRow[],
    totalCount: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil((count ?? 0) / PAGE_SIZE),
  };
}

export async function deleteTemplate(templateId: string): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("email_templates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", templateId);

  if (error) throw new Error(error.message);
}

export async function cloneTemplateToEmail(
  templateId: string,
): Promise<{ emailId: string }> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Unauthorized");

  const { data: admin, error: adminErr } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", authUser.id)
    .single();

  if (adminErr || !admin || !["admin", "super_admin"].includes(admin.role)) {
    throw new Error("Unauthorized");
  }

  const { data: template, error: tErr } = await supabase
    .from("email_templates")
    .select("*")
    .eq("id", templateId)
    .single();

  if (tErr || !template) throw new Error("Template not found");

  const { data: newEmail, error } = await supabase
    .from("emails")
    .insert({
      subject: template.subject,
      body_html: template.body_html,
      body_json: template.body_json,
      status: "draft",
      created_by_admin_id: admin.id,
      updated_by_admin_id: admin.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return { emailId: newEmail.id };
}
