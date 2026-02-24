"use client";

import { EmailDraft } from "@/types";
import EmailForm from "./EmailForm";

type Props = {
  initialState: EmailDraft;
  isSuperAdmin: boolean;
};

export default function EditEmailClient({ initialState, isSuperAdmin }: Props) {
  return <EmailForm initialState={initialState} isSuperAdmin={isSuperAdmin} />;
}
