-- Tracks enrollment validation issues that occurred during registration.
-- Soft warnings: registration proceeded despite the flag — admin should review.
-- Hard blocks: registration was rejected — logged so admin can proactively assist.
CREATE TABLE public.enrollment_warnings (
  id                uuid    NOT NULL DEFAULT gen_random_uuid(),
  batch_id          uuid,   -- NULL when registration was hard-blocked (never committed)
  family_id         uuid,
  dancer_id         uuid    NOT NULL,
  session_id        uuid,
  semester_id       uuid    NOT NULL,
  warning_type      text    NOT NULL,
  enforcement       text    NOT NULL DEFAULT 'soft_warn',
  message           text    NOT NULL,
  requirement_id    uuid,
  is_reviewed       boolean NOT NULL DEFAULT false,
  reviewed_by       uuid,
  reviewed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT enrollment_warnings_pkey PRIMARY KEY (id),
  CONSTRAINT enrollment_warnings_enforcement_check
    CHECK (enforcement = ANY (ARRAY['soft_warn'::text, 'hard_block'::text]))
);

CREATE INDEX idx_enrollment_warnings_is_reviewed ON public.enrollment_warnings (is_reviewed);
CREATE INDEX idx_enrollment_warnings_semester_id ON public.enrollment_warnings (semester_id);
CREATE INDEX idx_enrollment_warnings_family_id   ON public.enrollment_warnings (family_id);

ALTER TABLE public.enrollment_warnings ENABLE ROW LEVEL SECURITY;

-- Admins can read and update; no public access.
CREATE POLICY "Admins can manage enrollment warnings"
  ON public.enrollment_warnings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );
