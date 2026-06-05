"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/utils/requireAdmin";

export async function updateSemesterDetails(
  semesterId: string,
  details?: {
    name: string;
    location?: string;
    trackingMode: boolean;
    capacityWarningThreshold?: number;
    capacityWarningMode?: "count" | "percent";
    publishAt?: Date;
  },
) {
  await requireAdmin();
  if (!details) return;

  const supabase = await createClient();

  const { error } = await supabase
    .from("semesters")
    .update({
      name: details.name,
      location: details.location ?? null,
      tracking_mode: details.trackingMode,
      capacity_warning_threshold: details.capacityWarningThreshold ?? null,
      capacity_warning_mode: details.capacityWarningMode ?? "count",
      publish_at: details.publishAt ?? null,
    })
    .eq("id", semesterId);

  if (error) {
    throw new Error(error.message);
  }
}
