"use server";

import { createClient } from "@/utils/supabase/server";

export async function cloneSemester(sourceId: string): Promise<string> {
  const supabase = await createClient();

  // Fetch source semester with all related data (Phase 1: classes + class_sessions)
  const { data: source, error: fetchError } = await supabase
    .from("semesters")
    .select(
      `
      *,
      classes (
        *,
        class_sessions (*)
      ),
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

  if (insertError || !newSemester)
    throw new Error(insertError?.message ?? "Failed to create clone");

  const newId = newSemester.id;

  // Clone classes + class_sessions; build old class_session_id → new id map
  const sessionIdMap: Record<string, string> = {};

  if (source.classes?.length > 0) {
    for (const cls of source.classes) {
      const { data: newClass, error: classErr } = await supabase
        .from("classes")
        .insert({
          semester_id: newId,
          name: cls.name,
          discipline: cls.discipline,
          division: cls.division,
          level: cls.level ?? null,
          description: cls.description ?? null,
          min_age: cls.min_age ?? null,
          max_age: cls.max_age ?? null,
          is_active: cls.is_active,
          is_competition_track: cls.is_competition_track ?? false,
          requires_teacher_rec: cls.requires_teacher_rec ?? false,
          cloned_from_class_id: cls.id,
        })
        .select("id")
        .single();

      if (classErr || !newClass)
        throw new Error(classErr?.message ?? "Class clone failed");

      const newClassId = newClass.id;

      if (cls.class_sessions?.length > 0) {
        const sessionInserts = cls.class_sessions.map((cs: any) => ({
          class_id: newClassId,
          semester_id: newId,
          day_of_week: cs.day_of_week,
          start_time: cs.start_time,
          end_time: cs.end_time,
          start_date: cs.start_date,
          end_date: cs.end_date,
          location: cs.location,
          instructor_name: cs.instructor_name,
          capacity: cs.capacity,
          registration_close_at: cs.registration_close_at,
          is_active: cs.is_active,
          cloned_from_session_id: cs.id,
        }));

        const { data: newSessions, error: sessionsErr } = await supabase
          .from("class_sessions")
          .insert(sessionInserts)
          .select("id");

        if (sessionsErr) throw new Error(sessionsErr.message);

        cls.class_sessions.forEach((cs: any, i: number) => {
          sessionIdMap[cs.id] = newSessions![i].id;
        });
      }
    }
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

      if (groupError || !newGroup)
        throw new Error(groupError?.message ?? "Group insert failed");

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
