"use server";

import { createClient } from "@/utils/supabase/server";

/** Shift a DATE string "YYYY-MM-DD" forward by N years (string-safe, no TZ issues). */
function shiftDate(date: string | null, years: number): string | null {
  if (!date || years === 0) return date;
  const year = parseInt(date.substring(0, 4), 10);
  return `${year + years}${date.substring(4)}`;
}

/** Shift a full ISO timestamp (TIMESTAMPTZ) forward by N years. */
function shiftTimestamp(ts: string | null, years: number): string | null {
  if (!ts || years === 0) return ts;
  const d = new Date(ts);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString();
}

export async function cloneSemester(sourceId: string, yearShift: number = 0): Promise<string> {
  console.log("[cloneSemester] start — sourceId:", sourceId);
  const supabase = await createClient();

  // Fetch source semester with all related data
  const { data: source, error: fetchError } = await supabase
    .from("semesters")
    .select(
      `
      *,
      classes (
        *,
        class_schedules (*, schedule_price_tiers(*))
      ),
      session_groups(
        id, name, description,
        session_group_sessions(session_id)
      ),
      semester_payment_plans(*),
      semester_payment_installments(*),
      semester_discounts(discount_id),
      tuition_rate_bands(*),
      semester_fee_config(*)
      `,
    )
    .eq("id", sourceId)
    .single();

  if (fetchError || !source) {
    console.error("[cloneSemester] fetch failed:", fetchError);
    throw new Error("Source semester not found");
  }

  console.log("[cloneSemester] source fetched:", {
    name: source.name,
    classes: source.classes?.length ?? 0,
    schedules: source.classes?.reduce((n: number, c: any) => n + (c.class_schedules?.length ?? 0), 0) ?? 0,
    session_groups: source.session_groups?.length ?? 0,
    semester_payment_plans: source.semester_payment_plans?.length ?? 0,
    semester_payment_installments: source.semester_payment_installments?.length ?? 0,
    tuition_rate_bands: source.tuition_rate_bands?.length ?? 0,
    semester_fee_config: source.semester_fee_config?.length ?? 0,
    semester_discounts: source.semester_discounts?.length ?? 0,
  });

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

  if (insertError || !newSemester) {
    console.error("[cloneSemester] semester insert failed:", insertError);
    throw new Error(insertError?.message ?? "Failed to create clone");
  }

  const newId = newSemester.id;
  console.log("[cloneSemester] new semester created — newId:", newId);

  // Clone classes + class_schedules (admin config layer); build old schedule_id → new id map.
  // class_sessions are generated automatically from class_schedules when the admin first saves.
  const scheduleIdMap: Record<string, string> = {};

  if (source.classes?.length > 0) {
    for (const cls of source.classes) {
      console.log("[cloneSemester] cloning class:", cls.name);
      const { data: newClass, error: classErr } = await supabase
        .from("classes")
        .insert({
          semester_id: newId,
          name: cls.name,
          display_name: cls.display_name ?? null,
          discipline: cls.discipline,
          division: cls.division,
          level: cls.level ?? null,
          description: cls.description ?? null,
          min_age: cls.min_age ?? null,
          max_age: cls.max_age ?? null,
          min_grade: cls.min_grade ?? null,
          max_grade: cls.max_grade ?? null,
          is_active: cls.is_active,
          is_competition_track: cls.is_competition_track ?? false,
          requires_teacher_rec: cls.requires_teacher_rec ?? false,
          cloned_from_class_id: cls.id,
        })
        .select("id")
        .single();

      if (classErr || !newClass) {
        console.error("[cloneSemester] class insert failed:", classErr);
        throw new Error(classErr?.message ?? "Class clone failed");
      }

      const newClassId = newClass.id;

      if (cls.class_schedules?.length > 0) {
        console.log(`[cloneSemester] class "${cls.name}": ${cls.class_schedules.length} schedule(s)`);

        for (const sched of cls.class_schedules) {
          const { data: newSched, error: schedErr } = await supabase
            .from("class_schedules")
            .insert({
              class_id: newClassId,
              semester_id: newId,
              days_of_week: sched.days_of_week,
              start_time: sched.start_time ?? null,
              end_time: sched.end_time ?? null,
              start_date: shiftDate(sched.start_date, yearShift),
              end_date: shiftDate(sched.end_date, yearShift),
              location: sched.location ?? null,
              instructor_name: sched.instructor_name ?? null,
              capacity: sched.capacity ?? null,
              registration_open_at: shiftTimestamp(sched.registration_open_at, yearShift),
              registration_close_at: shiftTimestamp(sched.registration_close_at, yearShift),
              gender_restriction: sched.gender_restriction ?? null,
              urgency_threshold: sched.urgency_threshold ?? null,
              pricing_model: sched.pricing_model ?? "full_schedule",
            })
            .select("id")
            .single();

          if (schedErr || !newSched) {
            console.error("[cloneSemester] class_schedules insert failed:", schedErr);
            throw new Error(schedErr?.message ?? "Schedule clone failed");
          }

          scheduleIdMap[sched.id] = newSched.id;

          // Clone schedule_price_tiers (Mode A pricing)
          if (sched.schedule_price_tiers?.length > 0) {
            const tierInserts = sched.schedule_price_tiers.map((t: any) => ({
              schedule_id: newSched.id,
              label: t.label,
              amount: t.amount,
              sort_order: t.sort_order,
              is_default: t.is_default,
            }));
            const { error: tiersErr } = await supabase
              .from("schedule_price_tiers")
              .insert(tierInserts);
            if (tiersErr) {
              console.error("[cloneSemester] schedule_price_tiers insert failed:", tiersErr);
              throw new Error(tiersErr.message);
            }
          }
        }
      }
    }
  }

  // Clone session groups
  if (source.session_groups?.length > 0) {
    for (const group of source.session_groups) {
      console.log("[cloneSemester] cloning session group:", group.name);
      const { data: newGroup, error: groupError } = await supabase
        .from("session_groups")
        .insert({
          semester_id: newId,
          name: group.name,
          description: group.description ?? null,
        })
        .select("id")
        .single();

      if (groupError || !newGroup) {
        console.error("[cloneSemester] session_group insert failed:", groupError);
        throw new Error(groupError?.message ?? "Group insert failed");
      }

      const groupSessionLinks = (group.session_group_sessions ?? [])
        .map((sgs: any) => scheduleIdMap[sgs.session_id])
        .filter(Boolean)
        .map((newScheduleId: string) => ({
          session_group_id: newGroup.id,
          session_id: newScheduleId,
        }));

      if (groupSessionLinks.length > 0) {
        const { error: linksError } = await supabase
          .from("session_group_sessions")
          .insert(groupSessionLinks);

        if (linksError) {
          console.error("[cloneSemester] session_group_sessions insert failed:", linksError);
          throw new Error(linksError.message);
        }
      }
    }
  }

  // Clone payment plan
  console.log("[cloneSemester] cloning payment plan, count:", source.semester_payment_plans?.length ?? 0);
  if (source.semester_payment_plans?.length > 0) {
    const plan = source.semester_payment_plans[0];
    console.log("[cloneSemester] payment plan row:", plan);
    const { error: planError } = await supabase
      .from("semester_payment_plans")
      .insert({
        semester_id: newId,
        type: plan.type,
        deposit_amount: plan.deposit_amount,
        deposit_percent: plan.deposit_percent,
        installment_count: plan.installment_count,
        due_date: shiftDate(plan.due_date, yearShift),
      });

    if (planError) {
      console.error("[cloneSemester] semester_payment_plans insert failed:", planError);
      throw new Error(planError.message);
    }

    if (source.semester_payment_installments?.length > 0) {
      const installmentInserts = source.semester_payment_installments.map(
        (i: any) => ({
          semester_id: newId,
          installment_number: i.installment_number,
          amount: i.amount,
          due_date: shiftDate(i.due_date, yearShift),
        }),
      );
      const { error: installError } = await supabase
        .from("semester_payment_installments")
        .insert(installmentInserts);
      if (installError) {
        console.error("[cloneSemester] semester_payment_installments insert failed:", installError);
        throw new Error(installError.message);
      }
    }
  }

  // Clone tuition rate bands
  console.log("[cloneSemester] cloning tuition_rate_bands, count:", source.tuition_rate_bands?.length ?? 0);
  if (source.tuition_rate_bands?.length > 0) {
    const bandInserts = (source.tuition_rate_bands as { division: string; weekly_class_count: number; base_tuition: number }[]).map((b) => ({
      semester_id: newId,
      division: b.division,
      weekly_class_count: b.weekly_class_count,
      base_tuition: b.base_tuition,
    }));
    const { error: bandsError } = await supabase
      .from("tuition_rate_bands")
      .insert(bandInserts);
    if (bandsError) {
      console.error("[cloneSemester] tuition_rate_bands insert failed:", bandsError);
      throw new Error(bandsError.message);
    }
  }

  // Clone fee config
  console.log("[cloneSemester] cloning semester_fee_config, count:", source.semester_fee_config?.length ?? 0);
  if (source.semester_fee_config?.length > 0) {
    const fc = source.semester_fee_config[0];
    const { error: feeError } = await supabase
      .from("semester_fee_config")
      .insert({
        semester_id: newId,
        registration_fee_per_child: fc.registration_fee_per_child,
        family_discount_amount: fc.family_discount_amount,
        auto_pay_admin_fee_monthly: fc.auto_pay_admin_fee_monthly,
        auto_pay_installment_count: fc.auto_pay_installment_count,
      });
    if (feeError) {
      console.error("[cloneSemester] semester_fee_config insert failed:", feeError);
      throw new Error(feeError.message);
    }
  }

  // Clone discount associations
  console.log("[cloneSemester] cloning discounts, count:", source.semester_discounts?.length ?? 0);
  if (source.semester_discounts?.length > 0) {
    const discountLinks = source.semester_discounts.map((sd: any) => ({
      semester_id: newId,
      discount_id: sd.discount_id,
    }));
    const { error: discountError } = await supabase
      .from("semester_discounts")
      .insert(discountLinks);
    if (discountError) {
      console.error("[cloneSemester] semester_discounts insert failed:", discountError);
      throw new Error(discountError.message);
    }
  }

  console.log("[cloneSemester] complete — newId:", newId);
  return newId;
}
