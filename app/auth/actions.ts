"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";
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

  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const first_name = formData.get("first_name") as string;
  const last_name = formData.get("last_name") as string;

  const next = formData.get("next") as string | null;
  const callbackNext = next?.startsWith("/") ? next : "/";

  // The confirmation link must return to the production site. Prefer SITE_URL
  // (the canonical server-side origin, e.g. register.aydt.nyc); if unset, omit
  // emailRedirectTo so Supabase falls back to its configured Site URL rather
  // than rejecting the signup with "Redirect URL not allowed".
  const baseUrl = process.env.SITE_URL;
  const emailRedirectTo = baseUrl
    ? `${baseUrl}/auth/callback?next=${encodeURIComponent(callbackNext)}`
    : undefined;

  console.log(
    "[signUp] emailRedirectTo:",
    emailRedirectTo ?? "(omitted — using Supabase Site URL)",
  );

  // Standard email-verification signup: Supabase sends the confirmation email
  // and the account stays unconfirmed until the user clicks the link, which
  // lands on /auth/callback to exchange the code for a session. The
  // handle_new_user() trigger on auth.users creates the public.families +
  // public.users rows from user_metadata, so no manual insert is needed here.
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
      data: { first_name, last_name },
    },
  });

  if (authError) {
    console.error("[signUp] signUp error:", authError.message, authError);
    redirect("/error");
  }

  // Supabase obfuscates an already-registered email to prevent enumeration:
  // it returns a user with an empty identities array and no error. Surface the
  // friendly "email already exists" state in that case.
  if (authData.user && (authData.user.identities?.length ?? 0) === 0) {
    console.log("[signUp] Email already registered (obfuscated response).");
    redirect("/auth?error=email_exists");
  }

  console.log("[signUp] Signup accepted. Redirecting to check-email.");
  revalidatePath("/", "layout");
  redirect(`/auth?message=check_email&email=${encodeURIComponent(email)}`);
}

export async function signOut(options?: { scope?: "local" | "global" }) {
  const supabase = await createClient();
  // `options` may be a FormData when invoked via `<form action={signOut}>`;
  // in that case `scope` is simply absent and a default sign-out runs.
  const scope = options && "scope" in options ? options.scope : undefined;
  const { error } = await supabase.auth.signOut(scope ? { scope } : undefined);
  if (error) {
    console.error("Sign out error.", error.message);
    return { error: error.message };
  }
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
