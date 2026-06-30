-- =============================================================================
-- Migration: Enable RLS on the 22 remaining unprotected public tables
-- Date: 2026-06-24
-- =============================================================================
-- Brings the rest of the schema under Row-Level Security, mirroring the
-- conventions established in 20260323000001_enable_rls_nine_tables.sql:
--
--   admin/super_admin → full CRUD via is_admin_or_super()
--   service_role      → full bypass (webhooks, cron, edge functions, server actions)
--   parent (family)   → scoped reads via auth.uid() join path
--                       (parent_id = auth.uid(), or dancers→users.family_id)
--   public catalog     → SELECT gated on the parent semester being published
--   coupon/discount     → SELECT readable (mirrors discount_rules); validated server-side
--
-- Notes:
--  * Admin writes use is_admin_or_super() uniformly so both admin and super_admin
--    retain the write access they had while these tables were unprotected.
--  * section_enrollments already carries a dormant `schedule_enrollments_instructor_read`
--    policy (created before the table rename; RLS was never enabled). Enabling RLS
--    below activates it — we add the surrounding admin/parent/service policies and do
--    NOT recreate that instructor policy.
-- =============================================================================

-- ─── Step 1: Enable RLS on all 22 tables ────────────────────────────────────

-- Catalog / reference
ALTER TABLE public.class_sections                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_section_excluded_dates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_meeting_options         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_meeting_price_rows      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_meeting_excluded_dates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.section_price_tiers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.special_program_tuition       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concurrent_enrollment_groups  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concurrent_enrollment_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audition_sessions             ENABLE ROW LEVEL SECURITY;

-- Coupon / discount
ALTER TABLE public.discount_coupons              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semester_coupons              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_session_restrictions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_rule_sections        ENABLE ROW LEVEL SECURITY;

-- Owner-scoped (family)
ALTER TABLE public.section_enrollments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_line_items              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audition_bookings             ENABLE ROW LEVEL SECURITY;

-- Admin / owner
ALTER TABLE public.sms_notifications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_folders                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_invites                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_events                 ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Step 2: Policies
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- CLASS_SECTIONS  (catalog: published-semester read)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY class_sections_admin_all ON public.class_sections
  FOR ALL TO authenticated
  USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());

CREATE POLICY class_sections_public_read ON public.class_sections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.semesters s
      WHERE s.id = class_sections.semester_id
        AND s.status = 'published'
        AND s.deleted_at IS NULL
    )
  );

CREATE POLICY class_sections_service_role ON public.class_sections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- CLASS_SECTION_EXCLUDED_DATES  (catalog: via class_sections → semesters)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY class_section_excluded_dates_admin_all ON public.class_section_excluded_dates
  FOR ALL TO authenticated
  USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());

CREATE POLICY class_section_excluded_dates_public_read ON public.class_section_excluded_dates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.class_sections cs
      JOIN public.semesters s ON s.id = cs.semester_id
      WHERE cs.id = class_section_excluded_dates.section_id
        AND s.status = 'published'
        AND s.deleted_at IS NULL
    )
  );

CREATE POLICY class_section_excluded_dates_service_role ON public.class_section_excluded_dates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- CLASS_MEETING_OPTIONS  (catalog: via class_meetings → semesters)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY class_meeting_options_admin_all ON public.class_meeting_options
  FOR ALL TO authenticated
  USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());

CREATE POLICY class_meeting_options_public_read ON public.class_meeting_options
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.class_meetings cm
      JOIN public.semesters s ON s.id = cm.semester_id
      WHERE cm.id = class_meeting_options.class_meeting_id
        AND s.status = 'published'
        AND s.deleted_at IS NULL
    )
  );

CREATE POLICY class_meeting_options_service_role ON public.class_meeting_options
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- CLASS_MEETING_PRICE_ROWS  (catalog: via class_meetings → semesters)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY class_meeting_price_rows_admin_all ON public.class_meeting_price_rows
  FOR ALL TO authenticated
  USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());

CREATE POLICY class_meeting_price_rows_public_read ON public.class_meeting_price_rows
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.class_meetings cm
      JOIN public.semesters s ON s.id = cm.semester_id
      WHERE cm.id = class_meeting_price_rows.class_meeting_id
        AND s.status = 'published'
        AND s.deleted_at IS NULL
    )
  );

