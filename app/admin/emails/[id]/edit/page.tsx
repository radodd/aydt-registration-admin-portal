import { createClient } from "@/utils/supabase/server";
import { notFound, redirect } from "next/navigation";
import EditEmailClient from "../../EditEmailClient";
import { EmailDraft, EmailSelectionCriteria, ManualUserEntry } from "@/types";

function formatTimeServer(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  const min = m ?? "00";
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${min} ${ampm}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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
    .select("id, role, signature_html")
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
  const excludedFamilyIds: string[] = [];

  for (const sel of selections ?? []) {
    if (sel.is_excluded && sel.family_id) {
      excludedFamilyIds.push(sel.family_id);
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
    } else if (sel.selection_type === "manual" && sel.subscriber_id) {
      const { data: sub } = await supabase
        .from("email_subscribers")
        .select("id, email, name")
        .eq("id", sel.subscriber_id)
        .single();
      if (sub) {
        const parts = ((sub as any).name ?? "").trim().split(/\s+/);
        manualAdditions.push({
          subscriberId: (sub as any).id,
          email: (sub as any).email,
          firstName: parts[0] ?? "",
          lastName: parts.slice(1).join(" "),
        });
      }
    } else if (!sel.is_excluded && sel.semester_id) {
      const { data: semester } = await supabase
        .from("semesters")
        .select("id, name")
        .eq("id", sel.semester_id)
        .single();

      let className: string | undefined;
      let sessionName: string | undefined;

      if (sel.class_id) {
        const { data: cls } = await supabase
          .from("classes")
          .select("id, name")
          .eq("id", sel.class_id)
          .single();
        className = (cls as any)?.name;
      }

      if (sel.session_id) {
        const { data: session } = await supabase
          .from("class_sessions")
          .select("id, day_of_week, start_time")
          .eq("id", sel.session_id)
          .single();
        if (session) {
          const s = session as any;
          const time = s.start_time
            ? ` ${formatTimeServer(s.start_time)}`
            : "";
          sessionName = `${capitalize(s.day_of_week)}${time}`;
        }
      }

      wizardSelections.push({
        localId: sel.id,
        type: sel.selection_type as "semester" | "class" | "session",
        semesterId: sel.semester_id,
        semesterName: (semester as any)?.name ?? sel.semester_id,
        classId: sel.class_id ?? undefined,
        className,
        sessionId: sel.session_id ?? undefined,
        sessionName,
        includeInstructors: sel.include_instructors ?? false,
      });
    } else if (!sel.is_excluded && sel.selection_type === "subscribed_list") {
      wizardSelections.push({
        localId: sel.id,
        type: "subscribed_list",
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
      excludedFamilyIds,
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
        adminSignatureHtml={admin.signature_html ?? null}
      />
    </div>
  );
}
