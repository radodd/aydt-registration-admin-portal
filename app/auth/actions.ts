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

  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const first_name = formData.get("first_name") as string;
  const last_name = formData.get("last_name") as string;

  const next = formData.get("next") as string | null;
  const callbackNext = next?.startsWith("/") ? next : "/";

  // NEXT_PUBLIC_BASE_URL must be set to the production domain in Vercel env vars.
  // If missing, omit emailRedirectTo so Supabase uses its configured Site URL
  // rather than rejecting the signup with "Redirect URL not allowed".
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const emailRedirectTo = baseUrl
    ? `${baseUrl}/auth/callback?next=${encodeURIComponent(callbackNext)}`
    : undefined;

  console.log("[signUp] NEXT_PUBLIC_BASE_URL:", baseUrl ?? "(not set)");
  console.log("[signUp] emailRedirectTo:", emailRedirectTo ?? "(omitted — using Supabase Site URL)");

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
      data: { first_name, last_name },
    },
  });

  if (authError) {
    console.error("[signUp] Auth signup error:", authError.message, authError);
    redirect("/error");
  }

  const authUser = authData.user;
  console.log("[signUp] Auth user created:", authUser?.id ?? "null", "| confirmed:", authUser?.email_confirmed_at ?? "unconfirmed");

  if (!authUser) {
    console.error("[signUp] No auth user returned after signup.");
    redirect("/error");
  }

  // Use service role client to bypass RLS — new users have no insert permissions yet
  const { data: family, error: familyError } = await adminSupabase
    .from("families")
    .insert([{ family_name: `${last_name} Family` }])
    .select()
    .single();

  if (familyError) {
    console.error("[signUp] Family insert error:", familyError.message, familyError);
  } else {
    console.log("[signUp] Family created:", family?.id);
  }

  const { error: userError } = await adminSupabase.from("users").insert([
    {
      id: authUser.id,
      family_id: family?.id || null,
      first_name,
      last_name,
      email,
    },
  ]);

  if (userError) {
    console.error("[signUp] User insert error:", userError.message, userError);
    if (userError.message.includes("duplicate key value")) {
      redirect("/auth?error=email_exists");
    }
    redirect("/error");
  }

  console.log("[signUp] User row created successfully. Redirecting to check-email.");
  revalidatePath("/", "layout");
  redirect(`/auth?message=check_email&email=${encodeURIComponent(email)}`);
}

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) console.error("Sign out error.", error.message);
  redirect("/auth");
}

export async function sendPasswordResetEmail(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  console.log("Sending password reset email to:", email);

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_BASE_URL}/auth/reset-password`,
  });
  if (error) {
    console.error("Error sending password reset email:", error.message);
    redirect("/error");
  }
}

export async function resetPassword(formData: FormData) {
  const supabase = await createClient();

  const password = formData.get("password") as string;

  const { error } = await supabase.auth.updateUser({
    password: password,
  });
  if (error) {
    console.error("Error resetting password:", error.message);
    redirect("/error");
  }

  redirect("/auth/login");
}