CREATE POLICY class_meeting_price_rows_service_role ON public.class_meeting_price_rows
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- CLASS_MEETING_EXCLUDED_DATES  (catalog: via class_meetings → semesters)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY class_meeting_excluded_dates_admin_all ON public.class_meeting_excluded_dates
  FOR ALL TO authenticated
  USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());

CREATE POLICY class_meeting_excluded_dates_public_read ON public.class_meeting_excluded_dates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.class_meetings cm
      JOIN public.semesters s ON s.id = cm.semester_id
      WHERE cm.id = class_meeting_excluded_dates.class_meeting_id
        AND s.status = 'published'
        AND s.deleted_at IS NULL
    )
  );

CREATE POLICY class_meeting_excluded_dates_service_role ON public.class_meeting_excluded_dates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION_PRICE_TIERS  (catalog: via class_sections → semesters)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY section_price_tiers_admin_all ON public.section_price_tiers
  FOR ALL TO authenticated
  USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());

CREATE POLICY section_price_tiers_public_read ON public.section_price_tiers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.class_sections cs
      JOIN public.semesters s ON s.id = cs.semester_id
      WHERE cs.id = section_price_tiers.section_id
        AND s.status = 'published'
        AND s.deleted_at IS NULL
    )
  );

CREATE POLICY section_price_tiers_service_role ON public.section_price_tiers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- SPECIAL_PROGRAM_TUITION  (catalog: via semesters; pricing engine reads at checkout)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY special_program_tuition_admin_all ON public.special_program_tuition
  FOR ALL TO authenticated
  USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());

CREATE POLICY special_program_tuition_public_read ON public.special_program_tuition
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.semesters s
      WHERE s.id = special_program_tuition.semester_id
        AND s.status = 'published'
        AND s.deleted_at IS NULL
    )
  );

CREATE POLICY special_program_tuition_service_role ON public.special_program_tuition
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- CONCURRENT_ENROLLMENT_GROUPS  (catalog: via classes → semesters)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY concurrent_enrollment_groups_admin_all ON public.concurrent_enrollment_groups
  FOR ALL TO authenticated
  USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());

CREATE POLICY concurrent_enrollment_groups_public_read ON public.concurrent_enrollment_groups
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.classes c
      JOIN public.semesters s ON s.id = c.semester_id
      WHERE c.id = concurrent_enrollment_groups.class_id
        AND s.status = 'published'
        AND s.deleted_at IS NULL
    )
  );

CREATE POLICY concurrent_enrollment_groups_service_role ON public.concurrent_enrollment_groups
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- CONCURRENT_ENROLLMENT_OPTIONS  (catalog: via classes → semesters)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY concurrent_enrollment_options_admin_all ON public.concurrent_enrollment_options
  FOR ALL TO authenticated
  USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());

CREATE POLICY concurrent_enrollment_options_public_read ON public.concurrent_enrollment_options
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.classes c
      JOIN public.semesters s ON s.id = c.semester_id
      WHERE c.id = concurrent_enrollment_options.class_id
        AND s.status = 'published'
        AND s.deleted_at IS NULL
    )
  );

CREATE POLICY concurrent_enrollment_options_service_role ON public.concurrent_enrollment_options
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- AUDITION_SESSIONS  (catalog: families view available audition slots)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY audition_sessions_admin_all ON public.audition_sessions
  FOR ALL TO authenticated
  USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());

CREATE POLICY audition_sessions_public_read ON public.audition_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.semesters s
      WHERE s.id = audition_sessions.semester_id
        AND s.status = 'published'
        AND s.deleted_at IS NULL
    )
  );

CREATE POLICY audition_sessions_service_role ON public.audition_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- DISCOUNT_COUPONS  (validated server-side; readable like discount_rules)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY discount_coupons_admin_all ON public.discount_coupons
  FOR ALL TO authenticated
  USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());

CREATE POLICY discount_coupons_public_read ON public.discount_coupons
  FOR SELECT USING (true);

CREATE POLICY discount_coupons_service_role ON public.discount_coupons
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- SEMESTER_COUPONS  (join table; validated server-side)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY semester_coupons_admin_all ON public.semester_coupons
  FOR ALL TO authenticated
  USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());

CREATE POLICY semester_coupons_public_read ON public.semester_coupons
  FOR SELECT USING (true);

