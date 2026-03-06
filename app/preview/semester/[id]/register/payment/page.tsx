"use client";

import { use } from "react";
import { Suspense } from "react";
import { PaymentContent } from "@/app/(user-facing)/register/payment/page";

// PaymentContent reads state.isPreview from the layout-level RegistrationProvider
// (initialized with preview=true). The EPG guard at line 185 fires before any
// gateway call, so no real transaction is ever created.
export default function PreviewPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <Suspense>
        <PaymentContent semesterId={id} />
      </Suspense>
    </div>
  );
}
