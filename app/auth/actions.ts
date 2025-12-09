"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";
import { signUpSchema } from "../lib/validation/auth";
import { request } from "http";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const data = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const { error } = await supabase.auth.signInWithPassword(data);
  console.log(error);
  if (error) {
    console.log(error);
    redirect("/error");
  }

  revalidatePath("/", "layout");
  redirect("/private");
}

export async function signUp(formData: FormData) {
  console.log(...formData);
  const values = signUpSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!values.success) {
    throw new Error("Invalid form submission");
  }

  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const first_name = formData.get("first_name") as string;
  const last_name = formData.get("last_name") as string;

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });
  console.log("Auth Data", authData);

  if (authError) {
    console.error("Auth signup error:", authError.message);
    redirect("/error");
  }

  const authUser = authData.user;
  if (!authUser) {
    console.error("No auth user returned after signup.");
    redirect("/error");
  }

  // 🧠 3. Create family record (optional)
  const { data: family, error: familyError } = await supabase
    .from("families")
    .insert([{ family_name: `${last_name} Family` }])
    .select()
    .single();

  if (familyError) {
    console.warn("Family creation error (non-blocking):", familyError.message);
  }

  // 🧠 4. Create matching user row
  const { error: userError } = await supabase.from("users").insert([
    {
      id: authUser.id, // match with auth.users UUID
      family_id: family?.id || null,
      first_name,
      last_name,
      email,
    },
  ]);

  if (userError) {
    console.error("User table insert error:", userError.message);
    if (userError.message.includes("duplicate key value")) {
      redirect("/auth/login?error=email_exists");
    }
    redirect("/error");
  }

  // 🧠 5. Revalidate and redirect
  revalidatePath("/", "layout");
  redirect("/private");
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
