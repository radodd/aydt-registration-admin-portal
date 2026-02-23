"use server";

import { createClient } from "@/utils/supabase/server";

export async function cloneSemester(sourceId: string): Promise<string> {
  const supabase = await createClient();

  // Fetch source semester with all related data
  const { data: source, error: fetchError } = await supabase
    .from("semesters")
    .select(
      `
      *,
      sessions(*),
      session_groups(
        id, name, description,
        session_group_sessions(session_id)
      ),
      semester_payment_plans(*),
      semester_payment_installments(*),
      semester_discounts(discount_id)
      `,
    )
    .eq("id", sourceId)
    .single();

  if (fetchError || !source) throw new Error("Source semester not found");

  // Insert new semester — clear publish_at, published_at, force draft
  const { data: newSemester, error: insertError } = await supabase
    .from("semesters")
    .insert({
      name: `${source.name} (Copy)`,
      tracking_mode: source.tracking_mode,
      capacity_warning_threshold: source.capacity_warning_threshold,
      status: "draft",
      registration_form: source.registration_form ?? { elements: [] },
      confirmation_email: source.confirmation_email ?? {},
      publish_at: null,
      published_at: null,
    })
    .select("id")
    .single();

  if (insertError || !newSemester) throw new Error(insertError?.message ?? "Failed to create clone");

  const newId = newSemester.id;

  // Clone sessions, build oldId → newId map for group remapping
  const sessionIdMap: Record<string, string> = {};

  if (source.sessions?.length > 0) {
    const sessionInserts = source.sessions.map((s: any) => ({
      semester_id: newId,
      title: s.title,
      description: s.description,
      category: s.category,
      type: s.type,
      location: s.location,
      price: s.price,
      registration_fee: s.registration_fee,
      start_date: s.start_date,
      end_date: s.end_date,
      days_of_week: s.days_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
      capacity: s.capacity,
      is_active: s.is_active,
    }));

    const { data: newSessions, error: sessionsError } = await supabase
      .from("sessions")
      .insert(sessionInserts)
      .select("id");

    if (sessionsError) throw new Error(sessionsError.message);

    // Map old session IDs to new ones (positional — same order as insert)
    source.sessions.forEach((s: any, i: number) => {
      sessionIdMap[s.id] = newSessions![i].id;
    });
  }

  // Clone session groups
  if (source.session_groups?.length > 0) {
    for (const group of source.session_groups) {
      const { data: newGroup, error: groupError } = await supabase
        .from("session_groups")
        .insert({
          semester_id: newId,
          name: group.name,
          description: group.description ?? null,
        })
        .select("id")
        .single();

      if (groupError || !newGroup) throw new Error(groupError?.message ?? "Group insert failed");

      // Clone session_group_sessions with remapped IDs
      const groupSessionLinks = (group.session_group_sessions ?? [])
        .map((sgs: any) => sessionIdMap[sgs.session_id])
        .filter(Boolean)
        .map((newSessionId: string) => ({
          session_group_id: newGroup.id,
          session_id: newSessionId,
        }));

      if (groupSessionLinks.length > 0) {
        const { error: linksError } = await supabase
          .from("session_group_sessions")
          .insert(groupSessionLinks);

        if (linksError) throw new Error(linksError.message);
      }
    }
  }

  // Clone payment plan
  if (source.semester_payment_plans) {
    const plan = source.semester_payment_plans;
    const { error: planError } = await supabase
      .from("semester_payment_plans")
      .insert({
        semester_id: newId,
        type: plan.type,
        deposit_amount: plan.deposit_amount,
        deposit_percent: plan.deposit_percent,
        installment_count: plan.installment_count,
        due_date: plan.due_date,
      });

    if (planError) throw new Error(planError.message);

    // Clone installments
    if (source.semester_payment_installments?.length > 0) {
      const installmentInserts = source.semester_payment_installments.map(
        (i: any) => ({
          semester_id: newId,
          installment_number: i.installment_number,
          amount: i.amount,
          due_date: i.due_date,
        }),
      );

      const { error: installError } = await supabase
        .from("semester_payment_installments")
        .insert(installmentInserts);

      if (installError) throw new Error(installError.message);
    }
  }

  // Clone discount associations
  if (source.semester_discounts?.length > 0) {
    const discountLinks = source.semester_discounts.map((sd: any) => ({
      semester_id: newId,
      discount_id: sd.discount_id,
    }));

    const { error: discountError } = await supabase
      .from("semester_discounts")
      .insert(discountLinks);

    if (discountError) throw new Error(discountError.message);
  }

  return newId;
}
