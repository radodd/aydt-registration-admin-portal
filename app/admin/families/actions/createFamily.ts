"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { requireAdmin } from "@/utils/requireAdmin";
import { sendFamilyWelcomeEmail } from "@/utils/email/sendFamilyWelcomeEmail";

export interface CreateFamilyInput {
  familyName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  sendInvite: boolean;
}

/**
 * Create a family + its primary-parent account.
 *
 * Parent accounts are auth-backed: public.users.id must equal the auth user's
 * id, and the handle_new_user() trigger creates the public.users row — and a
 * fresh family for role='parent' — from each new auth.users row. So we must
 * provision the auth user first (a raw users insert fails the NOT NULL id
 * constraint), then fill in the bits the trigger doesn't set from metadata:
 * the family name, phone, and primary-parent flag.
 *
 * The auth user is created SILENTLY (no Supabase email): we deliberately do NOT
 * use admin.auth.admin.inviteUserByEmail here, because Supabase has a single
 * global "Invite User" template configured for the instructor flow ("invited to
 * be an instructor" → /instructor/setup, see createInstructor.ts) — sending it
 * to a parent delivers the wrong email and the wrong setup page.
 *
 * Instead, when input.sendInvite is set we send our OWN branded welcome email via
 * Resend (sendFamilyWelcomeEmail), with a recovery link that routes through
 * /auth/confirm → /auth/reset-password so the parent sets their password.
 */
export async function createFamily(
  input: CreateFamilyInput,
): Promise<{ familyId: string }> {
  await requireAdmin();
  const admin = createAdminClient();

  // Provision the auth user silently — this inserts into auth.users, firing the
  // handle_new_user() trigger that creates the public.users row + a new family.
  // email_confirm:true marks the email confirmed without sending any email.
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    email_confirm: true,
    user_metadata: {
      role: "parent",
      first_name: input.firstName,
      last_name: input.lastName,
    },
  });
  if (error) throw mapAuthError(error);
  const userId = data.user.id;

  // The trigger created the public.users row and an (unnamed) family for it.
  const { data: userRow, error: fetchErr } = await admin
    .from("users")
    .select("family_id")
    .eq("id", userId)
    .single();

  if (fetchErr || !userRow?.family_id) {
    throw new Error(fetchErr?.message ?? "Failed to provision the parent account.");
  }
  const familyId = userRow.family_id as string;

  // Name the family and finish the primary-parent record.
  const [{ error: famErr }, { error: userErr }] = await Promise.all([
    admin.from("families").update({ family_name: input.familyName }).eq("id", familyId),
    admin
      .from("users")
      .update({
        phone_number: input.phone || null,
        is_primary_parent: true,
        status: "active",
      })
      .eq("id", userId),
  ]);

  if (famErr) throw new Error(famErr.message);
  if (userErr) throw new Error(userErr.message);

  // Optionally send the parent a branded welcome email with a password-setup
  // link. Best-effort: the family is already created, so a mail failure logs
  // but does not fail the whole action.
  if (input.sendInvite) {
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: input.email,
    });
    const hashedToken = link?.properties?.hashed_token;
    if (linkErr || !hashedToken) {
      console.error("createFamily — welcome link generation failed:", linkErr?.message);
    } else {
      const base = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
      const setupLink = `${base}/auth/confirm?token_hash=${hashedToken}&type=recovery&next=${encodeURIComponent("/auth/reset-password")}`;
      const res = await sendFamilyWelcomeEmail({
        toEmail: input.email,
        parentName: `${input.firstName} ${input.lastName}`.trim(),
        familyName: input.familyName,
        setupLink,
      });
      if (!res.ok) console.error("createFamily — welcome email failed:", res.error);
    }
  }

  return { familyId };
}

function mapAuthError(error: { message: string }): Error {
  if (error.message.toLowerCase().includes("already been registered")) {
    return new Error("An account with this email already exists.");
  }
  return new Error(error.message);
}
