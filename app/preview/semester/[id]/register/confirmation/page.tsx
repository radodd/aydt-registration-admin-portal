import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { PreviewConfirmationContent } from "./PreviewConfirmationContent";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Preview confirmation step.
 *
 * Stays INSIDE the preview tree (so it keeps the layout's PREVIEW banner +
 * the in-memory Cart/Registration providers). The preview payment page routes
 * here instead of the live `/register/confirmation` page so the admin never
 * leaves preview and the in-memory cart/registration state is still readable.
 *
 * No side effects: no batch is created, no email is sent. The confirmation
 * email is RENDERED in-browser only (see PreviewConfirmationContent), using
 * the semester's stored `confirmation_email` template with the preview's
 * real cart/registration data substituted into the tokens.
 */
export default async function PreviewConfirmationPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: semester } = await supabase
    .from("semesters")
    .select("name, confirmation_email")
    .eq("id", id)
    .maybeSingle();

  if (!semester) notFound();

  // `confirmation_email` is a jsonb column (defaults to `{}`), shaped like the
  // webhook's send path expects: { subject, htmlBody }.
  const template = (semester.confirmation_email ?? {}) as {
    subject?: string;
    htmlBody?: string;
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <PreviewConfirmationContent
        semesterId={id}
        semesterName={semester.name}
        emailTemplate={{ subject: template.subject, htmlBody: template.htmlBody }}
      />
    </div>
  );
}
