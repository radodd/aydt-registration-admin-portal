"use client";

import { EmailDraft, EmailStatus } from "@/types";
import EmailForm from "./EmailForm";

type Props = {
  initialState: EmailDraft;
  isSuperAdmin: boolean;
  emailStatus: EmailStatus;
  adminSignatureHtml: string | null;
};

export default function EditEmailClient({ initialState, isSuperAdmin, emailStatus, adminSignatureHtml }: Props) {
  return <EmailForm initialState={initialState} isSuperAdmin={isSuperAdmin} emailStatus={emailStatus} adminSignatureHtml={adminSignatureHtml} />;
}
