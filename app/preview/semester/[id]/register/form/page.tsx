"use client";

import { use } from "react";
import { FormContent } from "@/app/(user-facing)/register/form/page";

export default function PreviewFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  // CartProvider and RegistrationProvider are provided by the preview layout.
  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <FormContent
        semesterId={id}
        continueUrl={`/preview/semester/${id}/register/payment`}
        mode="preview"
      />
    </div>
  );
}
