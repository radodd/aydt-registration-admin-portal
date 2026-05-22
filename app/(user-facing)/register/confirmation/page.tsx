import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { ConfirmationCleanup } from "./ConfirmationCleanup";
import { BatchConfirmationGuard } from "./BatchConfirmationGuard";

export const metadata: Metadata = {
  title: "Registration Confirmed — AYDT",
};

export type ConfirmationLineItem = {
  dancerName: string;
  className: string;
};

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const preview = typeof sp.preview === "string" ? sp.preview : undefined;
  const semester = typeof sp.semester === "string" ? sp.semester : undefined;
  const batch = typeof sp.batch === "string" ? sp.batch : undefined;
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
    .from("registration_orders")
    .select("status, grand_total, payment_plan_type, semesters:semester_id(name)")
    .eq("id", batchId)
    .maybeSingle();

  const initialStatus =
    (batchRow?.status as "confirmed" | "pending_payment" | "failed") ??
    "unknown";

  // Pull what was registered for so the success screen can summarize the order.
  // Rows exist even while the batch is still `pending` (they're inserted up
  // front), so names are available regardless of webhook timing. A batch can
  // produce rows in either/both tables — registrations (drop-in) and
  // schedule_enrollments (full-term / tiered).
  const [{ data: regRows }, { data: enrollRows }] = await Promise.all([
    supabase
      .from("registrations")
      .select("id, dancers(first_name, last_name), class_sessions(classes(name))")
      .eq("registration_batch_id", batchId),
    supabase
      .from("schedule_enrollments")
      .select("id, dancers(first_name, last_name), class_schedules(classes(name))")
      .eq("batch_id", batchId),
  ]);

  // Supabase types these nested joins as arrays; at runtime they're the
  // single related object, so we read them loosely (matches profile/page.tsx).
  const fullName = (d: { first_name?: string | null; last_name?: string | null } | null | undefined) =>
    d ? `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim() : "";

  const items: ConfirmationLineItem[] = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...((regRows as any[]) ?? []).map((r) => ({
      dancerName: fullName(r.dancers),
      className: r.class_sessions?.classes?.name ?? "Class",
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...((enrollRows as any[]) ?? []).map((r) => ({
      dancerName: fullName(r.dancers),
      className: r.class_schedules?.classes?.name ?? "Class",
    })),
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const semesterName = (batchRow as any)?.semesters?.name ?? null;

  return (
    <>
      <ConfirmationCleanup semesterId={semesterId} isPreview={isPreview} />
      <BatchConfirmationGuard
        batchId={batchId}
        initialStatus={initialStatus}
        isPreview={isPreview}
        grandTotal={batchRow?.grand_total ?? null}
        paymentPlanType={batchRow?.payment_plan_type ?? null}
        semesterName={semesterName}
        items={items}
      />
    </>
  );
}
