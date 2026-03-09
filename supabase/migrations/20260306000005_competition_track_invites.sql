-- ============================================================================
-- Competition Track: class visibility, audition sessions/bookings, invites
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend `classes` with visibility + enrollment_type
-- ----------------------------------------------------------------------------

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'hidden', 'invite_only')),
  ADD COLUMN IF NOT EXISTS enrollment_type TEXT NOT NULL DEFAULT 'standard'
    CHECK (enrollment_type IN ('standard', 'audition'));

-- Back-fill existing competition_track rows so they default to invite_only.
-- (Safe because is_competition_track was already the signal for this intent.)
UPDATE public.classes
SET visibility = 'invite_only', enrollment_type = 'audition'
WHERE is_competition_track = true;

-- ----------------------------------------------------------------------------
-- 2. audition_sessions — individual audition time slots for a competition class
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.audition_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id          UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  semester_id       UUID NOT NULL REFERENCES public.semesters(id) ON DELETE CASCADE,
  label             TEXT,                        -- e.g. "Monday 10 AM Slot"
  start_at          TIMESTAMPTZ NOT NULL,
  end_at            TIMESTAMPTZ NOT NULL,
  location          TEXT,
  capacity          INTEGER,                     -- NULL = unlimited
  price             NUMERIC(10,2),               -- NULL = free
  notes             TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audition_sessions_class_id
  ON public.audition_sessions(class_id);

CREATE INDEX IF NOT EXISTS idx_audition_sessions_semester_id
  ON public.audition_sessions(semester_id);

-- ----------------------------------------------------------------------------
-- 3. class_invites — per-class invitations (individual or shareable token)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.class_invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id     UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,

  -- invite_only  → one-to-one invite (email required, max_uses = 1 default)
  -- token_link   → shareable link (no email required, max_uses > 1 or NULL)
  -- hybrid       → shareable link also tracks an email
  access_type  TEXT NOT NULL DEFAULT 'invite_only'
    CHECK (access_type IN ('invite_only', 'token_link', 'hybrid')),

  email        TEXT,                             -- target email for individual invites
  dancer_id    UUID REFERENCES public.dancers(id) ON DELETE SET NULL,
  invite_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,

  expires_at   TIMESTAMPTZ,                      -- NULL = never expires
  max_uses     INTEGER DEFAULT 1,               -- NULL = unlimited uses
  use_count    INTEGER NOT NULL DEFAULT 0,

  status       TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'opened', 'registered', 'expired', 'revoked')),

  sent_at      TIMESTAMPTZ,
  created_by   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_invites_class_id
  ON public.class_invites(class_id);

CREATE INDEX IF NOT EXISTS idx_class_invites_invite_token
  ON public.class_invites(invite_token);

CREATE INDEX IF NOT EXISTS idx_class_invites_email
  ON public.class_invites(email);

CREATE INDEX IF NOT EXISTS idx_class_invites_dancer_id
  ON public.class_invites(dancer_id);

-- ----------------------------------------------------------------------------
-- 4. invite_events — immutable event log (open, click, register, etc.)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.invite_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id            UUID NOT NULL REFERENCES public.class_invites(id) ON DELETE CASCADE,
  event_type           TEXT NOT NULL
    CHECK (event_type IN ('sent', 'opened', 'clicked', 'registered', 'expired', 'revoked')),
  audition_booking_id  UUID,                     -- FK added after audition_bookings created
  ip_address           TEXT,
  user_agent           TEXT,
  metadata             JSONB NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invite_events_invite_id
  ON public.invite_events(invite_id);

-- ----------------------------------------------------------------------------
-- 5. audition_bookings — a student's confirmed spot in an audition session
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.audition_bookings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audition_session_id  UUID NOT NULL REFERENCES public.audition_sessions(id) ON DELETE CASCADE,
  class_id             UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  invite_id            UUID REFERENCES public.class_invites(id) ON DELETE SET NULL,

  -- Existing student path
  dancer_id            UUID REFERENCES public.dancers(id) ON DELETE SET NULL,
  parent_id            UUID REFERENCES public.users(id) ON DELETE SET NULL,

  -- Guest path (no account required)
  guest_name           TEXT,
  guest_email          TEXT,

  status               TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'cancelled', 'no_show')),

  amount_paid          NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_status       TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'paid', 'waived')),

  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A dancer / guest email can only book each audition session once
  CONSTRAINT uq_booking_dancer_session
    UNIQUE NULLS NOT DISTINCT (dancer_id, audition_session_id),
  CONSTRAINT uq_booking_guest_session
    UNIQUE NULLS NOT DISTINCT (guest_email, audition_session_id),

  -- Every booking must identify either an existing dancer or a guest
  CONSTRAINT chk_booking_identity
    CHECK (dancer_id IS NOT NULL OR guest_email IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_audition_bookings_session_id
  ON public.audition_bookings(audition_session_id);

CREATE INDEX IF NOT EXISTS idx_audition_bookings_dancer_id
  ON public.audition_bookings(dancer_id);

CREATE INDEX IF NOT EXISTS idx_audition_bookings_invite_id
  ON public.audition_bookings(invite_id);

-- Now that audition_bookings exists, add the deferred FK on invite_events
ALTER TABLE public.invite_events
  ADD CONSTRAINT fk_invite_events_booking
  FOREIGN KEY (audition_booking_id)
  REFERENCES public.audition_bookings(id)
  ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 6. RLS policies
-- ----------------------------------------------------------------------------

ALTER TABLE public.audition_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_invites       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audition_bookings   ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY admin_all_audition_sessions ON public.audition_sessions
  FOR ALL TO authenticated
  USING (public.is_admin_or_super())
  WITH CHECK (public.is_admin_or_super());

CREATE POLICY admin_all_class_invites ON public.class_invites
  FOR ALL TO authenticated
  USING (public.is_admin_or_super())
  WITH CHECK (public.is_admin_or_super());

CREATE POLICY admin_all_invite_events ON public.invite_events
  FOR ALL TO authenticated
  USING (public.is_admin_or_super())
  WITH CHECK (public.is_admin_or_super());

CREATE POLICY admin_all_audition_bookings ON public.audition_bookings
  FOR ALL TO authenticated
  USING (public.is_admin_or_super())
  WITH CHECK (public.is_admin_or_super());

-- Public (anon + authenticated) can SELECT audition_sessions and class_invites
-- only via the service-role server action; token validation uses service role key,
-- so we do NOT need a public SELECT policy here — server actions bypass RLS.

-- Parents can see their own bookings
CREATE POLICY parent_own_bookings ON public.audition_bookings
  FOR SELECT TO authenticated
  USING (parent_id = auth.uid());
