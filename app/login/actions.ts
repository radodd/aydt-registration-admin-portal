"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();

  // type-casting here for convenience
  // in practice, you should validate your inputs
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

export async function signup(formData: FormData) {
  const supabase = await createClient();

  // 🧠 1. Collect extended signup fields
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const first_name = formData.get("first_name") as string;
  const last_name = formData.get("last_name") as string;
  const phone_number = formData.get("phone_number") as string;
  // const address_line1 = formData.get("address_line1") as string;
  // const address_line2 = formData.get("address_line2") as string;
  // const city = formData.get("city") as string;
  // const state = formData.get("state") as string;
  // const zipcode = formData.get("zipcode") as string;

  // 🧠 2. Create Auth user
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
      phone_number,
    },
  ]);

  if (userError) {
    console.error("User table insert error:", userError.message);
    redirect("/error");
  }

  // 🧠 5. Revalidate and redirect
  revalidatePath("/", "layout");
  redirect("/private");
}
