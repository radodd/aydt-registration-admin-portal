"use client";

import { EmailDraft, EmailStatus } from "@/types";
import EmailForm from "./EmailForm";

type Props = {
  initialState: EmailDraft;
  isSuperAdmin: boolean;
  emailStatus: EmailStatus;
};

export default function EditEmailClient({ initialState, isSuperAdmin, emailStatus }: Props) {
  return <EmailForm initialState={initialState} isSuperAdmin={isSuperAdmin} emailStatus={emailStatus} />;
}
