"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { requireAdmin } from "@/utils/requireAdmin";
import { sendActivationInviteEmail } from "@/utils/email/sendActivationInviteEmail";
import { MAX_ACTIVATION_BATCH } from "./activationConstants";

/** Pause between sends so Resend's per-second rate limit isn't tripped. */
const SEND_INTERVAL_MS = 350;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface ActivationInviteResult {
  familyId: string;
  familyName: string | null;
  email: string | null;
  status: "sent" | "skipped" | "error";
  detail?: string;
}

export interface ActivationInviteSummary {
  sent: number;
  skipped: number;
  failed: number;
  results: ActivationInviteResult[];
}

/**
 * #62 (Option A) — send passwordless activation invites to a chosen batch of
 * silently-created family accounts, rolled out small -> large by the admin.
 *
 * Super-admin only (bulk outbound email). Per family: resolve the primary
 * parent's email, send the branded passwordless welcome, then stamp
 * families.activation_invited_at on success. Best-effort and sequential — one
 * family's failure neither aborts the batch nor stamps that family, so a re-run
 * safely retries only the ones that didn't send. Throttled to respect Resend.
 *
 * Re-inviting an already-invited family is allowed (the console drives this);
 * the default cohort it offers is families with activation_invited_at = NULL.
 */
export async function sendActivationInvites(
  familyIds: string[],
): Promise<ActivationInviteSummary> {
  const { role } = await requireAdmin();
  if (role !== "super_admin") {
    throw new Error("Only super admins can send activation invites.");
  }

  const ids = Array.from(new Set(familyIds)).filter(Boolean);
  if (ids.length === 0) throw new Error("No families selected.");
  if (ids.length > MAX_ACTIVATION_BATCH) {
    throw new Error(
      `Batch too large (${ids.length}). Send at most ${MAX_ACTIVATION_BATCH} invites at a time.`,
    );
  }

  const admin = createAdminClient();

  const { data: families, error } = await admin
    .from("families")
    .select(
      `
      id,
      family_name,
      users:users!family_id ( email, first_name, last_name, is_primary_parent )
      `,
    )
    .in("id", ids);

  if (error) throw new Error(error.message);

  // Preserve the caller's order; map for quick lookup.
  const byId = new Map((families ?? []).map((f) => [f.id as string, f]));

  const results: ActivationInviteResult[] = [];

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const family = byId.get(id);

    if (!family) {
      results.push({ familyId: id, familyName: null, email: null, status: "error", detail: "Family not found." });
      continue;
    }

    const familyName = (family.family_name as string | null) ?? null;
    const users = (family.users ?? []) as {
      email: string | null;
      first_name: string | null;
      last_name: string | null;
      is_primary_parent: boolean | null;
    }[];
    const primary = users.find((u) => u.is_primary_parent) ?? users[0];
    const email = primary?.email?.trim() || null;

    if (!email) {
      results.push({ familyId: id, familyName, email: null, status: "skipped", detail: "No primary-parent email." });
      continue;
    }

    const parentName = primary
      ? `${primary.first_name ?? ""} ${primary.last_name ?? ""}`.trim()
      : "";

    const res = await sendActivationInviteEmail({
      toEmail: email,
      parentName: parentName || null,
      familyName,
    });

    if (!res.ok) {
      results.push({ familyId: id, familyName, email, status: "error", detail: res.error });
    } else {
      const { error: stampErr } = await admin
        .from("families")
        .update({ activation_invited_at: new Date().toISOString() })
        .eq("id", id);
      if (stampErr) {
        // Email went out but the stamp failed — surface it so the admin can
        // reconcile rather than silently re-inviting next batch.
        results.push({ familyId: id, familyName, email, status: "error", detail: `Sent, but failed to record: ${stampErr.message}` });
      } else {
        results.push({ familyId: id, familyName, email, status: "sent" });
      }
    }

    if (i < ids.length - 1) await sleep(SEND_INTERVAL_MS);
  }

  return {
    sent: results.filter((r) => r.status === "sent").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "error").length,
    results,
  };
}
