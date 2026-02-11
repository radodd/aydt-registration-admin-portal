"use server";

import { createClient } from "@/utils/supabase/server";

export async function updateSemesterDetails(id: string, details: any) {
  const supabase = await createClient();

  return supabase
    .from("semesters")
    .update({
      name: details.name,
      tracking_mode: details.trackingMode,
      capacity_warning_threshold: details.capacityWarningThreshold,
      publish_at: details.publishAt,
      updated_at: new Date(),
    })
    .eq("id", id);
}
