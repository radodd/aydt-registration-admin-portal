import { Discount, SemesterDiscount } from "@/types";
import { createClient } from "@/utils/supabase/client";

// export async function getFamilies() {
//   const supabase = createClient();

//   const { data, error } = await supabase
//     .from("families")
//     .select(
//       `
//           id,
//           family_name,
//           created_at,

//           users:users!family_id (
//             id,
//             first_name,
//             last_name,
//             email,
//             phone_number,
//             is_primary_parent
//           ),

//           dancers:dancers!family_id (
//             id,
//             first_name,
//             last_name,

//             registrations:registrations!dancer_id (
//               id,
//               programs:programs!program_id (
//                 id,
//                 title,
//                 days_of_week,
//                 start_time,
//                 end_time
//               )
//             )
//           )
//         `,
//     )
//     .order("family_name", { ascending: true });

//   if (error) console.error("Failed to load families:", error.message);

//   return data;
// }

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
          sessions:sessions!session_id (
            id,
            title,
            days_of_week,
            start_time,
            end_time
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

export async function getSessions() {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("sessions")
    .select("*")

    .order("start_date", { ascending: false });
  if (error) {
    console.error("Failed to load sessions.", error.message);
  }
  return data ?? [];
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

// export async function getDiscount(discountId: string) {
//   const supabase = createClient();
//   const { date, error } = await supabase.from("discounts").select(
//     `
//       d.id,
//       d.name,
//       d.discount_type,
//       d.discount_value,
//       d.applies_to,
//       d.eligible_sessions,
//       COALESCE(
//         json_agg(
//           json_build_object(
//             'id', r.id,
//             'ruleType', r.rule_type,
//             'threshold', r.threshold,
//             'giveDiscountTo', r.give_discount_to,
//             'registrantScope', r.registrant_scope,
//             'sessions', (
//               SELECT json_agg(rs.session_id)
//               FROM discount_rule_sessions rs
//               WHERE rs.rule_id = r.id
//             )
//           )
//         ) FILTER (WHERE r.id IS NOT NULL),
//         '[]'
//       ) AS rules
//     FROM discounts d
//     LEFT JOIN discount_rules r ON r.discount_id = d.id
//     WHERE d.id = $1
//     GROUP BY d.id
//     `,
//     [discountId]
//   )
//     .order("created_at", { ascending: true });

//   if (error) {
//     console.error("Failed to load users.", error.message);
//   }
//   return data;
// }

export async function getDiscounts(): Promise<SemesterDiscount[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("discounts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Failed to load discounts.", error.message);
  }
  return data ?? [];
}
