import { Discount, HydratedDiscount, SemesterDiscount } from "@/types";
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
        is_self,

        registrations:registrations!dancer_id (
          id,
          status,
          class_sessions!session_id (
            id,
            day_of_week,
            start_time,
            end_time,
            classes ( name )
          )
        )
      )
    `,
    )
    .order("family_name", { ascending: true });

  if (error) {
    console.error("Failed to load families:", error);
  }

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
          
        `,
    )
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to load dancers.", error.message);
  }
  return data;
}

/**
 * Phase 1: returns classes with nested class_sessions.
 * Optional semesterId restricts to a specific semester.
 */
export async function getClasses(semesterId?: string) {
  const supabase = createClient();

  let query = supabase
    .from("classes")
    .select("*, class_sessions(*)")
    .order("created_at", { ascending: false });

  if (semesterId) {
    query = query.eq("semester_id", semesterId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to load classes.", error.message);
  }
  return data ?? [];
}

/** @deprecated Use getClasses(). Legacy callers receive all classes. */
export async function getSessions(_excludeSemesterId?: string) {
  return getClasses();
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

          `,
    )
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to load users.", error.message);
  }
  return data;
}

export async function getDiscounts(): Promise<HydratedDiscount[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("discounts")
    .select(
      `
      *,
      discount_rules (*),
      discount_rule_sessions (
        session_id,
        class_sessions!session_id (
          id,
          classes ( name )
        )
        )
        `,
    )

    .order("created_at", { ascending: false });
  if (error) {
    console.error("Failed to load discounts.", error.message);
  }
  return data ?? [];
}
