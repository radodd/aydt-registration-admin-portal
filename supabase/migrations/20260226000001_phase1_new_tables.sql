-- =============================================================================
-- Phase 1 — New Tables DDL
-- Creates all new normalized tables alongside existing ones.
--
-- Run this FIRST. The data migration (000002) runs second.
-- Take a full Supabase DB snapshot before running either file.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. classes  (curriculum entity — replaces sessions)
--    One row per instructional level within a discipline for a semester.
--    Examples: Ballet 1A, Tap 2, Hip Hop 3.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.classes (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_id           uuid          NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,

  -- Curriculum identity
  name                  text          NOT NULL,
  discipline            text          NOT NULL DEFAULT 'ballet',
  division              text          NOT NULL DEFAULT 'junior'
                        CHECK (division IN ('early_childhood', 'junior', 'senior', 'competition')),
  level                 text,                         -- "1A", "2", "Advanced"
  description           text,

  -- Eligibility
  min_age               integer,
  max_age               integer,

  -- Flags
  is_active             boolean       NOT NULL DEFAULT true,
  is_competition_track  boolean       NOT NULL DEFAULT false,
  requires_teacher_rec  boolean       NOT NULL DEFAULT false,

  -- Provenance (for clone tracking)
  cloned_from_class_id  uuid          REFERENCES public.classes(id) ON DELETE SET NULL,

  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_classes_semester_id  ON public.classes(semester_id);
CREATE INDEX IF NOT EXISTS idx_classes_division     ON public.classes(division);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. class_sessions  (time-slot — one per day/time offering within a class)
--    AYDT business meaning of "session": Ballet 1A — Monday 3:45 PM.
--    Students enroll in a class_session, not in a class.
--    A class meeting Mon + Thu has TWO rows here; both count toward
--    weekly_class_count for pricing.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.class_sessions (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id                uuid        NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  semester_id             uuid        NOT NULL REFERENCES public.semesters(id),  -- denormalized for query speed

  -- Schedule (nullable during data migration; tighten constraints after data verified)
  day_of_week             text        NOT NULL
                          CHECK (day_of_week IN (
                            'monday', 'tuesday', 'wednesday', 'thursday',
                            'friday', 'saturday', 'sunday'
                          )),
  start_time              time,
  end_time                time,
  start_date              date,
  end_date                date,

  -- Logistics
  location                text,
  instructor_name         text,

  -- Capacity
  capacity                integer,
  registration_close_at   timestamptz,

  -- Flags
  is_active               boolean     NOT NULL DEFAULT true,

  -- Provenance
  cloned_from_session_id  uuid        REFERENCES public.class_sessions(id) ON DELETE SET NULL,

  created_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT no_duplicate_class_slot UNIQUE (class_id, day_of_week, start_time)
);

CREATE INDEX IF NOT EXISTS idx_class_sessions_class_id    ON public.class_sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_class_sessions_semester_id ON public.class_sessions(semester_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. session_occurrence_dates  (individual calendar dates for a class_session)
--    Replaces session_available_days.
--    Used for attendance tracking, makeup scheduling, holiday cancellations,
--    and displaying the date picker in the registration flow.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.session_occurrence_dates (
  id                    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid    NOT NULL REFERENCES public.class_sessions(id) ON DELETE CASCADE,

  date                  date    NOT NULL,
  is_cancelled          boolean NOT NULL DEFAULT false,
  cancellation_reason   text,

  created_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE(session_id, date)
);

CREATE INDEX IF NOT EXISTS idx_occurrence_dates_session_id ON public.session_occurrence_dates(session_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. tuition_rate_bands  (Excel tuition chart expressed as DB rows)
--    Authoritative pricing source. Admin populates from the Excel chart.
--    Volume discounts ARE already baked in — do NOT apply them again.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tuition_rate_bands (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_id           uuid          NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,

  division              text          NOT NULL
                        CHECK (division IN ('early_childhood', 'junior', 'senior', 'competition')),
  weekly_class_count    integer       NOT NULL CHECK (weekly_class_count > 0),

  base_tuition          numeric(10,2) NOT NULL,
  recital_fee_included  numeric(10,2) NOT NULL DEFAULT 0,
  notes                 text,

  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now(),

  UNIQUE(semester_id, division, weekly_class_count)
);

CREATE INDEX IF NOT EXISTS idx_rate_bands_semester_division ON public.tuition_rate_bands(semester_id, division);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. semester_fee_config  (per-semester admin-configurable fee constants)
--    Separate from rate bands — covers registration fee, family discount, auto-pay.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.semester_fee_config (
  semester_id                   uuid          PRIMARY KEY REFERENCES public.semesters(id) ON DELETE CASCADE,

  registration_fee_per_child    numeric(10,2) NOT NULL DEFAULT 40.00,
  family_discount_amount        numeric(10,2) NOT NULL DEFAULT 50.00,
  auto_pay_admin_fee_monthly    numeric(10,2) NOT NULL DEFAULT 5.00,
  auto_pay_installment_count    integer       NOT NULL DEFAULT 5,

  created_at                    timestamptz   NOT NULL DEFAULT now(),
  updated_at                    timestamptz   NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. class_requirements  (prerequisites + concurrent enrollment rules)
--    Enforced at registration time by the validation engine (Phase 3).
--    Created now so admins can populate them in Phase 1.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.class_requirements (
  id                    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id              uuid    NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,

  requirement_type      text    NOT NULL
                        CHECK (requirement_type IN (
                          'prerequisite_completed',
                          'concurrent_enrollment',
                          'teacher_recommendation',
                          'skill_qualification',
                          'audition_required'
                        )),

  -- For prerequisite_completed / skill_qualification
  required_discipline   text,
  required_level        text,

  -- For concurrent_enrollment
  required_class_id     uuid    REFERENCES public.classes(id) ON DELETE SET NULL,

  description           text    NOT NULL,

  enforcement           text    NOT NULL DEFAULT 'hard_block'
                        CHECK (enforcement IN ('soft_warn', 'hard_block')),
  is_waivable           boolean NOT NULL DEFAULT false,

  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_requirements_class_id ON public.class_requirements(class_id);
