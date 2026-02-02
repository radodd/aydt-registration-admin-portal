import { createClient } from "@/utils/supabase/client";

export async function getFamilies() {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("families")
    .select(
      `
          id,
          family_name,
          created_at,

          users:users!family_id (
            id,
            first_name,
            last_name,
            email,
            phone_number,
            is_primary_parent
          ),

          dancers:dancers!family_id (
            id,
            first_name,
            last_name,

            registrations:registrations!dancer_id (
              id,
              programs:programs!program_id (
                id,
                title,
                days_of_week,
                start_time,
                end_time
              )
            )
          )
        `
    )
    .order("family_name", { ascending: true });

  if (error) console.error("Failed to load families:", error.message);

  return data;
}

export async function getDancers() {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("dancers")
    .select(
      `
          id,
          first_name,
          middle_name,
          last_name,
          gender,
          birth_date,
          grade,
          email,
          phone_number,
          address_line1,
          address_line2,
          city,
          state,
          zipcode,
          is_self,
          created_at,
          users (
            id,
            first_name,
            last_name,
            email
          )
          
        `
    )
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to load dancers.", error.message);
  }
  return data;
}

export async function getPrograms() {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("programs")
    .select("*")
    .order("start_date", { ascending: false });
  if (error) {
    console.error("Failed to load programs.", error.message);
  }
  return data;
}

export async function getUsers() {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("users")
    .select(
      `
            id,
            family_id,
            email,
            first_name,
            middle_name,
            last_name,
            phone_number,
            is_primary_parent,
            role,
            status,
            created_at

          `
    )
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to load users.", error.message);
  }
  return data;
}
