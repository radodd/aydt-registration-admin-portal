import { createClient } from "@/utils/supabase/server";
import { notFound, redirect } from "next/navigation";
import EditEmailClient from "../../EditEmailClient";
import { EmailDraft, EmailSelectionCriteria, ManualUserEntry } from "@/types";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditEmailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/auth");

  const { data: admin } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", authUser.id)
    .single();

  if (!admin || !["admin", "super_admin"].includes(admin.role)) {
    redirect("/auth");
  }

  const { data: email, error } = await supabase
    .from("emails")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error || !email) notFound();

  // Redirect away from wizard if in a terminal or in-flight state.
  // "sending" can't be edited (in-flight). "sent"/"cancelled" are done.
  // "scheduled" and "failed" are allowed — header shows Revert to Draft.
  if (["sent", "cancelled", "sending"].includes(email.status)) {
    redirect(`/admin/emails`);
  }

  const { data: selections } = await supabase
    .from("email_recipient_selections")
    .select("*")
    .eq("email_id", id);

  const wizardSelections: EmailSelectionCriteria[] = [];
  const manualAdditions: ManualUserEntry[] = [];
  const exclusions: string[] = [];

  for (const sel of selections ?? []) {
    if (sel.is_excluded && sel.user_id) {
      exclusions.push(sel.user_id);
    } else if (sel.selection_type === "manual" && sel.user_id) {
      const { data: user } = await supabase
        .from("users")
        .select("id, email, first_name, last_name")
        .eq("id", sel.user_id)
        .single();
      if (user) {
        manualAdditions.push({
          userId: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
        });
      }
    } else if (
      (sel.selection_type === "semester" || sel.selection_type === "session") &&
      sel.semester_id
    ) {
      const { data: semester } = await supabase
        .from("semesters")
        .select("id, name")
        .eq("id", sel.semester_id)
        .single();

      let sessionName: string | undefined;
      if (sel.session_id) {
        const { data: session } = await supabase
          .from("class_sessions")
          .select("id, classes(name)")
          .eq("id", sel.session_id)
          .single();
        const cls = Array.isArray((session as any)?.classes)
          ? (session as any)?.classes[0]
          : (session as any)?.classes;
        sessionName = cls?.name;
      }

      wizardSelections.push({
        localId: sel.id,
        type: sel.selection_type as "semester" | "session",
        semesterId: sel.semester_id,
        semesterName: semester?.name ?? sel.semester_id,
        sessionId: sel.session_id ?? undefined,
        sessionName,
      });
    }
  }

  const initialState: EmailDraft = {
    id: email.id,
    setup: {
      subject: email.subject ?? "",
      senderName: email.sender_name ?? "",
      senderEmail: email.sender_email ?? "",
      replyToEmail: email.reply_to_email ?? undefined,
      includeSignature: email.include_signature ?? false,
    },
    recipients: {
      selections: wizardSelections,
      manualAdditions,
      exclusions,
    },
    design: {
      bodyHtml: email.body_html ?? "",
      bodyJson: email.body_json ?? {},
    },
    schedule: {
      sendMode: email.scheduled_at ? "scheduled" : "now",
      scheduledAt: email.scheduled_at ?? undefined,
    },
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <EditEmailClient
        initialState={initialState}
        isSuperAdmin={admin.role === "super_admin"}
        emailStatus={email.status as import("@/types").EmailStatus}
      />
    </div>
  );
}
