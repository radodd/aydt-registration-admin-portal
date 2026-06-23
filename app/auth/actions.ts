"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { signUpSchema } from "../lib/validation/auth";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const data = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const { error } = await supabase.auth.signInWithPassword(data);
  if (error) {
    const nextParam = (formData.get("next") as string | null)?.startsWith("/")
      ? `&next=${encodeURIComponent(formData.get("next") as string)}`
      : "";
    redirect(`/auth?error=invalid_credentials${nextParam}`);
  }

  revalidatePath("/", "layout");

  // Honor next param — must start with "/" to prevent open redirect
  const next = formData.get("next") as string | null;
  const safePath = next?.startsWith("/") ? next : "/";
  redirect(safePath);
}

export async function signUp(formData: FormData) {
  console.log("[signUp] action called");

  const values = signUpSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!values.success) {
    console.error("[signUp] Zod validation failed:", values.error.flatten());
    throw new Error("Invalid form submission");
  }

  console.log("[signUp] Validation passed");

  // TEMPORARY (pre-launch): gate the unverified-signup path behind an env flag
  // so it can be disabled in production by unsetting ENABLE_UNVERIFIED_SIGNUP.
  if (process.env.ENABLE_UNVERIFIED_SIGNUP !== "true") {
    console.error("[signUp] Blocked: ENABLE_UNVERIFIED_SIGNUP is not enabled.");
    redirect("/auth?error=signup_disabled");
  }

  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const first_name = formData.get("first_name") as string;
  const last_name = formData.get("last_name") as string;

  const next = formData.get("next") as string | null;
  const safePath = next?.startsWith("/") ? next : "/";

  // TEMPORARY (pre-launch): create users with email pre-confirmed via the
  // admin API. This skips the confirmation-email flow entirely so stakeholders
  // can sign up and access the admin portal during testing without hitting
  // Supabase's email rate limit. Revert to supabase.auth.signUp() before
  // production launch so real users go through email verification.
  const { data: createdUser, error: createError } =
    await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name, last_name },
    });

  if (createError) {
    console.error("[signUp] admin.createUser error:", createError.message, createError);
    if (
      createError.message.toLowerCase().includes("already") ||
      createError.message.toLowerCase().includes("registered") ||
      createError.message.toLowerCase().includes("exists")
    ) {
      redirect("/auth?error=email_exists");
    }
    redirect("/error");
  }

  const authUser = createdUser.user;
  console.log("[signUp] Auth user created (pre-confirmed):", authUser?.id ?? "null");

  if (!authUser) {
    console.error("[signUp] No auth user returned after admin.createUser.");
    redirect("/error");
  }

  // The handle_new_user() trigger on auth.users automatically inserts the
  // public.families + public.users rows, so no manual insert is needed here.

  // Sign the new user in immediately so they land in the app authenticated.
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    console.error("[signUp] Post-signup sign-in failed:", signInError.message);
    // Account was created — fall back to the login screen with email prefilled.
    redirect(`/auth?email=${encodeURIComponent(email)}`);
  }

  console.log("[signUp] Signed in. Redirecting to", safePath);
  revalidatePath("/", "layout");
  redirect(safePath);
}

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) console.error("Sign out error.", error.message);
  revalidatePath("/", "layout");
  redirect("/auth");
}

export async function sendPasswordResetEmail(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  console.log("Sending password reset email to:", email);

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.SITE_URL}/auth/reset-password`,
  });
  if (error) {
    console.error("Error sending password reset email:", error.message);
    redirect("/error");
  }
}

export async function resetPassword(formData: FormData) {
  const supabase = await createClient();

  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!password || password.length < 8) {
    redirect("/auth/reset-password?error=length");
  }
  if (password !== confirmPassword) {
    redirect("/auth/reset-password?error=mismatch");
  }

  const { error } = await supabase.auth.updateUser({
    password: password,
  });
  if (error) {
    console.error("Error resetting password:", error.message);
    redirect("/auth/reset-password?error=update");
  }

  redirect("/auth/login?reset=1");
}
