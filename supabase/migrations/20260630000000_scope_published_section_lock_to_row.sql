-- =============================================================================
-- Migration: Scope the published-semester class-section lock to the affected row
-- Date: 2026-06-30
-- =============================================================================
-- Symptom
-- -------
-- Adding a new class to a PUBLISHED semester that already has registrations
-- failed with an opaque "An error occurred in the Server Components render"
-- message. The real cause was the `lock_class_schedules_if_published` trigger on
-- `class_sections`, which ran `prevent_child_modification_if_semester_published()`.
-- That function counts registrations SEMESTER-WIDE and raises whenever the
-- semester is published and ANY class has ANY enrollment — so inserting a brand
-- new, zero-enrollment class section was blocked and the whole
-- `persistSemesterDraft` transaction rolled back.
--
-- Fix
-- ---
-- Replace ONLY the `class_sections` trigger with a row-scoped rule
-- (`prevent_section_modification_if_enrolled()`):
--
--   * draft semester                → all edits allowed (unchanged early-return)
--   * INSERT (new section)          → always allowed (cannot have enrollments yet)
--   * DELETE of an enrolled section → blocked (rug-pull protection)
--   * UPDATE of an enrolled section → blocked ONLY if an enrollment-relevant
--                                     column actually changes; idempotent
--                                     re-saves (persistSemesterDraft re-writes
--                                     every section on every save) and benign
--                                     metadata edits (instructor, location,
--                                     registration windows) pass through.
--
-- "Enrolled" = an active enrollment on this section via EITHER table, matching
-- the definition used by unpublishSemester():
--   * per-session:  meeting_enrollments → class_meetings.section_id, status not
--                   in (cancelled, waitlisted)
--   * full-term:    section_enrollments.section_id, status <> cancelled
-- (The prior semester-wide function only counted per-session enrollments and
-- ignored full-term section_enrollments entirely — a gap closed here.)
--
-- Relative to the prior behavior this is MORE PERMISSIVE in every case except
-- one deliberate tightening: the old function counted only per-session
-- meeting_enrollments (semester-wide), so a section whose only enrollments are
-- FULL-TERM section_enrollments used to be freely editable/deletable even in a
-- published semester. This version also counts section_enrollments for the row,
-- so such a section is now protected — that is the intended gap-close, not a
-- regression of any working flow (the old broad lock already blocked every
-- class_sections write whenever the semester had any per-session enrollment).
--
-- The shared `prevent_child_modification_if_semester_published()` function is
-- LEFT IN PLACE for semester_discounts / semester_payment_installments /
-- semester_payment_plans, whose semester-wide locking is intentional (a payment
-- plan or discount change affects everyone in the semester).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.prevent_section_modification_if_enrolled()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
declare
  target_semester_id uuid;
  target_section_id  uuid;
  semester_status    text;
  meeting_enrolled   integer;
  section_enrolled   integer;
  section_changed    boolean;
begin
  target_semester_id := coalesce(new.semester_id, old.semester_id);

  select status into semester_status
  from semesters
  where id = target_semester_id;

  -- Only published semesters are protected; drafts edit freely.
  if semester_status is distinct from 'published' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  -- A brand-new section cannot have enrollments yet — always allow.
  if tg_op = 'INSERT' then
    return new;
  end if;

  target_section_id := coalesce(new.id, old.id);

  -- Does THIS section have any active enrollments (per-session OR full-term)?
  -- Active-enrollment set mirrors unpublishSemester(). ('waitlisted' is not a
  -- valid meeting_enrollments status today — waitlisting lives in
  -- waitlist_entries — so it is a forward-compat no-op; the effective filter is
  -- status <> 'cancelled', which correctly counts pending_payment as enrolled.)
  select count(*) into meeting_enrolled
  from meeting_enrollments r
  join class_meetings s on s.id = r.meeting_id
  where s.section_id = target_section_id
    and r.status not in ('cancelled', 'waitlisted');

  select count(*) into section_enrolled
  from section_enrollments se
  where se.section_id = target_section_id
    and se.status <> 'cancelled';

  -- No active enrollments on this section → editing/removing it harms no one.
  if meeting_enrolled = 0 and section_enrolled = 0 then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  -- Section HAS active enrollments.
  if tg_op = 'DELETE' then
    raise exception
      'Cannot delete a class section with active enrollments in a published semester. Cancel those enrollments first.'
      using errcode = 'P0001';
  end if;

  -- UPDATE: block only if an enrollment-relevant column actually changed.
  -- `is distinct from` treats NULLs correctly, so a no-op re-save passes.
  section_changed :=
       new.days_of_week       is distinct from old.days_of_week
    or new.start_time         is distinct from old.start_time
    or new.end_time           is distinct from old.end_time
    or new.start_date         is distinct from old.start_date
    or new.end_date           is distinct from old.end_date
    or new.capacity           is distinct from old.capacity
    or new.drop_in_price      is distinct from old.drop_in_price
    or new.pricing_model      is distinct from old.pricing_model
    or new.is_drop_in         is distinct from old.is_drop_in
    or new.gender_restriction is distinct from old.gender_restriction;

  if section_changed then
    raise exception
      'Cannot change the schedule, capacity, or pricing of a class section with active enrollments in a published semester. Cancel those enrollments first.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Swap the existing trigger to the row-scoped function. The trigger name keeps
-- its historical "class_schedules" wording (the table was renamed from
-- class_schedules → class_sections; trigger names were left unchanged).
DROP TRIGGER IF EXISTS lock_class_schedules_if_published ON public.class_sections;

CREATE TRIGGER lock_class_schedules_if_published
  BEFORE INSERT OR UPDATE OR DELETE ON public.class_sections
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_section_modification_if_enrolled();
