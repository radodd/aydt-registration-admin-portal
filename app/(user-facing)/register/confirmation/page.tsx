import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { ConfirmationCleanup } from "./ConfirmationCleanup";
import { BatchConfirmationGuard } from "./BatchConfirmationGuard";

export const metadata: Metadata = {
  title: "Registration Confirmed — AYDT",
};

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string; semester?: string; batch?: string }>;
}) {
  const { preview, semester, batch } = await searchParams;
  const isPreview = preview === "1";
  const semesterId = semester ?? "";
  const batchId = batch ?? "";

  // If no batchId (preview or direct navigation), skip status check
  if (!batchId || isPreview) {
    return (
      <>
        <ConfirmationCleanup semesterId={semesterId} isPreview={isPreview} />
        <BatchConfirmationGuard
          batchId={batchId}
          semesterId={semesterId}
          initialStatus="confirmed"
          isPreview={isPreview}
        />
      </>
    );
  }

  // Server-side: check current batch status so we know the initial state
  // before client-side polling begins. This avoids a flash of the spinner
  // when the webhook has already fired before the user was redirected.
  const supabase = await createClient();
  const { data: batchRow } = await supabase
    .from("registration_batches")
    .select("status")
    .eq("id", batchId)
    .maybeSingle();

  const initialStatus =
    (batchRow?.status as "confirmed" | "pending_payment" | "failed") ??
    "unknown";

  return (
    <>
      <ConfirmationCleanup semesterId={semesterId} isPreview={isPreview} />
      <BatchConfirmationGuard
        batchId={batchId}
        semesterId={semesterId}
        initialStatus={initialStatus}
        isPreview={isPreview}
      />
    </>
  );
}
