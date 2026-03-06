"use client";

import { use } from "react";
import { ParticipantsContent } from "@/app/(user-facing)/register/participants/page";

export default function PreviewParticipantsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  // Do NOT use CartRestoreGuard — it mounts its own CartProvider (non-preview,
  // localStorage-backed) which would have itemCount=0 and redirect away.
  // CartProvider and RegistrationProvider are provided by the preview layout.
  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <ParticipantsContent
        semesterId={id}
        continueUrl={`/preview/semester/${id}/register/form`}
      />
    </div>
  );
}
