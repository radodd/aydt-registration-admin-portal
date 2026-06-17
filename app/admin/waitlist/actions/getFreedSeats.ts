"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { requireAdmin } from "@/utils/requireAdmin";

export interface FreedSeatGroup {
  classId: string;
  className: string;
  semesterName: string;
  /** Active admin_reserved placeholders = seats freed (by refund) and held. */
  freedCount: number;
  /** Waiting entries on this class's queue — drives assign-vs-reopen. */
  queueSize: number;
}

/**
 * Classes with refund-freed seats currently HELD for the admin (admin_reserved
 * placeholders, see the refund route). Returns the freed count + queue size per
 * class so the UI can offer "Assign from waitlist" (queue) or "Reopen to public"
 * (no queue). seat_holds is owner-scoped, so this runs service-role; admin role
 * verified first.
 */
export async function getFreedSeats(): Promise<FreedSeatGroup[]> {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: holds } = await admin
    .from("seat_holds")
    .select("class_id")
    .eq("hold_type", "admin_reserved")
    .is("released_at", null);

  const freedCounts = new Map<string, number>();
  for (const h of holds ?? []) {
    const cid = (h as { class_id: string | null }).class_id;
    if (!cid) continue;
    freedCounts.set(cid, (freedCounts.get(cid) ?? 0) + 1);
  }
  const classIds = [...freedCounts.keys()];
  if (classIds.length === 0) return [];

  const { data: classes } = await admin
    .from("classes")
    .select("id, name, semesters ( name )")
    .in("id", classIds);
  const classInfo = new Map<string, { name: string; semesterName: string }>();
  for (const c of classes ?? []) {
    const sem = Array.isArray((c as any).semesters) ? (c as any).semesters[0] : (c as any).semesters;
    classInfo.set((c as any).id, { name: (c as any).name ?? "Unknown class", semesterName: sem?.name ?? "" });
  }

  const queue = new Map<string, number>();
  await Promise.all(
    classIds.map(async (cid) => {
      const { count } = await admin
        .from("waitlist_entries")
        .select("id", { count: "exact", head: true })
        .eq("class_id", cid)
        .eq("status", "waiting");
      queue.set(cid, count ?? 0);
    }),
  );

  return classIds.map((cid) => ({
    classId: cid,
    className: classInfo.get(cid)?.name ?? "Unknown class",
    semesterName: classInfo.get(cid)?.semesterName ?? "",
    freedCount: freedCounts.get(cid) ?? 0,
    queueSize: queue.get(cid) ?? 0,
  }));
}