CREATE POLICY semester_coupons_service_role ON public.semester_coupons
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- COUPON_SESSION_RESTRICTIONS  (coupon eligibility list; validated server-side)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY coupon_session_restrictions_admin_all ON public.coupon_session_restrictions
  FOR ALL TO authenticated
  USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());

CREATE POLICY coupon_session_restrictions_public_read ON public.coupon_session_restrictions
  FOR SELECT USING (true);

CREATE POLICY coupon_session_restrictions_service_role ON public.coupon_session_restrictions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- DISCOUNT_RULE_SECTIONS  (mirrors discount_rule_meetings: public read + admin write)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY discount_rule_sections_admin_all ON public.discount_rule_sections
  FOR ALL TO authenticated
  USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());

CREATE POLICY discount_rule_sections_public_read ON public.discount_rule_sections
  FOR SELECT USING (true);

CREATE POLICY discount_rule_sections_service_role ON public.discount_rule_sections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION_ENROLLMENTS  (owner-scoped; existing *_instructor_read policy activates)
-- A family reads enrollments for their own dancers. Writes happen server-side.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY section_enrollments_admin_all ON public.section_enrollments
  FOR ALL TO authenticated
  USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());

CREATE POLICY section_enrollments_parent_read ON public.section_enrollments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dancers d
      JOIN public.users u ON u.family_id = d.family_id
      WHERE d.id = section_enrollments.dancer_id
        AND u.id = auth.uid()
    )
  );

CREATE POLICY section_enrollments_service_role ON public.section_enrollments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- ORDER_LINE_ITEMS  (owner-scoped via registration_orders.parent_id)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY order_line_items_admin_all ON public.order_line_items
  FOR ALL TO authenticated
  USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());

CREATE POLICY order_line_items_parent_read ON public.order_line_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.registration_orders ro
      WHERE ro.id = order_line_items.batch_id
        AND ro.parent_id = auth.uid()
    )
  );

CREATE POLICY order_line_items_service_role ON public.order_line_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- COUPON_REDEMPTIONS  (owner-scoped via families → users.family_id)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY coupon_redemptions_admin_all ON public.coupon_redemptions
  FOR ALL TO authenticated
  USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());

CREATE POLICY coupon_redemptions_parent_read ON public.coupon_redemptions
  FOR SELECT TO authenticated
  USING (
    coupon_redemptions.family_id = (
      SELECT u.family_id FROM public.users u WHERE u.id = auth.uid()
    )
  );

CREATE POLICY coupon_redemptions_service_role ON public.coupon_redemptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- AUDITION_BOOKINGS  (owner-scoped via parent_id = auth.uid())
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY audition_bookings_admin_all ON public.audition_bookings
  FOR ALL TO authenticated
  USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());

CREATE POLICY audition_bookings_parent_read ON public.audition_bookings
  FOR SELECT TO authenticated
  USING (parent_id = auth.uid());

CREATE POLICY audition_bookings_parent_insert ON public.audition_bookings
  FOR INSERT TO authenticated
  WITH CHECK (parent_id = auth.uid());

CREATE POLICY audition_bookings_service_role ON public.audition_bookings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- SMS_NOTIFICATIONS  (owner reads their own; admin/service full)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY sms_notifications_admin_all ON public.sms_notifications
  FOR ALL TO authenticated
  USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());

CREATE POLICY sms_notifications_owner_read ON public.sms_notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY sms_notifications_service_role ON public.sms_notifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- MEDIA_FOLDERS  (admin-managed; mirrors media_images)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY media_folders_admin_all ON public.media_folders
  FOR ALL TO authenticated
  USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());

CREATE POLICY media_folders_service_role ON public.media_folders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- CLASS_INVITES  (family reads invites for their own dancers; admin/service full)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY class_invites_admin_all ON public.class_invites
  FOR ALL TO authenticated
  USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());

CREATE POLICY class_invites_parent_read ON public.class_invites
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dancers d
      JOIN public.users u ON u.family_id = d.family_id
      WHERE d.id = class_invites.dancer_id
        AND u.id = auth.uid()
    )
  );

CREATE POLICY class_invites_service_role ON public.class_invites
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- INVITE_EVENTS  (analytics/audit; admin + service only)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY invite_events_admin_all ON public.invite_events
  FOR ALL TO authenticated
  USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());

CREATE POLICY invite_events_service_role ON public.invite_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
