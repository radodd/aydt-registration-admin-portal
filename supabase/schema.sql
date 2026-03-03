--
-- PostgreSQL database dump
--

\restrict O1dcw6cgMRlrfKZX5DzCYLrgwQXyNIDt3v0xkuluumfYCoQFnEMZUnJdlbwOssP

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'USER'
);


--
-- Name: check_registration_time_conflict(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_registration_time_conflict() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  new_day        TEXT;
  new_start      TIME;
  new_end        TIME;
  new_semester   UUID;
  conflict_class TEXT;
BEGIN
  -- Only check active registrations (ignore cancellations)
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- Fetch the new session's schedule
  SELECT
    cs.day_of_week,
    cs.start_time::TIME,
    cs.end_time::TIME,
    cs.semester_id
  INTO new_day, new_start, new_end, new_semester
  FROM public.class_sessions cs
  WHERE cs.id = NEW.session_id;

  -- If times are unset, skip the check
  IF new_start IS NULL OR new_end IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check for an overlapping registration for this dancer in the same semester
  SELECT c.name INTO conflict_class
  FROM public.registrations r
  JOIN public.class_sessions cs ON cs.id = r.session_id
  JOIN public.classes c         ON c.id  = cs.class_id
  WHERE r.dancer_id       = NEW.dancer_id
    AND r.status          != 'cancelled'
    AND r.id              != NEW.id          -- exclude self on UPDATE
    AND cs.semester_id    = new_semester
    AND cs.day_of_week    = new_day
    AND cs.start_time     IS NOT NULL
    AND cs.end_time       IS NOT NULL
    AND cs.start_time::TIME < new_end
    AND cs.end_time::TIME   > new_start
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Time conflict: this dancer already has "%" on % that overlaps with the requested session.',
      conflict_class, new_day
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  V_FAMILY_ID UUID;
  V_ROLE      TEXT;
BEGIN
  -- Honour a role hint passed in raw_user_meta_data (e.g. admin seeding).
  -- Falls back to 'parent' for every public-facing signup.
  V_ROLE := COALESCE(NEW.RAW_USER_META_DATA->>'role', 'parent');

  -- Only create a family for parent accounts.
  IF V_ROLE = 'parent' THEN
    INSERT INTO public.FAMILIES DEFAULT VALUES
    RETURNING ID INTO V_FAMILY_ID;
  END IF;

  INSERT INTO public.USERS (
    ID, FAMILY_ID, EMAIL, FIRST_NAME, LAST_NAME, ROLE
  ) VALUES (
    NEW.ID,
    V_FAMILY_ID,
    NEW.EMAIL,
    COALESCE(NEW.RAW_USER_META_DATA->>'first_name', ''),
    COALESCE(NEW.RAW_USER_META_DATA->>'last_name',  ''),
    V_ROLE
  )
  ON CONFLICT (ID) DO NOTHING;

  RETURN NEW;
END;
$$;


--
-- Name: is_admin_or_super(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin_or_super() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM USERS
    WHERE ID = auth.uid()
      AND ROLE IN ('admin','super_admin')
  );
$$;


--
-- Name: is_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_super_admin() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM USERS
    WHERE ID = auth.uid()
      AND ROLE = 'super_admin'
  );
$$;


--
-- Name: prevent_child_modification_if_semester_published(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_child_modification_if_semester_published() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  target_semester_id uuid;
  semester_status    text;
  reg_count          integer;
begin
  target_semester_id := coalesce(new.semester_id, old.semester_id);

  select status into semester_status
  from semesters
  where id = target_semester_id;

  if semester_status is distinct from 'published' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  select count(*) into reg_count
  from registrations r
  join class_sessions s on s.id = r.session_id
  where s.semester_id = target_semester_id;

  if reg_count > 0 then
    raise exception 'Cannot modify records for a published semester with registrations';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;


--
-- Name: prevent_semester_core_edit_if_published(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_semester_core_edit_if_published() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  reg_count integer;
begin
  if old.status = 'published' then

    select count(*) into reg_count
    from registrations r
    join class_sessions s on s.id = r.session_id
    where s.semester_id = old.id;

    if reg_count > 0 then
      if (
        new.registration_form  is distinct from old.registration_form or
        new.confirmation_email is distinct from old.confirmation_email or
        new.waitlist_settings  is distinct from old.waitlist_settings
      ) then
        raise exception
          'Cannot modify registration form, confirmation email, or waitlist settings for a published semester with registrations';
      end if;
    end if;

  end if;

  return new;
end;
$$;


--
-- Name: prevent_session_group_structure_if_published(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_session_group_structure_if_published() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  target_semester_id uuid;
  semester_status    text;
  reg_count          integer;
begin
  if tg_table_name = 'session_groups' then
    target_semester_id := coalesce(new.semester_id, old.semester_id);

  elsif tg_table_name = 'session_group_sessions' then
    select sg.semester_id into target_semester_id
    from session_groups sg
    where sg.id = coalesce(new.session_group_id, old.session_group_id);

  elsif tg_table_name = 'session_group_tags' then
    select sg.semester_id into target_semester_id
    from session_groups sg
    where sg.id = coalesce(new.session_group_id, old.session_group_id);

  elsif tg_table_name = 'session_tags' then
    select s.semester_id into target_semester_id
    from class_sessions s
    where s.id = coalesce(new.session_id, old.session_id);
  end if;

  select status into semester_status
  from semesters
  where id = target_semester_id;

  if semester_status = 'published' then

    select count(*) into reg_count
    from registrations r
    join class_sessions s on s.id = r.session_id
    where s.semester_id = target_semester_id;

    if reg_count > 0 then
      raise exception
        'Cannot modify session grouping structure for a published semester with registrations';
    end if;

  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;


--
-- Name: prevent_session_reparenting(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_session_reparenting() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.SEMESTER_ID IS DISTINCT FROM NEW.SEMESTER_ID THEN
    RAISE EXCEPTION 'Cannot change semester_id of an existing session (ownership is immutable)';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: process_overdue_payments_cron(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_overdue_payments_cron() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  edge_url  text;
  svc_key   text;
BEGIN
  -- Resolve the Edge Function URL from the stored setting
  -- (set with: SELECT set_config('app.supabase_url', '...', false))
  -- Falls back to a sensible default for the known project.
  edge_url := current_setting('app.supabase_url', true)
              || '/functions/v1/process-overdue-payments';

  svc_key  := current_setting('app.service_role_key', true);

  PERFORM net.http_post(
    url     := edge_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body    := '{}'::jsonb
  );
END;
$$;


--
-- Name: process_schedule_email_cron(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_schedule_email_cron() RETURNS void
    LANGUAGE plpgsql
    AS $$ BEGIN PERFORM net.http_post(
  url := 'https://bulplzknfbietpmdfwlk.supabase.co/functions/process-schedule-email',
   headers := jsonb_build_object(
  'Content-Type', 'application/json',
  'Authorization', 'Bearer <eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1bHBsemtuZmJpZXRwbWRmd2xrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjQ0MTkxMCwiZXhwIjoyMDc4MDE3OTEwfQ.SsYb-G7U76iqIMm0_fXaeEyeQARJrJMD4mphvxvGRhQ>'
),
    body    := '{}'::jsonb
);
END;
$$;


--
-- Name: process_scheduled_emails_cron(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_scheduled_emails_cron() RETURNS void
    LANGUAGE plpgsql
    AS $$ BEGIN PERFORM net.http_post(
  url := 'https://bulplzknfbietpmdfwlk.supabase.co/functions/v1/process-scheduled-emails',
   headers := jsonb_build_object(
  'Content-Type', 'application/json',
  'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1bHBsemtuZmJpZXRwbWRmd2xrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjQ0MTkxMCwiZXhwIjoyMDc4MDE3OTEwfQ.SsYb-G7U76iqIMm0_fXaeEyeQARJrJMD4mphvxvGRhQ'
),
    body    := '{}'::jsonb
);
END;
$$;


--
-- Name: process_waitlist_cron(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_waitlist_cron() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://bulplzknfbietpmdfwlk.supabase.co/functions/v1/process-waitlist',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
END;
$$;


--
-- Name: publish_due_semesters(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_due_semesters() RETURNS void
    LANGUAGE sql
    AS $$
  UPDATE SEMESTERS
  SET STATUS = 'published', PUBLISHED_AT = NOW()
  WHERE STATUS = 'scheduled'
    AND PUBLISH_AT <= NOW();
$$;


--
-- Name: publish_semester(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_semester(p_semester_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE SEMESTERS
  SET STATUS = 'published', PUBLISH_AT = NOW(), PUBLISHED_AT = NOW()
  WHERE ID = P_SEMESTER_ID;
END;
$$;


--
-- Name: update_media_images_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_media_images_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.UPDATED_AT = NOW(); RETURN NEW; END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.UPDATED_AT = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: authorized_pickups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.authorized_pickups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid,
    first_name text NOT NULL,
    last_name text NOT NULL,
    phone_number text,
    relation text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: batch_payment_installments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.batch_payment_installments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    installment_number integer NOT NULL,
    amount_due numeric(10,2) NOT NULL,
    due_date date NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    paid_at timestamp with time zone,
    paid_amount numeric(10,2),
    payment_reference_id text,
    failure_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT batch_payment_installments_installment_number_check CHECK ((installment_number > 0)),
    CONSTRAINT batch_payment_installments_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'paid'::text, 'overdue'::text, 'waived'::text, 'processing'::text])))
);


--
-- Name: class_requirements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_requirements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    requirement_type text NOT NULL,
    required_discipline text,
    required_level text,
    required_class_id uuid,
    description text NOT NULL,
    enforcement text DEFAULT 'hard_block'::text NOT NULL,
    is_waivable boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT class_requirements_enforcement_check CHECK ((enforcement = ANY (ARRAY['soft_warn'::text, 'hard_block'::text]))),
    CONSTRAINT class_requirements_requirement_type_check CHECK ((requirement_type = ANY (ARRAY['prerequisite_completed'::text, 'concurrent_enrollment'::text, 'teacher_recommendation'::text, 'skill_qualification'::text, 'audition_required'::text])))
);


--
-- Name: class_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    semester_id uuid NOT NULL,
    day_of_week text NOT NULL,
    start_time time without time zone,
    end_time time without time zone,
    start_date date,
    end_date date,
    location text,
    instructor_name text,
    capacity integer,
    registration_close_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    cloned_from_session_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT class_sessions_day_of_week_check CHECK ((day_of_week = ANY (ARRAY['monday'::text, 'tuesday'::text, 'wednesday'::text, 'thursday'::text, 'friday'::text, 'saturday'::text, 'sunday'::text])))
);


--
-- Name: classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    semester_id uuid NOT NULL,
    name text NOT NULL,
    discipline text DEFAULT 'ballet'::text NOT NULL,
    division text DEFAULT 'junior'::text NOT NULL,
    level text,
    description text,
    min_age integer,
    max_age integer,
    is_active boolean DEFAULT true NOT NULL,
    is_competition_track boolean DEFAULT false NOT NULL,
    requires_teacher_rec boolean DEFAULT false NOT NULL,
    cloned_from_class_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT classes_division_check CHECK ((division = ANY (ARRAY['early_childhood'::text, 'junior'::text, 'senior'::text, 'competition'::text])))
);


--
-- Name: dancers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dancers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid,
    user_id uuid,
    first_name text NOT NULL,
    middle_name text,
    last_name text NOT NULL,
    gender text,
    birth_date date,
    grade text,
    email text,
    phone_number text,
    address_line1 text,
    address_line2 text,
    city text,
    state text,
    zipcode text,
    is_self boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: discount_rule_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discount_rule_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    discount_id uuid NOT NULL,
    session_id uuid
);


--
-- Name: discount_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discount_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    discount_id uuid NOT NULL,
    rule_type text NOT NULL,
    threshold integer NOT NULL,
    threshold_unit text NOT NULL,
    value numeric(10,2) NOT NULL,
    value_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT discount_rules_rule_type_check CHECK ((rule_type = ANY (ARRAY['multi_person'::text, 'multi_session'::text]))),
    CONSTRAINT discount_rules_threshold_check CHECK ((threshold > 0)),
    CONSTRAINT discount_rules_threshold_unit_check CHECK ((threshold_unit = ANY (ARRAY['person'::text, 'session'::text]))),
    CONSTRAINT discount_rules_value_check CHECK ((value >= (0)::numeric)),
    CONSTRAINT discount_rules_value_type_check CHECK ((value_type = ANY (ARRAY['flat'::text, 'percent'::text])))
);


--
-- Name: discounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    eligible_sessions_mode text NOT NULL,
    give_session_scope text NOT NULL,
    recipient_scope text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT discounts_category_check CHECK ((category = ANY (ARRAY['multi_person'::text, 'multi_session'::text, 'custom'::text]))),
    CONSTRAINT discounts_eligible_sessions_mode_check CHECK ((eligible_sessions_mode = ANY (ARRAY['all'::text, 'selected'::text]))),
    CONSTRAINT discounts_recipient_scope_check CHECK ((recipient_scope = ANY (ARRAY['threshold_only'::text, 'threshold_and_additional'::text])))
);


--
-- Name: email_activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email_id uuid NOT NULL,
    action text NOT NULL,
    admin_id uuid NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_activity_logs_action_check CHECK ((action = ANY (ARRAY['created'::text, 'edited'::text, 'scheduled'::text, 'sent'::text, 'cancelled'::text, 'cloned'::text, 'deleted'::text])))
);


--
-- Name: email_analytics; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.email_analytics AS
SELECT
    NULL::uuid AS id,
    NULL::text AS subject,
    NULL::timestamp with time zone AS sent_at,
    NULL::text AS sender_name,
    NULL::bigint AS recipient_count,
    NULL::bigint AS delivered_count,
    NULL::bigint AS opened_count,
    NULL::bigint AS clicked_count,
    NULL::bigint AS bounced_count,
    NULL::numeric AS open_rate,
    NULL::numeric AS click_rate;


--
-- Name: email_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email_id uuid NOT NULL,
    user_id uuid NOT NULL,
    email_address text NOT NULL,
    resend_message_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    delivered_at timestamp with time zone,
    bounced_at timestamp with time zone,
    opened_at timestamp with time zone,
    clicked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_deliveries_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'bounced'::text, 'complained'::text])))
);


--
-- Name: email_recipient_selections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_recipient_selections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email_id uuid NOT NULL,
    selection_type text NOT NULL,
    semester_id uuid,
    user_id uuid,
    is_excluded boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    session_id uuid,
    CONSTRAINT email_recipient_selections_selection_type_check CHECK ((selection_type = ANY (ARRAY['semester'::text, 'session'::text, 'manual'::text])))
);


--
-- Name: email_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email_id uuid NOT NULL,
    user_id uuid NOT NULL,
    email_address text NOT NULL,
    first_name text DEFAULT ''::text NOT NULL,
    last_name text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_subscriptions (
    user_id uuid NOT NULL,
    is_subscribed boolean DEFAULT true NOT NULL,
    unsubscribed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    body_html text DEFAULT ''::text NOT NULL,
    body_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by_admin_id uuid NOT NULL,
    updated_by_admin_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    body_html text DEFAULT ''::text NOT NULL,
    body_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    scheduled_at timestamp with time zone,
    sent_at timestamp with time zone,
    sender_name text DEFAULT ''::text NOT NULL,
    sender_email text DEFAULT ''::text NOT NULL,
    reply_to_email text,
    include_signature boolean DEFAULT false NOT NULL,
    created_by_admin_id uuid NOT NULL,
    updated_by_admin_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT emails_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'sent'::text, 'cancelled'::text, 'sending'::text, 'failed'::text])))
);


--
-- Name: families; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.families (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: media_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    display_name text NOT NULL,
    storage_path text NOT NULL,
    public_url text NOT NULL,
    folder text DEFAULT 'general'::text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    mime_type text NOT NULL,
    size_bytes integer NOT NULL,
    width integer,
    height integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    registration_batch_id uuid NOT NULL,
    order_id text,
    payment_session_id text,
    transaction_id text,
    custom_reference text NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    state text DEFAULT 'initiated'::text NOT NULL,
    event_type text,
    raw_notification jsonb,
    raw_transaction jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payments_state_check CHECK ((state = ANY (ARRAY['initiated'::text, 'pending_authorization'::text, 'authorized'::text, 'captured'::text, 'settled'::text, 'declined'::text, 'voided'::text, 'refunded'::text, 'held_for_review'::text])))
);


--
-- Name: registration_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registration_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid,
    semester_id uuid NOT NULL,
    cart_snapshot jsonb DEFAULT '[]'::jsonb NOT NULL,
    payment_intent_id text,
    stripe_amount_cents integer,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    confirmed_at timestamp with time zone,
    family_id uuid,
    tuition_total numeric(10,2),
    registration_fee_total numeric(10,2),
    recital_fee_total numeric(10,2),
    family_discount_amount numeric(10,2) DEFAULT 0 NOT NULL,
    auto_pay_admin_fee_total numeric(10,2) DEFAULT 0 NOT NULL,
    grand_total numeric(10,2),
    payment_plan_type text,
    amount_due_now numeric(10,2),
    payment_reference_id text,
    CONSTRAINT registration_batches_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'failed'::text, 'refunded'::text])))
);


--
-- Name: registration_days; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registration_days (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    registration_id uuid NOT NULL,
    available_day_id uuid NOT NULL,
    day date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dancer_id uuid,
    user_id uuid,
    batch_id uuid,
    status text DEFAULT 'pending_payment'::text NOT NULL,
    payment_intent_id text,
    stripe_amount_cents integer,
    form_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    total_amount numeric(10,2),
    hold_expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    session_id uuid,
    registration_batch_id uuid,
    CONSTRAINT registrations_status_check CHECK ((status = ANY (ARRAY['pending_payment'::text, 'confirmed'::text, 'cancelled'::text])))
);


--
-- Name: requirement_waivers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.requirement_waivers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_requirement_id uuid NOT NULL,
    dancer_id uuid NOT NULL,
    granted_by_admin_id uuid,
    notes text,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone
);


--
-- Name: semester_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.semester_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    semester_id uuid NOT NULL,
    action text NOT NULL,
    performed_by uuid,
    changes jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: semester_discounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.semester_discounts (
    semester_id uuid NOT NULL,
    discount_id uuid NOT NULL
);


--
-- Name: semester_fee_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.semester_fee_config (
    semester_id uuid NOT NULL,
    registration_fee_per_child numeric(10,2) DEFAULT 40.00 NOT NULL,
    family_discount_amount numeric(10,2) DEFAULT 50.00 NOT NULL,
    auto_pay_admin_fee_monthly numeric(10,2) DEFAULT 5.00 NOT NULL,
    auto_pay_installment_count integer DEFAULT 5 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: semester_payment_installments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.semester_payment_installments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    semester_id uuid NOT NULL,
    installment_number integer NOT NULL,
    amount numeric(10,2) NOT NULL,
    due_date date NOT NULL
);


--
-- Name: semester_payment_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.semester_payment_plans (
    semester_id uuid NOT NULL,
    type text NOT NULL,
    deposit_amount numeric(10,2),
    deposit_percent numeric(5,2),
    installment_count integer,
    due_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT semester_payment_plans_type_check CHECK ((type = ANY (ARRAY['pay_in_full'::text, 'deposit_flat'::text, 'deposit_percent'::text, 'installments'::text])))
);


--
-- Name: semesters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.semesters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    tracking_mode boolean DEFAULT false,
    capacity_warning_threshold integer,
    registration_form jsonb DEFAULT '{"elements": []}'::jsonb NOT NULL,
    confirmation_email jsonb DEFAULT '{}'::jsonb NOT NULL,
    waitlist_settings jsonb DEFAULT '{"enabled": false, "inviteExpiryHours": 48, "stopDaysBeforeClose": 3}'::jsonb NOT NULL,
    publish_at timestamp with time zone,
    published_at timestamp with time zone,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT semesters_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'published'::text, 'archived'::text])))
);


--
-- Name: session_group_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_group_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_group_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    session_id uuid
);


--
-- Name: session_group_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_group_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_group_id uuid NOT NULL,
    tag text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: session_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    semester_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: session_occurrence_dates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_occurrence_dates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    date date NOT NULL,
    is_cancelled boolean DEFAULT false NOT NULL,
    cancellation_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: session_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    tag text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tuition_rate_bands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tuition_rate_bands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    semester_id uuid NOT NULL,
    division text NOT NULL,
    weekly_class_count integer NOT NULL,
    base_tuition numeric(10,2) NOT NULL,
    recital_fee_included numeric(10,2) DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tuition_rate_bands_division_check CHECK ((division = ANY (ARRAY['early_childhood'::text, 'junior'::text, 'senior'::text, 'competition'::text]))),
    CONSTRAINT tuition_rate_bands_weekly_class_count_check CHECK ((weekly_class_count > 0))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    family_id uuid,
    email text NOT NULL,
    first_name text NOT NULL,
    middle_name text,
    last_name text NOT NULL,
    phone_number text,
    is_primary_parent boolean DEFAULT false NOT NULL,
    role text DEFAULT 'super_admin'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    display_name text,
    signature_html text,
    reply_to_email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'parent'::text])))
);


--
-- Name: waitlist_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waitlist_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dancer_id uuid NOT NULL,
    "position" integer NOT NULL,
    status text DEFAULT 'waiting'::text NOT NULL,
    invite_token uuid DEFAULT gen_random_uuid() NOT NULL,
    invitation_sent_at timestamp with time zone,
    invitation_expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    session_id uuid,
    CONSTRAINT waitlist_entries_status_check CHECK ((status = ANY (ARRAY['waiting'::text, 'invited'::text, 'expired'::text, 'accepted'::text, 'declined'::text])))
);


--
-- Data for Name: authorized_pickups; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.authorized_pickups (id, family_id, first_name, last_name, phone_number, relation, created_at) FROM stdin;
\.


--
-- Data for Name: batch_payment_installments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.batch_payment_installments (id, batch_id, installment_number, amount_due, due_date, status, paid_at, paid_amount, payment_reference_id, failure_reason, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: class_requirements; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.class_requirements (id, class_id, requirement_type, required_discipline, required_level, required_class_id, description, enforcement, is_waivable, created_at) FROM stdin;
\.


--
-- Data for Name: class_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.class_sessions (id, class_id, semester_id, day_of_week, start_time, end_time, start_date, end_date, location, instructor_name, capacity, registration_close_at, is_active, cloned_from_session_id, created_at) FROM stdin;
ffc504f7-9376-4112-86b4-b8ca0efcf792	0b7efc5a-013f-47ff-811b-f86be413646d	f40ff953-cfcd-4069-8042-0e7139fa6cd6	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	\N	2026-02-27 04:13:11.876096+00
d43e063d-8764-48ef-8158-41b4cad86eff	7ba90ec1-6a98-437d-817f-19e47cb29877	f40ff953-cfcd-4069-8042-0e7139fa6cd6	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	\N	2026-02-27 04:13:11.876096+00
d7767cf7-0946-4289-bbdc-d5f8ac40da70	6022c11f-b909-4234-8a99-e849ea2d4d97	f40ff953-cfcd-4069-8042-0e7139fa6cd6	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	\N	2026-02-27 04:13:11.876096+00
aed79809-09fb-4df0-bb4a-085db4714177	ad712725-3201-4082-880b-ff23453d38ce	f40ff953-cfcd-4069-8042-0e7139fa6cd6	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	\N	2026-02-27 04:13:11.876096+00
36404f2f-308d-46ca-953b-29043968f873	5cee5e54-d8e5-4ea1-93fc-8432aa3996a4	f40ff953-cfcd-4069-8042-0e7139fa6cd6	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	\N	2026-02-27 04:13:11.876096+00
9cca32cd-63ed-4ff2-b8b4-dc54df1f8449	59f48070-08e7-4205-88d8-44fad684c229	f40ff953-cfcd-4069-8042-0e7139fa6cd6	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	\N	2026-02-27 04:13:11.876096+00
805d8220-89f9-4ccf-8037-9759f62a22e3	363f64f0-6bc2-4a1d-b2f9-7a1cf4172d02	f40ff953-cfcd-4069-8042-0e7139fa6cd6	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	\N	2026-02-27 04:13:11.876096+00
56f8a32b-3403-46a0-ba5f-f2c5883d8f64	461c351c-d0d3-41f9-b407-53d651f8b867	f40ff953-cfcd-4069-8042-0e7139fa6cd6	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	\N	2026-02-27 04:13:11.876096+00
597f3e37-4625-49c7-b767-fccd9e22af86	392270a0-182d-43d3-b484-988f19b2506b	f40ff953-cfcd-4069-8042-0e7139fa6cd6	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	\N	2026-02-27 04:13:11.876096+00
8057d1a7-6229-4b52-abd6-dadd11c299a4	3559d461-45ba-4197-89b6-d2a2ff1a1a97	f40ff953-cfcd-4069-8042-0e7139fa6cd6	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	\N	2026-02-27 04:13:11.876096+00
7a8c5e48-2062-4b0e-94e4-af3c1b36bede	7e6eb397-c22e-476d-a67c-f35ccd66201b	f40ff953-cfcd-4069-8042-0e7139fa6cd6	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	\N	2026-02-27 04:13:11.876096+00
465a983e-05de-4b0d-abe9-23f3edc219a2	21b9c398-da46-4978-8a78-a3f4f5c9616d	f40ff953-cfcd-4069-8042-0e7139fa6cd6	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	\N	2026-02-27 04:13:11.876096+00
553e3502-f09f-44e0-a3bf-3c993e86be1b	e3f1b49f-914b-4416-b483-f06f8ba65ca5	f40ff953-cfcd-4069-8042-0e7139fa6cd6	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	\N	2026-02-27 04:13:11.876096+00
043130bd-aaf0-4518-96be-a5ea4a6f66da	87fa6879-ce66-41d5-aca7-c8c19683f872	f40ff953-cfcd-4069-8042-0e7139fa6cd6	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	\N	2026-02-27 04:13:11.876096+00
4208ab48-c6fd-49dd-be5f-b1ab79a45b22	77365c71-e7dd-43f6-9f28-2b832dd8cc58	f40ff953-cfcd-4069-8042-0e7139fa6cd6	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	\N	2026-02-27 04:13:11.876096+00
8c5599f8-edad-4140-9b13-3911d34bd54c	8a3976dd-5a1a-4992-b45e-399128f35080	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	805d8220-89f9-4ccf-8037-9759f62a22e3	2026-02-27 15:33:03.474936+00
562e5105-65bd-41cc-987f-55f0be6d9bea	85af616d-bdbe-4e41-920a-f6b8235d3829	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	aed79809-09fb-4df0-bb4a-085db4714177	2026-02-27 18:22:16.352375+00
67ae7f9d-97a3-4ea1-93de-5a510964452c	ee44349c-4f26-4676-b5b9-334d763f4939	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	7a8c5e48-2062-4b0e-94e4-af3c1b36bede	2026-02-27 15:33:04.053314+00
c5440b64-e454-4d7d-ad10-845945278f7a	849fccab-d95f-45d5-b439-abcf4f2d17b1	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	805d8220-89f9-4ccf-8037-9759f62a22e3	2026-02-27 18:22:16.876095+00
b70829c4-6d07-4941-9a72-3a3cd97f15a7	78477db2-da61-4435-b49c-049ea11e0872	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	56f8a32b-3403-46a0-ba5f-f2c5883d8f64	2026-02-27 15:33:03.613783+00
a112b465-08d7-4c79-9c35-9ffd38e9626d	5b7f551a-4d18-4ddd-88bc-dc17694963b9	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	8057d1a7-6229-4b52-abd6-dadd11c299a4	2026-02-27 18:22:17.304683+00
63fc6a6b-c09b-420e-8d90-ad4193b2d6b3	df811edf-959b-4e36-aa08-a6e91c0acc94	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	d7767cf7-0946-4289-bbdc-d5f8ac40da70	2026-02-27 15:33:02.741175+00
0d51e747-61ee-4595-9d9c-a170f32a6706	116f0141-cdec-438c-8aa6-e964091afceb	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	043130bd-aaf0-4518-96be-a5ea4a6f66da	2026-02-27 15:33:04.432585+00
2c820960-20a7-4dff-8b99-7ad7c161f2d3	681f5561-a532-4148-83c9-80bb56395c01	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	ffc504f7-9376-4112-86b4-b8ca0efcf792	2026-02-27 15:33:02.074002+00
7636bf36-d72e-4e27-90c8-9106e5e7b6ae	60eafe66-f063-47b0-957c-31a9e54058ec	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	36404f2f-308d-46ca-953b-29043968f873	2026-02-27 15:33:03.149626+00
ff959145-caf5-4cdc-bf62-c53e5081a324	a8215262-0a8c-4a32-a907-5680ee4fcfea	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	d7767cf7-0946-4289-bbdc-d5f8ac40da70	2026-02-27 18:22:16.181017+00
d54083b3-8e29-4d7e-9f68-e7d92e0c37d2	e7309a6e-bb33-4797-b451-0654139f3547	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	tuesday	16:00:00	17:00:00	2026-02-28	2026-03-21	Upper East Side Studio	\N	18	2026-03-06 18:28:00+00	t	56f8a32b-3403-46a0-ba5f-f2c5883d8f64	2026-02-27 18:22:17.025636+00
f3c0b98e-7b9f-426d-aba5-fbb2ff11d0b6	678e9661-a756-4efc-a973-1e2ed160904d	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	553e3502-f09f-44e0-a3bf-3c993e86be1b	2026-02-27 15:33:04.305914+00
bbb59df8-644c-47a9-8dc1-d065d9e79869	54b71a7e-8883-4232-8633-ad0a710f27cc	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	aed79809-09fb-4df0-bb4a-085db4714177	2026-02-27 15:33:02.900091+00
88954e69-739f-4e7d-b968-89a83be56d75	c75f5a3e-97ae-41f3-aa56-4d723afdd9f5	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	d43e063d-8764-48ef-8158-41b4cad86eff	2026-02-27 15:33:02.442686+00
248ac18b-4fa9-4611-8f41-806c8b9a75dc	b23ed08b-37d3-409a-89e9-f5ab5876c0cd	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	465a983e-05de-4b0d-abe9-23f3edc219a2	2026-02-27 15:33:04.177763+00
308b5a34-f360-44ab-bc1c-ec1183265c10	f1c443aa-f949-437b-9044-c9a11a03ba0f	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	597f3e37-4625-49c7-b767-fccd9e22af86	2026-02-27 15:33:03.751941+00
3580efd0-e953-48cc-b8c2-81568c7c2cbd	88e8e440-53a4-47f5-8e3c-d0385586b58e	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	9cca32cd-63ed-4ff2-b8b4-dc54df1f8449	2026-02-27 15:33:03.297489+00
290c7258-dda2-423e-94ee-c27a975678e2	69d4a86d-6c9c-4bd5-8fce-b16bb9bcea48	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	4208ab48-c6fd-49dd-be5f-b1ab79a45b22	2026-02-27 15:33:04.568888+00
515a381f-9b50-47c4-b647-a20a629f994d	24d4f26f-4758-419d-bd69-0d79cc1f443b	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	8057d1a7-6229-4b52-abd6-dadd11c299a4	2026-02-27 15:33:03.889988+00
3ff2437c-6591-4f1e-8c41-35a1b5be31e5	6e9deb07-2804-463f-8973-1577077e21d0	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	d43e063d-8764-48ef-8158-41b4cad86eff	2026-02-27 18:22:16.030352+00
44e839d4-b5a1-4126-aa3d-e5f2542b4d81	9514cc9a-305f-4e94-99c8-7069be5a57b2	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	36404f2f-308d-46ca-953b-29043968f873	2026-02-27 18:22:16.529334+00
22e77866-5c5d-47ed-90d0-d90e60d79c94	dbf72d89-ca23-40b4-bb5c-32410bd26ea3	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	7a8c5e48-2062-4b0e-94e4-af3c1b36bede	2026-02-27 18:22:17.4783+00
2279ddcc-d824-49f3-bca5-c54a0973411b	0b6bb015-d385-4606-82ea-be29a4c23f30	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	465a983e-05de-4b0d-abe9-23f3edc219a2	2026-02-27 18:22:17.645749+00
2c324dd3-046d-4d31-aa5b-b3fabe968de6	55706c20-dbc9-4e26-8d6b-0baac95b26fd	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	9cca32cd-63ed-4ff2-b8b4-dc54df1f8449	2026-02-27 18:22:16.735084+00
59553be1-3ff9-48df-91e3-0dea3469843a	c67c0101-2419-4e43-93f0-a677fb6b203e	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	ffc504f7-9376-4112-86b4-b8ca0efcf792	2026-02-27 18:22:15.854441+00
bd103305-534e-43b9-84da-68b40fa08e5b	59e66a7d-ed2c-4563-9974-bac10fc9c107	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	597f3e37-4625-49c7-b767-fccd9e22af86	2026-02-27 18:22:17.163675+00
831f4fb5-6c62-4131-8e4d-c7275eceeb53	d363e958-f506-49b8-a730-14267e1bda8d	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	4208ab48-c6fd-49dd-be5f-b1ab79a45b22	2026-02-27 18:22:18.639148+00
29c7ed28-5ed0-4bf6-96df-4e59ee826c0e	ed87ac9c-b306-40b8-b1c4-edeb570b11cb	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	553e3502-f09f-44e0-a3bf-3c993e86be1b	2026-02-27 18:22:18.235222+00
702fe4ed-5a3d-4ccf-b354-af5f4914f401	f953d011-a74b-4d1d-8b8e-f2c2880e6ab2	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	monday	16:00:00	17:00:00	\N	\N	Upper East Side Studio	\N	18	\N	t	043130bd-aaf0-4518-96be-a5ea4a6f66da	2026-02-27 18:22:18.476195+00
\.


--
-- Data for Name: classes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.classes (id, semester_id, name, discipline, division, level, description, min_age, max_age, is_active, is_competition_track, requires_teacher_rec, cloned_from_class_id, created_at, updated_at) FROM stdin;
0b7efc5a-013f-47ff-811b-f86be413646d	f40ff953-cfcd-4069-8042-0e7139fa6cd6	First Steps	ballet	early_childhood	foundational	\N	\N	\N	t	f	f	\N	2026-02-27 04:13:11.876096+00	2026-02-27 04:13:11.876096+00
7ba90ec1-6a98-437d-817f-19e47cb29877	f40ff953-cfcd-4069-8042-0e7139fa6cd6	Dance with Me	ballet	early_childhood	foundational	\N	\N	\N	t	f	f	\N	2026-02-27 04:13:11.876096+00	2026-02-27 04:13:11.876096+00
6022c11f-b909-4234-8a99-e849ea2d4d97	f40ff953-cfcd-4069-8042-0e7139fa6cd6	Pre-Ballet 1	ballet	junior	foundational	\N	\N	\N	t	f	f	\N	2026-02-27 04:13:11.876096+00	2026-02-27 04:13:11.876096+00
ad712725-3201-4082-880b-ff23453d38ce	f40ff953-cfcd-4069-8042-0e7139fa6cd6	Pre-Ballet 2	ballet	junior	foundational	\N	\N	\N	t	f	f	\N	2026-02-27 04:13:11.876096+00	2026-02-27 04:13:11.876096+00
5cee5e54-d8e5-4ea1-93fc-8432aa3996a4	f40ff953-cfcd-4069-8042-0e7139fa6cd6	Pre-Ballet 3	ballet	junior	foundational	\N	\N	\N	t	f	f	\N	2026-02-27 04:13:11.876096+00	2026-02-27 04:13:11.876096+00
59f48070-08e7-4205-88d8-44fad684c229	f40ff953-cfcd-4069-8042-0e7139fa6cd6	Ballet 1A	ballet	senior	progressive	\N	\N	\N	t	f	f	\N	2026-02-27 04:13:11.876096+00	2026-02-27 04:13:11.876096+00
363f64f0-6bc2-4a1d-b2f9-7a1cf4172d02	f40ff953-cfcd-4069-8042-0e7139fa6cd6	Ballet 1B	ballet	senior	progressive	\N	\N	\N	t	f	f	\N	2026-02-27 04:13:11.876096+00	2026-02-27 04:13:11.876096+00
461c351c-d0d3-41f9-b407-53d651f8b867	f40ff953-cfcd-4069-8042-0e7139fa6cd6	Ballet 2	ballet	senior	progressive	\N	\N	\N	t	f	f	\N	2026-02-27 04:13:11.876096+00	2026-02-27 04:13:11.876096+00
392270a0-182d-43d3-b484-988f19b2506b	f40ff953-cfcd-4069-8042-0e7139fa6cd6	Open Ballet 3	ballet	senior	open	\N	\N	\N	t	f	f	\N	2026-02-27 04:13:11.876096+00	2026-02-27 04:13:11.876096+00
3559d461-45ba-4197-89b6-d2a2ff1a1a97	f40ff953-cfcd-4069-8042-0e7139fa6cd6	Contemporary 1	contemporary	senior	progressive	\N	\N	\N	t	f	f	\N	2026-02-27 04:13:11.876096+00	2026-02-27 04:13:11.876096+00
7e6eb397-c22e-476d-a67c-f35ccd66201b	f40ff953-cfcd-4069-8042-0e7139fa6cd6	Tap 1A	tap	senior	foundational	\N	\N	\N	t	f	f	\N	2026-02-27 04:13:11.876096+00	2026-02-27 04:13:11.876096+00
21b9c398-da46-4978-8a78-a3f4f5c9616d	f40ff953-cfcd-4069-8042-0e7139fa6cd6	Broadway 1	broadway	senior	foundational	\N	\N	\N	t	f	f	\N	2026-02-27 04:13:11.876096+00	2026-02-27 04:13:11.876096+00
e3f1b49f-914b-4416-b483-f06f8ba65ca5	f40ff953-cfcd-4069-8042-0e7139fa6cd6	Hip Hop 1	hip_hop	senior	foundational	\N	\N	\N	t	f	f	\N	2026-02-27 04:13:11.876096+00	2026-02-27 04:13:11.876096+00
87fa6879-ce66-41d5-aca7-c8c19683f872	f40ff953-cfcd-4069-8042-0e7139fa6cd6	Junior Comp	competition	competition	team	\N	\N	\N	t	f	f	\N	2026-02-27 04:13:11.876096+00	2026-02-27 04:13:11.876096+00
77365c71-e7dd-43f6-9f28-2b832dd8cc58	f40ff953-cfcd-4069-8042-0e7139fa6cd6	Senior Comp	competition	competition	team	\N	\N	\N	t	f	f	\N	2026-02-27 04:13:11.876096+00	2026-02-27 04:13:11.876096+00
88e8e440-53a4-47f5-8e3c-d0385586b58e	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	Ballet 1A	ballet	senior	progressive	\N	\N	\N	t	f	f	59f48070-08e7-4205-88d8-44fad684c229	2026-02-27 15:33:03.215996+00	2026-03-02 19:23:49.898+00
ee44349c-4f26-4676-b5b9-334d763f4939	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	Tap 1A	tap	senior	foundational	\N	\N	\N	t	f	f	7e6eb397-c22e-476d-a67c-f35ccd66201b	2026-02-27 15:33:03.982653+00	2026-03-02 19:23:50.472+00
69d4a86d-6c9c-4bd5-8fce-b16bb9bcea48	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	Senior Comp	competition	competition	team	\N	\N	\N	t	f	f	77365c71-e7dd-43f6-9f28-2b832dd8cc58	2026-02-27 15:33:04.508334+00	2026-03-02 19:23:51.113+00
60eafe66-f063-47b0-957c-31a9e54058ec	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	Pre-Ballet 3	ballet	junior	foundational	\N	\N	\N	t	f	f	5cee5e54-d8e5-4ea1-93fc-8432aa3996a4	2026-02-27 15:33:03.068646+00	2026-03-02 19:23:49.243+00
b23ed08b-37d3-409a-89e9-f5ab5876c0cd	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	Broadway 1	broadway	senior	foundational	\N	\N	\N	t	f	f	21b9c398-da46-4978-8a78-a3f4f5c9616d	2026-02-27 15:33:04.118891+00	2026-03-02 19:23:50.676+00
df811edf-959b-4e36-aa08-a6e91c0acc94	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	Pre-Ballet 1	ballet	junior	foundational	\N	\N	\N	t	f	f	6022c11f-b909-4234-8a99-e849ea2d4d97	2026-02-27 15:33:02.577902+00	2026-03-02 19:23:51.295+00
849fccab-d95f-45d5-b439-abcf4f2d17b1	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	Ballet 1B	ballet	senior	progressive	\N	\N	\N	t	f	f	363f64f0-6bc2-4a1d-b2f9-7a1cf4172d02	2026-02-27 18:22:16.806233+00	2026-03-01 23:44:07.748+00
5b7f551a-4d18-4ddd-88bc-dc17694963b9	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	Contemporary 1	contemporary	senior	progressive	\N	\N	\N	t	f	f	3559d461-45ba-4197-89b6-d2a2ff1a1a97	2026-02-27 18:22:17.236761+00	2026-03-01 23:44:07.992+00
6e9deb07-2804-463f-8973-1577077e21d0	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	Dance with Me	ballet	early_childhood	foundational	\N	\N	\N	t	f	f	7ba90ec1-6a98-437d-817f-19e47cb29877	2026-02-27 18:22:15.945696+00	2026-03-01 23:44:08.233+00
55706c20-dbc9-4e26-8d6b-0baac95b26fd	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	Ballet 1A	ballet	senior	progressive	\N	\N	\N	t	f	f	59f48070-08e7-4205-88d8-44fad684c229	2026-02-27 18:22:16.619804+00	2026-03-01 23:44:09.057+00
678e9661-a756-4efc-a973-1e2ed160904d	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	Hip Hop 1	hip_hop	senior	foundational	\N	\N	\N	t	f	f	e3f1b49f-914b-4416-b483-f06f8ba65ca5	2026-02-27 15:33:04.250022+00	2026-03-02 19:23:48.679+00
116f0141-cdec-438c-8aa6-e964091afceb	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	Junior Comp	competition	competition	team	\N	\N	\N	t	f	f	87fa6879-ce66-41d5-aca7-c8c19683f872	2026-02-27 15:33:04.372727+00	2026-03-02 19:23:48.488+00
8a3976dd-5a1a-4992-b45e-399128f35080	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	Ballet 1B	ballet	senior	progressive	\N	\N	\N	t	f	f	363f64f0-6bc2-4a1d-b2f9-7a1cf4172d02	2026-02-27 15:33:03.392739+00	2026-03-02 19:23:50.106+00
681f5561-a532-4148-83c9-80bb56395c01	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	First Steps	ballet	early_childhood	foundational	\N	\N	\N	t	f	f	0b7efc5a-013f-47ff-811b-f86be413646d	2026-02-27 15:33:01.878739+00	2026-03-02 19:23:48.86+00
dbf72d89-ca23-40b4-bb5c-32410bd26ea3	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	Tap 1A	tap	senior	foundational	\N	\N	\N	t	f	f	7e6eb397-c22e-476d-a67c-f35ccd66201b	2026-02-27 18:22:17.400583+00	2026-03-01 23:44:09.228+00
0b6bb015-d385-4606-82ea-be29a4c23f30	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	Broadway 1	broadway	senior	foundational	\N	\N	\N	t	f	f	21b9c398-da46-4978-8a78-a3f4f5c9616d	2026-02-27 18:22:17.579062+00	2026-03-01 23:44:09.407+00
c67c0101-2419-4e43-93f0-a677fb6b203e	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	First Steps	ballet	early_childhood	foundational	\N	\N	\N	t	f	f	0b7efc5a-013f-47ff-811b-f86be413646d	2026-02-27 18:22:15.753882+00	2026-03-01 23:44:09.577+00
59e66a7d-ed2c-4563-9974-bac10fc9c107	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	Open Ballet 3	ballet	senior	open	\N	\N	\N	t	f	f	392270a0-182d-43d3-b484-988f19b2506b	2026-02-27 18:22:17.095706+00	2026-03-01 23:44:09.774+00
ed87ac9c-b306-40b8-b1c4-edeb570b11cb	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	Hip Hop 1	hip_hop	senior	foundational	\N	\N	\N	t	f	f	e3f1b49f-914b-4416-b483-f06f8ba65ca5	2026-02-27 18:22:17.730551+00	2026-03-01 23:44:09.95+00
f953d011-a74b-4d1d-8b8e-f2c2880e6ab2	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	Junior Comp	competition	competition	team	\N	\N	\N	t	f	f	87fa6879-ce66-41d5-aca7-c8c19683f872	2026-02-27 18:22:18.398157+00	2026-03-01 23:44:10.117+00
d363e958-f506-49b8-a730-14267e1bda8d	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	Senior Comp	competition	competition	team	\N	\N	\N	t	f	f	77365c71-e7dd-43f6-9f28-2b832dd8cc58	2026-02-27 18:22:18.560631+00	2026-03-01 23:44:07.39+00
a8215262-0a8c-4a32-a907-5680ee4fcfea	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	Pre-Ballet 1	ballet	junior	foundational	\N	\N	\N	t	f	f	6022c11f-b909-4234-8a99-e849ea2d4d97	2026-02-27 18:22:16.113459+00	2026-03-01 23:44:08.422+00
e7309a6e-bb33-4797-b451-0654139f3547	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	Ballet 2	ballet	senior	progressive	\N	1	2	t	f	t	461c351c-d0d3-41f9-b407-53d651f8b867	2026-02-27 18:22:16.948954+00	2026-03-01 23:44:08.601+00
9514cc9a-305f-4e94-99c8-7069be5a57b2	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	Pre-Ballet 3	ballet	junior	foundational	\N	\N	\N	t	f	f	5cee5e54-d8e5-4ea1-93fc-8432aa3996a4	2026-02-27 18:22:16.434436+00	2026-03-01 23:44:08.88+00
f1c443aa-f949-437b-9044-c9a11a03ba0f	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	Open Ballet 3	ballet	senior	open	\N	\N	\N	t	f	f	392270a0-182d-43d3-b484-988f19b2506b	2026-02-27 15:33:03.685655+00	2026-03-02 19:23:49.482+00
78477db2-da61-4435-b49c-049ea11e0872	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	Ballet 2	ballet	senior	progressive	\N	\N	\N	t	f	f	461c351c-d0d3-41f9-b407-53d651f8b867	2026-02-27 15:33:03.54647+00	2026-03-02 19:23:50.846+00
24d4f26f-4758-419d-bd69-0d79cc1f443b	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	Contemporary 1	contemporary	senior	progressive	\N	\N	\N	t	f	f	3559d461-45ba-4197-89b6-d2a2ff1a1a97	2026-02-27 15:33:03.819361+00	2026-03-02 19:23:50.298+00
c75f5a3e-97ae-41f3-aa56-4d723afdd9f5	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	Dance with Me	ballet	early_childhood	foundational	\N	\N	\N	t	f	f	7ba90ec1-6a98-437d-817f-19e47cb29877	2026-02-27 15:33:02.283327+00	2026-03-02 19:23:49.671+00
54b71a7e-8883-4232-8633-ad0a710f27cc	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	Pre-Ballet 2	ballet	junior	foundational	\N	\N	\N	t	f	f	ad712725-3201-4082-880b-ff23453d38ce	2026-02-27 15:33:02.840225+00	2026-03-02 19:23:49.059+00
85af616d-bdbe-4e41-920a-f6b8235d3829	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	Pre-Ballet 2	ballet	junior	foundational	\N	\N	\N	t	f	f	ad712725-3201-4082-880b-ff23453d38ce	2026-02-27 18:22:16.269428+00	2026-03-01 23:44:07.574+00
\.


--
-- Data for Name: dancers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dancers (id, family_id, user_id, first_name, middle_name, last_name, gender, birth_date, grade, email, phone_number, address_line1, address_line2, city, state, zipcode, is_self, created_at) FROM stdin;
70000000-0000-0000-0000-000000000001	10000000-0000-0000-0000-000000000001	\N	Lily	\N	Smith	\N	2018-04-10	\N	\N	\N	\N	\N	\N	\N	\N	f	2026-02-25 12:43:54.980005+00
70000000-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000002	\N	Emma	\N	Johnson	\N	2015-09-01	\N	\N	\N	\N	\N	\N	\N	\N	f	2026-02-25 12:43:54.980005+00
70000000-0000-0000-0000-000000000003	10000000-0000-0000-0000-000000000003	\N	Sofia	\N	Martinez	\N	2012-12-15	\N	\N	\N	\N	\N	\N	\N	\N	f	2026-02-25 12:43:54.980005+00
dddddddd-1111-1111-1111-111111111111	aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa	aaaaaaaa-1111-1111-1111-111111111111	Ava	\N	Flores	\N	2016-05-10	4	\N	\N	\N	\N	\N	\N	\N	f	2026-02-27 01:26:31.974756+00
eeeeeeee-2222-2222-2222-222222222222	bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb	bbbbbbbb-2222-2222-2222-222222222222	Ella	\N	Johnson	\N	2014-03-22	6	\N	\N	\N	\N	\N	\N	\N	f	2026-02-27 01:26:31.974756+00
ffffffff-3333-3333-3333-333333333333	cccccccc-cccc-cccc-cccc-cccccccccccc	cccccccc-3333-3333-3333-333333333333	Sofia	\N	Martinez	\N	2012-11-02	8	\N	\N	\N	\N	\N	\N	\N	f	2026-02-27 01:26:31.974756+00
f4f54de2-3461-4219-badb-a9c9b6e05501	b71f447d-3334-4721-b32b-401f655e661e	\N	Emma	\N	Flores	female	2020-01-29	\N	\N	\N	\N	\N	\N	\N	\N	f	2026-02-27 02:24:33.754965+00
\.


--
-- Data for Name: discount_rule_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.discount_rule_sessions (id, discount_id, session_id) FROM stdin;
19e8f8b2-75c8-40b6-aed3-a6a7069f82b6	701b27b9-92ae-4280-a908-a7aad8748837	2c820960-20a7-4dff-8b99-7ad7c161f2d3
24dda85d-a365-4737-8dd0-e10b50ab85c8	701b27b9-92ae-4280-a908-a7aad8748837	88954e69-739f-4e7d-b968-89a83be56d75
\.


--
-- Data for Name: discount_rules; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.discount_rules (id, discount_id, rule_type, threshold, threshold_unit, value, value_type, created_at) FROM stdin;
cbb614fa-0e1e-4211-8073-2be4e29ea98b	9a716fbd-3e2a-4dd0-971b-2dd6453fc18a	multi_person	3	person	5.00	percent	2026-02-27 15:43:47.884877+00
2817f294-bb2a-4fc9-9c7f-fce1b122a7a6	90ae1978-c5cf-4c16-84cc-baa59aeeab2c	multi_person	3	person	5.00	percent	2026-02-27 15:43:48.80896+00
d9ae4fa0-5f31-4695-8950-d17a1f146f4f	a6902b1d-e70c-41cd-be40-bdd6372c22f9	multi_person	3	person	5.00	percent	2026-02-27 15:43:55.778542+00
50148c89-e248-403f-a96f-a363420f5932	05b61077-a741-45b6-8bd2-a4a8ec19a546	multi_person	3	person	5.00	percent	2026-02-27 15:44:11.42355+00
7bf74f4a-1103-4b20-9114-e779eb6e2f01	05f8a05e-33bd-4bd7-a2aa-bc4cbde9bc7a	multi_person	2	person	5.00	percent	2026-02-27 15:44:55.04397+00
e5505eb4-b570-41a4-a5dc-65103ab99900	701b27b9-92ae-4280-a908-a7aad8748837	multi_person	2	person	5.00	percent	2026-02-27 15:46:47.561733+00
\.


--
-- Data for Name: discounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.discounts (id, name, category, eligible_sessions_mode, give_session_scope, recipient_scope, is_active, created_at, updated_at) FROM stdin;
9a716fbd-3e2a-4dd0-971b-2dd6453fc18a	Family Discount	multi_person	all	all_sessions	threshold_and_additional	t	2026-02-27 15:43:47.711717+00	2026-02-27 15:43:47.711717+00
90ae1978-c5cf-4c16-84cc-baa59aeeab2c	Family Discount	multi_person	all	all_sessions	threshold_and_additional	t	2026-02-27 15:43:48.720812+00	2026-02-27 15:43:48.720812+00
a6902b1d-e70c-41cd-be40-bdd6372c22f9	Family Discount	multi_person	all	all_sessions	threshold_and_additional	t	2026-02-27 15:43:55.657015+00	2026-02-27 15:43:55.657015+00
05b61077-a741-45b6-8bd2-a4a8ec19a546	Family Discount	multi_person	all	all_sessions	threshold_and_additional	t	2026-02-27 15:44:11.353814+00	2026-02-27 15:44:11.353814+00
05f8a05e-33bd-4bd7-a2aa-bc4cbde9bc7a	Family Discount	multi_person	all	one_session	threshold_only	t	2026-02-27 15:44:54.927389+00	2026-02-27 15:44:54.927389+00
701b27b9-92ae-4280-a908-a7aad8748837	Family Discount	multi_person	selected	one_session	threshold_only	t	2026-02-27 15:46:47.450993+00	2026-02-27 15:46:47.450993+00
\.


--
-- Data for Name: email_activity_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.email_activity_logs (id, email_id, action, admin_id, metadata, created_at) FROM stdin;
c0d985cc-34c8-48da-b7c2-07ca383fd7b6	90000000-0000-0000-0000-000000000002	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-25 12:45:29.468148+00
8f9248bd-46ae-4e2b-93f3-e8064b055db2	90000000-0000-0000-0000-000000000002	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-25 12:45:36.546497+00
7f3f6a99-2bb5-4a5c-b332-e5e515de63a5	90000000-0000-0000-0000-000000000002	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-25 12:45:43.992458+00
801e1b2a-3540-4997-a8c9-b37de277dd1d	90000000-0000-0000-0000-000000000002	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-25 12:45:53.472835+00
943c45d8-802a-4ddc-b81d-d7853bb03e0a	90000000-0000-0000-0000-000000000002	scheduled	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{"scheduled_at": "2026-02-25T12:46:00.000Z", "recipient_count": 1}	2026-02-25 12:45:54.076094+00
16f7d58c-0cc5-49e6-9a34-182d21463e13	90000000-0000-0000-0000-000000000002	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{"reverted_to_draft": true}	2026-02-25 12:57:23.312447+00
f4e2ce3d-6827-4f8a-8424-f63f8a497bc3	90000000-0000-0000-0000-000000000002	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-25 12:57:41.83798+00
5a39206a-9fb2-47c6-a60c-d7112aa67f07	90000000-0000-0000-0000-000000000002	scheduled	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{"scheduled_at": "2026-02-25T12:58:00.000Z", "recipient_count": 1}	2026-02-25 12:57:42.52635+00
9fdd58ef-7bb8-487d-b7e4-c603f9c05fea	90000000-0000-0000-0000-000000000002	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{"reverted_to_draft": true}	2026-02-25 12:58:01.879579+00
8837a950-ff27-4a7b-83ef-bac08d96ee11	90000000-0000-0000-0000-000000000002	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-25 12:58:13.43747+00
1dc37a13-5b71-479d-938f-43a5d9c644ac	90000000-0000-0000-0000-000000000002	scheduled	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{"scheduled_at": "2026-02-25T12:58:00.000Z", "recipient_count": 1}	2026-02-25 12:58:13.953481+00
01838626-b389-4ace-b6ac-ed8fb6ac9224	90000000-0000-0000-0000-000000000002	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{"reverted_to_draft": true}	2026-02-25 12:58:19.785389+00
d0bd62c3-6680-49e0-b36d-3340b3c96fba	90000000-0000-0000-0000-000000000002	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-25 12:58:29.84716+00
7cf51d95-4167-4a35-82ab-2e4fa84e7306	90000000-0000-0000-0000-000000000002	scheduled	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{"scheduled_at": "2026-02-25T12:59:00.000Z", "recipient_count": 1}	2026-02-25 12:58:30.456764+00
b4a86bbf-f553-4c21-b2a1-a03078325343	e89a1941-355a-4157-a4b2-4295e4ab804c	created	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-25 13:09:03.939702+00
e369e0e7-f350-44ee-805b-1ea8fb69eeda	6df7c075-94a8-488f-935f-312f5179fda1	created	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 01:14:59.193089+00
13116f82-e69d-4d0c-96cd-3d6431bf4431	d1bd6648-cdb2-4f4c-8795-6088d311ec45	created	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 01:36:49.841792+00
461f266d-cbb8-460e-884d-1fb0c8a86186	d616c890-1100-40a2-8e6e-b95234a08577	created	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 16:30:50.362101+00
db31d7ec-9ac3-416c-b9ec-71ab52845534	d616c890-1100-40a2-8e6e-b95234a08577	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 16:31:10.852781+00
181c9939-9e16-4bb8-b596-0dfacd1994f9	d616c890-1100-40a2-8e6e-b95234a08577	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 16:31:43.607295+00
36d9466b-b546-4ed4-8026-ec6c6ebcea47	d616c890-1100-40a2-8e6e-b95234a08577	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 16:31:49.677285+00
c24f6fa6-a392-4c9d-93ce-058a10b10b3e	c01e7c54-9991-46a3-86ba-33cd88112c04	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 16:57:24.023408+00
92f5cdd7-1a09-4161-a498-6a44540cc889	c01e7c54-9991-46a3-86ba-33cd88112c04	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 16:57:27.914492+00
5a052773-6960-4532-bca7-427cfbafee54	c01e7c54-9991-46a3-86ba-33cd88112c04	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 16:57:33.977292+00
c7641441-1d02-4492-8d68-aacb623a1554	c01e7c54-9991-46a3-86ba-33cd88112c04	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 16:57:35.148211+00
115e4b05-e613-4a30-bff6-1ac5ecab20b9	c01e7c54-9991-46a3-86ba-33cd88112c04	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:14:53.048959+00
d171f7be-3c9f-4404-82de-1be8b9f5ae3e	c01e7c54-9991-46a3-86ba-33cd88112c04	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:15:08.350113+00
619ee861-8aed-4fe6-aa7e-512dc8ad0f0f	c01e7c54-9991-46a3-86ba-33cd88112c04	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:15:11.805183+00
60d1944c-eebd-4775-b24b-ca8b70dd4e0f	c01e7c54-9991-46a3-86ba-33cd88112c04	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:15:23.849061+00
7750c5df-d9bd-40ea-bb40-e9b382ce7547	c01e7c54-9991-46a3-86ba-33cd88112c04	scheduled	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{"scheduled_at": "2026-02-26T17:16:00.000Z", "recipient_count": 1}	2026-02-26 17:15:24.482394+00
600416b8-0810-4124-bd35-b31ee56846fd	0372eaff-2a9c-4d16-bcf7-80e44b2429d7	cloned	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{"cloned_from": "c01e7c54-9991-46a3-86ba-33cd88112c04"}	2026-02-26 17:17:14.64802+00
1fe09670-0d0e-4d75-a783-71b3c335562b	0372eaff-2a9c-4d16-bcf7-80e44b2429d7	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:17:20.467191+00
1cf60790-1175-4357-9986-ed3c7bb418ee	0372eaff-2a9c-4d16-bcf7-80e44b2429d7	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:17:27.439022+00
2a997076-7109-4705-8bf9-9c19ff1fd913	0372eaff-2a9c-4d16-bcf7-80e44b2429d7	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:19:46.750269+00
f475873d-061d-4020-acf3-90a05d5c311d	bfed2ea7-4b8d-42cb-9bf8-da8eb0ece937	cloned	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{"cloned_from": "c01e7c54-9991-46a3-86ba-33cd88112c04"}	2026-02-26 17:20:05.609968+00
89c45632-9528-468a-a26f-b7b6a73ef43d	bfed2ea7-4b8d-42cb-9bf8-da8eb0ece937	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:20:10.084397+00
17a79768-9a37-4835-b344-648da8734ae6	bfed2ea7-4b8d-42cb-9bf8-da8eb0ece937	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:20:13.320647+00
19e29f24-f6c5-4128-b800-f694e2cd80b6	bfed2ea7-4b8d-42cb-9bf8-da8eb0ece937	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:20:15.65279+00
e9ae4bce-ed96-47b9-a306-5a97f11b2afb	bfed2ea7-4b8d-42cb-9bf8-da8eb0ece937	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:20:23.759274+00
3cb87a4e-b835-45c1-9eb1-792de466c2b8	bfed2ea7-4b8d-42cb-9bf8-da8eb0ece937	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:20:32.150561+00
6b31919d-1771-43b5-9096-6333605c0786	bfed2ea7-4b8d-42cb-9bf8-da8eb0ece937	sent	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{"mode": "inline", "sent": 1, "total": 1, "failed": 0}	2026-02-26 17:20:33.467707+00
39bfcf5f-def4-4df2-9476-32b7a70d2e84	0671f293-7a4a-4b06-85a6-57b4fb96b31d	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:21:27.228893+00
bed54ee0-d9ef-4a71-859d-b99790468800	0671f293-7a4a-4b06-85a6-57b4fb96b31d	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:21:28.177012+00
e6ff535e-69b8-46e5-ac11-b61c1410bf88	0671f293-7a4a-4b06-85a6-57b4fb96b31d	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:21:34.955987+00
222fc59b-84fe-48a9-a93e-aeffec571dbc	0671f293-7a4a-4b06-85a6-57b4fb96b31d	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:21:41.633239+00
1e1566cf-31f7-4625-aafa-4ea2aa2295db	0671f293-7a4a-4b06-85a6-57b4fb96b31d	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:22:00.468424+00
3602bacb-fa9e-4cbf-a765-bdd2c3f37c78	0671f293-7a4a-4b06-85a6-57b4fb96b31d	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:22:14.887273+00
fef1b1e1-f091-470a-95fb-3427f3a55464	0671f293-7a4a-4b06-85a6-57b4fb96b31d	sent	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{"mode": "inline", "sent": 0, "total": 1, "failed": 1}	2026-02-26 17:22:15.945366+00
60ec5b38-90fb-49bf-bc5f-dc1282ad73f2	e5fef010-7e4a-49ce-b4d6-f4c1e1feb67b	cloned	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{"cloned_from": "bfed2ea7-4b8d-42cb-9bf8-da8eb0ece937"}	2026-02-26 17:23:42.661431+00
dadcc4c2-783c-474f-b842-60db483ffefe	e5fef010-7e4a-49ce-b4d6-f4c1e1feb67b	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:24:41.080569+00
329858d4-595d-4e61-a2db-37188fc13e4e	e5fef010-7e4a-49ce-b4d6-f4c1e1feb67b	sent	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{"mode": "inline", "sent": 1, "total": 1, "failed": 0}	2026-02-26 17:24:42.252721+00
5cdbd49b-2e8d-4152-8ae8-50ac2ec8bd6a	5b8c8a13-d680-4f6d-8242-3cbaa9320257	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:34:59.682058+00
e2acb568-2320-4beb-a486-922312c07772	5b8c8a13-d680-4f6d-8242-3cbaa9320257	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:35:05.660876+00
ab9c6591-240e-43a7-9ca5-7821a642927c	5b8c8a13-d680-4f6d-8242-3cbaa9320257	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:35:12.302798+00
8386d0cf-69fd-4ae9-83c7-274b3b8acaf9	5b8c8a13-d680-4f6d-8242-3cbaa9320257	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:35:37.381268+00
45266232-c0a6-4bc9-b645-24cfbec45a30	5b8c8a13-d680-4f6d-8242-3cbaa9320257	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:35:58.255296+00
db0e7be1-039e-44e4-a600-48683202f9f4	5b8c8a13-d680-4f6d-8242-3cbaa9320257	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:36:05.384612+00
137e0fba-9fce-4418-a5f7-3631edcd7ba2	5b8c8a13-d680-4f6d-8242-3cbaa9320257	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:36:22.366916+00
700c4e90-6772-468a-b735-0189dce6b1ee	5b8c8a13-d680-4f6d-8242-3cbaa9320257	scheduled	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{"scheduled_at": "2026-02-26T17:37:00.000Z", "recipient_count": 1}	2026-02-26 17:36:22.962536+00
fff6d74f-8a52-4cbd-9730-02f969efd57a	21b857b3-11c3-4635-b44c-be6f036bd8b7	created	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:38:50.614515+00
176c56ff-c058-4bf6-b3c9-ff02202e497b	21b857b3-11c3-4635-b44c-be6f036bd8b7	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:39:30.936262+00
8a3d7608-a33a-48a7-b236-a029de3bee05	21b857b3-11c3-4635-b44c-be6f036bd8b7	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:39:39.854424+00
7655e00c-c562-422c-b2c7-2c0657fad90a	21b857b3-11c3-4635-b44c-be6f036bd8b7	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:39:47.450121+00
4f924b46-be3a-436c-9fd1-8be2db1bf2b1	21b857b3-11c3-4635-b44c-be6f036bd8b7	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:39:55.034846+00
d7d06dfe-931a-4d4b-bd1b-40860064e2e4	21b857b3-11c3-4635-b44c-be6f036bd8b7	scheduled	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{"scheduled_at": "2026-02-26T17:40:00.000Z", "recipient_count": 1}	2026-02-26 17:39:55.672844+00
0069f05b-d3a2-4489-a940-7ddd68597d19	bd64cd58-5227-4c47-ad5a-4e4299736cff	created	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-26 17:59:17.049989+00
29e3e974-3055-4153-a3ff-92e09d6050cb	e5fd9669-36b0-4546-a6db-3e9a2cab8e52	cloned	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{"cloned_from": "21b857b3-11c3-4635-b44c-be6f036bd8b7"}	2026-02-27 16:44:23.084583+00
204de7eb-0792-496e-b93a-24ebd7c1f085	e5fd9669-36b0-4546-a6db-3e9a2cab8e52	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 16:45:04.518452+00
3c8a1b51-e5e1-4146-9f28-d6ca413ebe22	b1f6c714-2ae6-49b0-a9d0-7389f830c4e0	cloned	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{"cloned_from": "21b857b3-11c3-4635-b44c-be6f036bd8b7"}	2026-02-27 16:46:07.681013+00
c1d85f75-a2fd-4636-9497-a7e45f2e0fbe	b1f6c714-2ae6-49b0-a9d0-7389f830c4e0	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 16:46:10.20044+00
77674d63-f711-4fa3-ae38-e870f87e81e1	b1f6c714-2ae6-49b0-a9d0-7389f830c4e0	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 16:46:50.348358+00
553881aa-4076-4dd1-9b25-60a29711e4b2	b1f6c714-2ae6-49b0-a9d0-7389f830c4e0	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 16:47:30.475044+00
7b6511b0-0784-462b-b3d0-6be42c4e6652	b1f6c714-2ae6-49b0-a9d0-7389f830c4e0	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 16:47:45.937813+00
0909544a-a950-4dd5-90b0-a36848fa77a9	b1f6c714-2ae6-49b0-a9d0-7389f830c4e0	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 16:46:56.891187+00
c52ea484-fc20-41b9-841e-e293ac738749	b1f6c714-2ae6-49b0-a9d0-7389f830c4e0	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 16:47:17.092373+00
b71b0e15-d8ee-4bc9-89c0-4faadb01a5e9	b1f6c714-2ae6-49b0-a9d0-7389f830c4e0	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 16:47:44.519111+00
7ebf2b3c-4fb0-40e5-ab53-6a1b8ac04b16	b1f6c714-2ae6-49b0-a9d0-7389f830c4e0	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 16:47:52.516274+00
9361c9b3-4ce1-45ef-be9c-36599a5e483f	b1f6c714-2ae6-49b0-a9d0-7389f830c4e0	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 16:48:08.198991+00
4a6511e5-1e44-447b-97b9-1ed00c3e609f	b1f6c714-2ae6-49b0-a9d0-7389f830c4e0	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 16:48:28.944717+00
4ce069b8-d9a4-44fd-9507-504a8539fd43	b1f6c714-2ae6-49b0-a9d0-7389f830c4e0	scheduled	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{"scheduled_at": "2026-02-27T16:49:00.000Z", "recipient_count": 1}	2026-02-27 16:48:29.577352+00
a4b607a6-6ba0-4587-a82d-f2e3706bbec7	e5fd9669-36b0-4546-a6db-3e9a2cab8e52	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 16:51:11.094091+00
f07b8145-d2f9-4485-86b1-e35f1275f9bc	e5fd9669-36b0-4546-a6db-3e9a2cab8e52	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 16:51:58.390239+00
288d06a0-b6db-48e0-b9e3-9305b962e364	e5fd9669-36b0-4546-a6db-3e9a2cab8e52	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 16:52:02.366954+00
6c8e4099-6810-4623-b922-53b2ecf8e1b7	e5fd9669-36b0-4546-a6db-3e9a2cab8e52	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 16:52:39.78253+00
af5ab8cf-e245-4918-909a-e1613ffac84d	e5fd9669-36b0-4546-a6db-3e9a2cab8e52	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 16:52:46.250233+00
cbcc68ab-e1e1-4ce9-b680-3f669f127723	e5fd9669-36b0-4546-a6db-3e9a2cab8e52	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 16:52:57.968082+00
b9dc462d-92d2-4490-9cf8-f0b3168f01c1	b6f711df-2280-49eb-a0dd-ce8c56d19041	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 16:54:11.982352+00
60012696-b3e8-4e4b-9af1-877d65055e52	b6f711df-2280-49eb-a0dd-ce8c56d19041	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 16:54:33.246264+00
816540e4-a383-4444-9cea-3238536fd28b	b6f711df-2280-49eb-a0dd-ce8c56d19041	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 16:54:37.332399+00
032e85a4-594c-4bbe-97e9-15bd837ba561	b6f711df-2280-49eb-a0dd-ce8c56d19041	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 16:54:46.304419+00
11fd72c9-c5db-4003-982b-d8791f936349	b6f711df-2280-49eb-a0dd-ce8c56d19041	sent	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{"mode": "inline", "sent": 1, "total": 1, "failed": 0}	2026-02-27 16:54:47.484181+00
bc79e5b9-9bc5-45c3-984a-f13296e10141	dd7f55b2-6e70-41fc-bb7b-3d2d5c38e9b6	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 16:55:46.534281+00
46be9474-f70c-4b0a-9bf3-52b29ec45768	dd7f55b2-6e70-41fc-bb7b-3d2d5c38e9b6	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 16:55:55.174182+00
104dead5-dbed-4cec-bdbc-1376f506ce41	dd7f55b2-6e70-41fc-bb7b-3d2d5c38e9b6	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 16:55:57.119697+00
99e4ea90-b702-45c0-8397-e51457b6b573	dd7f55b2-6e70-41fc-bb7b-3d2d5c38e9b6	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 16:56:06.684212+00
43a8a203-2109-4fc2-8901-4d7047e285cf	dd7f55b2-6e70-41fc-bb7b-3d2d5c38e9b6	scheduled	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{"scheduled_at": "2026-02-27T16:57:00.000Z", "recipient_count": 1}	2026-02-27 16:56:07.359272+00
7300278d-6007-4f3c-8356-6294b45954b0	9c64aca6-7ed9-47d2-b83a-7991176cccf9	created	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 16:59:30.986257+00
8d767e8e-fa03-4e5a-af20-121918c9a09a	e5fd9669-36b0-4546-a6db-3e9a2cab8e52	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 19:16:30.784169+00
7bb9a094-2235-4802-8aa5-1ac7472fb4a8	e5fd9669-36b0-4546-a6db-3e9a2cab8e52	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 19:16:35.708443+00
f76a4e9e-3332-452c-b7b5-295053c2baeb	e5fd9669-36b0-4546-a6db-3e9a2cab8e52	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 19:16:44.685956+00
31470d8a-43a8-405f-8ae3-ccd705b4f92c	e5fd9669-36b0-4546-a6db-3e9a2cab8e52	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 19:18:09.653561+00
163f717e-f894-466f-add1-e412e52ea23f	e5fd9669-36b0-4546-a6db-3e9a2cab8e52	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 19:18:16.160953+00
448668c4-e8f4-4249-b482-8a0762af3cc7	e5fd9669-36b0-4546-a6db-3e9a2cab8e52	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 19:18:24.965283+00
ebab8e85-c9d4-4365-b48c-937d4732f18b	e5fd9669-36b0-4546-a6db-3e9a2cab8e52	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 19:18:40.984947+00
39fb2a76-c7ef-4211-85eb-214ffd588453	e5fd9669-36b0-4546-a6db-3e9a2cab8e52	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 19:18:47.253992+00
a21b3cb5-731b-4f30-a9b6-b4a8210e8d6d	e5fd9669-36b0-4546-a6db-3e9a2cab8e52	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 19:19:09.891612+00
77e0ac88-aa54-4dea-9651-df7dfe0d6574	e5fd9669-36b0-4546-a6db-3e9a2cab8e52	scheduled	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{"scheduled_at": "2026-02-27T19:20:00.000Z", "recipient_count": 1}	2026-02-27 19:19:10.550709+00
60a6e608-9e77-4dd5-9e00-2b8ae79d93c1	d2ff9e79-23fc-403d-9aeb-187eff7ddc45	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 19:22:49.914197+00
ab5d0769-bfe1-4846-a8ec-04e5f9880734	d2ff9e79-23fc-403d-9aeb-187eff7ddc45	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 19:23:01.108719+00
08b58abe-03ad-4efc-b54d-5d31c0876859	d2ff9e79-23fc-403d-9aeb-187eff7ddc45	edited	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 19:23:03.941194+00
66bfdca3-5cd2-43ef-a7a9-2e90f677e3ca	d454f9c7-165c-4d91-bbdf-d3d6e6037198	created	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	{}	2026-02-27 19:26:46.676083+00
\.


--
-- Data for Name: email_deliveries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.email_deliveries (id, email_id, user_id, email_address, resend_message_id, status, delivered_at, bounced_at, opened_at, clicked_at, created_at, updated_at) FROM stdin;
14e77a3e-6695-4b98-97ea-a5b2620cbb28	90000000-0000-0000-0000-000000000002	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	ethanf.flores@gmail.com	0bd70dd6-a57d-4e3e-b854-a0920ed89955	sent	\N	\N	\N	\N	2026-02-25 13:06:00.764866+00	2026-02-25 13:06:00.764866+00
bfb35dbc-1cb3-41f1-a013-cdc139028cc3	c01e7c54-9991-46a3-86ba-33cd88112c04	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	ethanf.flores@gmail.com	7f5deda8-3ec6-4a62-86aa-7a7cb00f7583	sent	\N	\N	\N	\N	2026-02-26 17:16:00.830346+00	2026-02-26 17:16:00.830346+00
ad58b1de-9bc9-4be9-bba2-fd0d90915fb4	bfed2ea7-4b8d-42cb-9bf8-da8eb0ece937	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	ethanf.flores@gmail.com	27d50d10-883b-4cc9-b47f-a433e8cf2a55	sent	\N	\N	\N	\N	2026-02-26 17:20:33.299359+00	2026-02-26 17:20:33.299359+00
c7e1944f-bb03-4d3a-aa7b-1100132d554e	0671f293-7a4a-4b06-85a6-57b4fb96b31d	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	ethanf.flores@gmail.com	\N	pending	\N	\N	\N	\N	2026-02-26 17:22:15.814358+00	2026-02-26 17:22:15.814358+00
849e0dc1-a22e-41b6-a6db-d8e35d9de7f9	e5fef010-7e4a-49ce-b4d6-f4c1e1feb67b	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	ethanf.flores@gmail.com	cbd59fd5-c59e-46de-9221-9f6f83a3aee2	sent	\N	\N	\N	\N	2026-02-26 17:24:42.068873+00	2026-02-26 17:24:42.068873+00
b06716b9-93c7-42bf-a62e-1f95695f7c1a	5b8c8a13-d680-4f6d-8242-3cbaa9320257	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	ethanf.flores@gmail.com	7d6d9240-90ca-4db9-8723-7997e926d43f	sent	\N	\N	\N	\N	2026-02-26 17:37:00.521738+00	2026-02-26 17:37:00.521738+00
d19bcff2-5ebb-4433-a41a-dbdd378603f8	21b857b3-11c3-4635-b44c-be6f036bd8b7	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	ethanf.flores@gmail.com	1f06c3b2-58c3-486b-a771-ee728d616e58	sent	\N	\N	\N	\N	2026-02-26 17:40:01.526062+00	2026-02-26 17:40:01.526062+00
fb4517d2-2bb2-4095-88fd-0cc62f2f9674	b1f6c714-2ae6-49b0-a9d0-7389f830c4e0	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	ethanf.flores@gmail.com	cee6f93d-e30e-4841-bc37-3a4e579f9862	sent	\N	\N	\N	\N	2026-02-27 16:49:00.639125+00	2026-02-27 16:49:00.639125+00
37eb86af-4ec3-42f9-9e9c-2e04708f4fde	b6f711df-2280-49eb-a0dd-ce8c56d19041	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	ethanf.flores@gmail.com	a3a27ccf-c92f-4eb8-9707-8ec9f4cdd2e8	sent	\N	\N	\N	\N	2026-02-27 16:54:47.332082+00	2026-02-27 16:54:47.332082+00
40cfda1f-840d-4599-91be-cd564c1565ad	dd7f55b2-6e70-41fc-bb7b-3d2d5c38e9b6	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	ethanf.flores@gmail.com	4642c293-8164-4848-b0f5-c123603a4629	sent	\N	\N	\N	\N	2026-02-27 16:57:01.578175+00	2026-02-27 16:57:01.578175+00
68a01cac-c447-4fd9-ac94-b4cf4fe2faa0	e5fd9669-36b0-4546-a6db-3e9a2cab8e52	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	ethanf.flores@gmail.com	899fed50-f997-4237-8f1b-e28f0238ccd2	sent	\N	\N	\N	\N	2026-02-27 19:20:04.729959+00	2026-02-27 19:20:04.729959+00
\.


--
-- Data for Name: email_recipient_selections; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.email_recipient_selections (id, email_id, selection_type, semester_id, user_id, is_excluded, created_at, session_id) FROM stdin;
38fadaf1-53f8-4e0a-9320-1df0fe290051	b1f6c714-2ae6-49b0-a9d0-7389f830c4e0	manual	\N	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	f	2026-02-27 16:48:28.850698+00	\N
c8e48940-3d23-4c13-bedd-5219604410a8	b6f711df-2280-49eb-a0dd-ce8c56d19041	manual	\N	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	f	2026-02-27 16:54:46.222791+00	\N
66b230c6-4884-4e3b-8565-63b5742626b8	dd7f55b2-6e70-41fc-bb7b-3d2d5c38e9b6	manual	\N	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	f	2026-02-27 16:56:06.610134+00	\N
42365fcf-70d7-4dbd-af17-4ecf9a0d2204	e5fd9669-36b0-4546-a6db-3e9a2cab8e52	session	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	\N	f	2026-02-27 19:19:09.827455+00	562e5105-65bd-41cc-987f-55f0be6d9bea
6251f1a7-c370-4013-99b8-06cce3342c5a	e5fd9669-36b0-4546-a6db-3e9a2cab8e52	manual	\N	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	f	2026-02-27 19:19:09.827455+00	\N
19522f4d-7974-4d4e-94b8-0b134961ba06	d2ff9e79-23fc-403d-9aeb-187eff7ddc45	manual	\N	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	f	2026-02-27 19:23:03.821739+00	\N
\.


--
-- Data for Name: email_recipients; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.email_recipients (id, email_id, user_id, email_address, first_name, last_name, created_at) FROM stdin;
daa8e24c-04d1-4773-a17e-7cb6bbcb4872	90000000-0000-0000-0000-000000000002	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	ethanf.flores@gmail.com	Ethan	Flores	2026-02-25 12:58:30.316495+00
90fa2ca2-a1b7-49cc-aacd-8263da810531	c01e7c54-9991-46a3-86ba-33cd88112c04	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	ethanf.flores@gmail.com	Ethan	Flores	2026-02-26 17:15:24.343434+00
36ac2363-18cc-4723-94fe-ca3bec8a25f2	bfed2ea7-4b8d-42cb-9bf8-da8eb0ece937	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	ethanf.flores@gmail.com	Ethan	Flores	2026-02-26 17:20:32.80266+00
c68c618b-9a1f-4cd6-b5b6-f0493bac6c18	0671f293-7a4a-4b06-85a6-57b4fb96b31d	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	ethanf.flores@gmail.com	Ethan	Flores	2026-02-26 17:22:15.405131+00
51e99e41-e936-4a65-adf4-0182f8a56f7e	e5fef010-7e4a-49ce-b4d6-f4c1e1feb67b	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	ethanf.flores@gmail.com	Ethan	Flores	2026-02-26 17:24:41.661573+00
1e3e7bac-a552-476e-94c9-5036255ff640	5b8c8a13-d680-4f6d-8242-3cbaa9320257	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	ethanf.flores@gmail.com	Ethan	Flores	2026-02-26 17:36:22.787581+00
a2d22dd5-6ae5-4c20-8558-e4735a24114b	21b857b3-11c3-4635-b44c-be6f036bd8b7	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	ethanf.flores@gmail.com	Ethan	Flores	2026-02-26 17:39:55.48244+00
6fb3d18b-cfa9-4940-adbf-66e65eb36be1	b1f6c714-2ae6-49b0-a9d0-7389f830c4e0	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	ethanf.flores@gmail.com	Ethan	Flores	2026-02-27 16:48:29.438753+00
97752236-2485-4e58-aaef-9793dc102881	b6f711df-2280-49eb-a0dd-ce8c56d19041	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	ethanf.flores@gmail.com	Ethan	Flores	2026-02-27 16:54:46.913559+00
d46804a1-a49a-44fe-9a5f-63ff0eeab6b8	dd7f55b2-6e70-41fc-bb7b-3d2d5c38e9b6	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	ethanf.flores@gmail.com	Ethan	Flores	2026-02-27 16:56:07.159966+00
6458e7fb-b058-415f-a57c-a8f960de3557	e5fd9669-36b0-4546-a6db-3e9a2cab8e52	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	ethanf.flores@gmail.com	Ethan	Flores	2026-02-27 19:19:10.406202+00
\.


--
-- Data for Name: email_subscriptions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.email_subscriptions (user_id, is_subscribed, unsubscribed_at, updated_at) FROM stdin;
64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	t	\N	2026-02-27 19:23:30.174711+00
\.


--
-- Data for Name: email_templates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.email_templates (id, name, subject, body_html, body_json, created_by_admin_id, updated_by_admin_id, created_at, updated_at, deleted_at) FROM stdin;
5a13930e-ac42-4aa5-88f9-96499adb2711	Untitled Template	template	<p>Hello</p>	{}	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	2026-02-26 16:56:42.860143+00	2026-02-26 16:56:42.860143+00	\N
97524df6-24a6-4495-b022-769527d630a1	Untitled Template	Test Unsubscription	<p>You dont get to leave</p>	{}	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	2026-02-27 16:53:27.938469+00	2026-02-27 16:53:27.938469+00	\N
\.


--
-- Data for Name: emails; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.emails (id, subject, body_html, body_json, status, scheduled_at, sent_at, sender_name, sender_email, reply_to_email, include_signature, created_by_admin_id, updated_by_admin_id, created_at, updated_at, deleted_at) FROM stdin;
90000000-0000-0000-0000-000000000001	Welcome		{}	sent	\N	\N	Studio	info@studio.com	\N	f	20000000-0000-0000-0000-000000000001	20000000-0000-0000-0000-000000000001	2026-02-25 12:43:54.980005+00	2026-02-25 12:43:54.980005+00	\N
90000000-0000-0000-0000-000000000003	Payment Notice		{}	scheduled	\N	\N	Studio	billing@studio.com	\N	f	20000000-0000-0000-0000-000000000001	20000000-0000-0000-0000-000000000001	2026-02-25 12:43:54.980005+00	2026-02-25 12:43:54.980005+00	\N
5b8c8a13-d680-4f6d-8242-3cbaa9320257	template	<p>Hello</p><p></p><p><code>{{parent_name}}</code></p><p>Parent's full name</p><p><code>{{student_name}}</code></p><p>Student's full name</p><p><code>{{semester_name}}</code></p><p>Semester name</p><p><code>{{session_name}}</code></p>	{}	sent	2026-02-26 17:37:00+00	2026-02-26 17:37:00.534+00	dsaaD	ethan@madasacollective.com	\N	f	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	2026-02-26 17:34:38.034843+00	2026-02-26 17:37:00.565982+00	\N
bfed2ea7-4b8d-42cb-9bf8-da8eb0ece937	Copy of template	<p>Hello AGAIN</p>	{}	sent	\N	2026-02-26 17:20:33.296+00	AYDT Admin	ethan@madasacollective.com	test@mail.com	f	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	2026-02-26 17:20:05.372063+00	2026-02-26 17:20:33.411693+00	\N
90000000-0000-0000-0000-000000000002	Reminder	<p>hello</p>	{}	sent	2026-02-25 12:59:00+00	2026-02-25 13:06:00.811+00	Studio	ethan@madasacollective.com	\N	f	20000000-0000-0000-0000-000000000001	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	2026-02-25 12:43:54.980005+00	2026-02-25 13:06:00.832986+00	\N
e89a1941-355a-4157-a4b2-4295e4ab804c			{}	draft	\N	\N			\N	f	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	2026-02-25 13:09:03.867089+00	2026-02-25 13:09:03.867089+00	\N
6df7c075-94a8-488f-935f-312f5179fda1			{}	draft	\N	\N			\N	f	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	2026-02-26 01:14:59.073418+00	2026-02-26 01:14:59.073418+00	\N
d1bd6648-cdb2-4f4c-8795-6088d311ec45			{}	draft	\N	\N			\N	f	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	2026-02-26 01:36:49.71381+00	2026-02-26 01:36:49.71381+00	\N
d616c890-1100-40a2-8e6e-b95234a08577	template	<p>Hello</p>	{}	draft	\N	\N	aydt	ethan@madasacollective.com	\N	f	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	2026-02-26 16:30:50.247001+00	2026-02-26 16:31:49.384707+00	\N
21b857b3-11c3-4635-b44c-be6f036bd8b7	test schedule send for unsub	<p>unsub?</p>	{}	sent	2026-02-26 17:40:00+00	2026-02-26 17:40:01.539+00	A"YDT	ethan@madasacollective.com	any@mail.com	t	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	2026-02-26 17:38:50.557249+00	2026-02-26 17:40:01.583168+00	\N
0671f293-7a4a-4b06-85a6-57b4fb96b31d	template	<p>Hello</p>	{}	failed	\N	2026-02-26 17:22:15.796+00			\N	f	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	2026-02-26 17:21:24.764569+00	2026-02-26 17:22:15.875199+00	\N
bd64cd58-5227-4c47-ad5a-4e4299736cff			{}	draft	\N	\N			\N	f	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	2026-02-26 17:59:16.918011+00	2026-02-26 17:59:16.918011+00	\N
c01e7c54-9991-46a3-86ba-33cd88112c04	template	<p>Hello</p>	{}	sent	2026-02-26 17:16:00+00	2026-02-26 17:16:00.861+00	AYDT Admin	ethan@madasacollective.com	test@mail.com	f	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	2026-02-26 16:57:14.9689+00	2026-02-26 17:16:00.884426+00	\N
e5fef010-7e4a-49ce-b4d6-f4c1e1feb67b	Copy of Copy of template	<p>Hello AGAIN</p>	{}	sent	\N	2026-02-26 17:24:42.057+00	AYDT Admin	ethan@madasacollective.com	test@mail.com	f	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	2026-02-26 17:23:42.462933+00	2026-02-26 17:24:42.171121+00	\N
0372eaff-2a9c-4d16-bcf7-80e44b2429d7	Copy of template	<p>Hello</p>	{}	draft	\N	\N	AYDT Admin	ethan@madasacollective.com	test@mail.com	f	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	2026-02-26 17:17:14.450552+00	2026-02-26 17:19:46.53111+00	\N
e5fd9669-36b0-4546-a6db-3e9a2cab8e52	Test Unsubscription	<p style="text-align: center;">Try to unsub below</p>	{}	sent	2026-02-27 19:20:00+00	2026-02-27 19:20:04.747+00	AYDT	ethan@madasacollective.com	any@mail.com	t	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	2026-02-27 16:44:22.822995+00	2026-02-27 19:20:04.788787+00	\N
b1f6c714-2ae6-49b0-a9d0-7389f830c4e0	Lets try to unsubscribe	<h1>unsub?</h1><p style="text-align: center;">Read below</p>	{}	sent	2026-02-27 16:49:00+00	2026-02-27 16:49:00.66+00	AYDT	ethan@madasacollective.com	any@mail.com	t	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	2026-02-27 16:46:07.54007+00	2026-02-27 16:49:00.698754+00	\N
dd7f55b2-6e70-41fc-bb7b-3d2d5c38e9b6	Test Unsubscription	<p>You dont get to leave</p>	{}	sent	2026-02-27 16:57:00+00	2026-02-27 16:57:01.595+00	AYDT	ethan@madasacollective.com	anything@mail.com	t	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	2026-02-27 16:55:20.313549+00	2026-02-27 16:57:01.623936+00	\N
9c64aca6-7ed9-47d2-b83a-7991176cccf9			{}	draft	\N	\N			\N	f	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	2026-02-27 16:59:30.915647+00	2026-02-27 16:59:30.915647+00	\N
d2ff9e79-23fc-403d-9aeb-187eff7ddc45	Test Unsubscription	<p>You dont get to leave</p>	{}	draft	\N	\N			\N	f	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	2026-02-27 19:22:46.868418+00	2026-02-27 19:23:03.586731+00	\N
d454f9c7-165c-4d91-bbdf-d3d6e6037198			{}	draft	\N	\N			\N	f	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	2026-02-27 19:26:46.56621+00	2026-02-27 19:26:46.56621+00	\N
b6f711df-2280-49eb-a0dd-ce8c56d19041	Test Unsubscription	<p>You dont get to leave</p>	{}	sent	\N	2026-02-27 16:54:47.374+00	AYDT	ethan@madasacollective.com	anything@mailc.om	t	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	2026-02-27 16:53:37.184413+00	2026-02-27 16:54:47.409649+00	\N
\.


--
-- Data for Name: families; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.families (id, family_name, created_at) FROM stdin;
10000000-0000-0000-0000-000000000001	Smith	2026-02-25 12:43:54.980005+00
10000000-0000-0000-0000-000000000002	Johnson	2026-02-25 12:43:54.980005+00
10000000-0000-0000-0000-000000000003	Martinez	2026-02-25 12:43:54.980005+00
b71f447d-3334-4721-b32b-401f655e661e	\N	2026-02-25 12:44:17.654123+00
66bbff98-668e-4033-86b8-fc41258f67e7	\N	2026-02-26 00:54:41.535705+00
aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa	Flores	2026-02-27 01:26:31.974756+00
bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb	Johnson	2026-02-27 01:26:31.974756+00
cccccccc-cccc-cccc-cccc-cccccccccccc	Martinez	2026-02-27 01:26:31.974756+00
\.


--
-- Data for Name: media_images; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.media_images (id, display_name, storage_path, public_url, folder, tags, mime_type, size_bytes, width, height, created_at, updated_at) FROM stdin;
95000000-0000-0000-0000-000000000001	Ballet Hero	hero/ballet.jpg	https://cdn.test/ballet.jpg	hero	{ballet}	image/jpeg	120000	\N	\N	2026-02-25 12:43:54.980005+00	2026-02-25 12:43:54.980005+00
95000000-0000-0000-0000-000000000002	HipHop Hero	hero/hiphop.jpg	https://cdn.test/hiphop.jpg	hero	{hiphop}	image/jpeg	110000	\N	\N	2026-02-25 12:43:54.980005+00	2026-02-25 12:43:54.980005+00
95000000-0000-0000-0000-000000000003	Summer Camp	hero/summer.jpg	https://cdn.test/summer.jpg	hero	{summer}	image/jpeg	130000	\N	\N	2026-02-25 12:43:54.980005+00	2026-02-25 12:43:54.980005+00
45579ed9-db0d-4618-bd74-0af8f94a4a92	aydt-logo-icon-teal-lilac-cherry	email-images/9127ee6c-c9bf-4e48-b9cf-83e470f04fca.png	https://bulplzknfbietpmdfwlk.supabase.co/storage/v1/object/public/email-assets/email-images/9127ee6c-c9bf-4e48-b9cf-83e470f04fca.png	general	{}	image/png	37850	\N	\N	2026-02-25 13:10:37.186662+00	2026-02-25 13:10:37.186662+00
cb1a0138-2455-48d8-b5bd-665b89ea462f	Screen Shot 2025-10-14 at 10.16.22 AM	email-images/cd96b659-a5e3-4449-baf1-6abc04232cf1.png	https://bulplzknfbietpmdfwlk.supabase.co/storage/v1/object/public/email-assets/email-images/cd96b659-a5e3-4449-baf1-6abc04232cf1.png	general	{}	image/png	190377	\N	\N	2026-02-27 15:55:04.795997+00	2026-02-27 15:55:04.795997+00
6bf15ad8-e3ea-436f-a019-40dc7d5b20cb	ABOUT-US-MAIN-Copy-of-Copy-of-IMG_1784-R-1536x862	email-images/97d883ea-0030-4e71-b0d9-c0f294f682a9.jpg	https://bulplzknfbietpmdfwlk.supabase.co/storage/v1/object/public/email-assets/email-images/97d883ea-0030-4e71-b0d9-c0f294f682a9.jpg	general	{}	image/jpeg	188308	\N	\N	2026-02-27 18:54:38.470435+00	2026-02-27 18:54:38.470435+00
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.payments (id, registration_batch_id, order_id, payment_session_id, transaction_id, custom_reference, amount, currency, state, event_type, raw_notification, raw_transaction, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: registration_batches; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.registration_batches (id, parent_id, semester_id, cart_snapshot, payment_intent_id, stripe_amount_cents, status, created_at, confirmed_at, family_id, tuition_total, registration_fee_total, recital_fee_total, family_discount_amount, auto_pay_admin_fee_total, grand_total, payment_plan_type, amount_due_now, payment_reference_id) FROM stdin;
\.


--
-- Data for Name: registration_days; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.registration_days (id, registration_id, available_day_id, day, created_at) FROM stdin;
\.


--
-- Data for Name: registrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.registrations (id, dancer_id, user_id, batch_id, status, payment_intent_id, stripe_amount_cents, form_data, total_amount, hold_expires_at, created_at, session_id, registration_batch_id) FROM stdin;
\.


--
-- Data for Name: requirement_waivers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.requirement_waivers (id, class_requirement_id, dancer_id, granted_by_admin_id, notes, granted_at, expires_at) FROM stdin;
\.


--
-- Data for Name: semester_audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.semester_audit_logs (id, semester_id, action, performed_by, changes, created_at) FROM stdin;
97e1c27a-f6cf-4aa3-a757-177a3a8e3dd7	f40ff953-cfcd-4069-8042-0e7139fa6cd6	published_now	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	\N	2026-02-27 04:21:20.30376+00
98a33ca7-9691-41e5-9cd2-104b3119cb99	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	scheduled_publish	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	\N	2026-02-27 16:20:33.643962+00
15d2baab-7e91-4ca1-8520-2b229ef925e9	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	scheduled_publish	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	\N	2026-02-27 16:20:34.118177+00
83f4253e-37a1-4a03-96c6-9a0f25414923	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	saved_draft	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	\N	2026-02-27 17:33:20.377361+00
e957dcd4-fdf7-4a64-9ca1-0051edd0319f	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	published_now	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	\N	2026-02-27 19:01:00.450581+00
fc5bcf81-86e5-4b91-ad94-6fd9bf316a19	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	unpublished	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	\N	2026-02-27 19:08:42.452477+00
2aa75810-45b2-4052-bd5c-40f495ecf039	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	published_now	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	\N	2026-02-27 19:09:14.708804+00
73d81652-67c7-49d0-b938-c524a65bc739	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	unpublished	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	\N	2026-03-01 23:44:02.087268+00
305a3e83-3cea-4d6b-8462-0edb41640fdc	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	published_now	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	\N	2026-03-02 00:10:34.04381+00
dc0248d9-26ea-41c9-a317-551511186ad7	d9d5b059-9abb-48d6-981d-8dfa163e0956	published_now	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	\N	2026-03-02 00:12:32.006214+00
01aacf2f-c19d-4b98-aef8-ab540c903347	d9d5b059-9abb-48d6-981d-8dfa163e0956	unpublished	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	\N	2026-03-02 00:14:08.413379+00
481238fa-2b04-4a3a-958c-e1ef3d46b8b1	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	saved_draft	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	\N	2026-03-02 19:16:24.935089+00
390fd121-9219-4ccd-a001-392bf5532180	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	published_now	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	\N	2026-03-02 19:18:49.187436+00
30d55e60-edcf-43fd-aefc-9e968f624ec8	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	saved_draft	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	\N	2026-03-02 19:19:47.989607+00
62ae4f64-a8ba-40c7-96e3-4ba125363631	c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	saved_draft	64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	\N	2026-03-02 19:23:08.896639+00
\.


--
-- Data for Name: semester_discounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.semester_discounts (semester_id, discount_id) FROM stdin;
5038f261-a4b2-4f80-b1b9-cbc51dd467ce	701b27b9-92ae-4280-a908-a7aad8748837
\.


--
-- Data for Name: semester_fee_config; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.semester_fee_config (semester_id, registration_fee_per_child, family_discount_amount, auto_pay_admin_fee_monthly, auto_pay_installment_count, created_at, updated_at) FROM stdin;
f40ff953-cfcd-4069-8042-0e7139fa6cd6	40.00	50.00	5.00	5	2026-02-27 04:13:11.876096+00	2026-02-27 04:13:11.876096+00
5038f261-a4b2-4f80-b1b9-cbc51dd467ce	40.00	50.00	5.00	5	2026-02-27 18:44:23.791852+00	2026-02-27 18:44:23.791852+00
\.


--
-- Data for Name: semester_payment_installments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.semester_payment_installments (id, semester_id, installment_number, amount, due_date) FROM stdin;
\.


--
-- Data for Name: semester_payment_plans; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.semester_payment_plans (semester_id, type, deposit_amount, deposit_percent, installment_count, due_date, created_at) FROM stdin;
5038f261-a4b2-4f80-b1b9-cbc51dd467ce	pay_in_full	\N	\N	\N	2026-02-28	2026-02-27 18:44:23.05331+00
\.


--
-- Data for Name: semesters; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.semesters (id, name, description, status, tracking_mode, capacity_warning_threshold, registration_form, confirmation_email, waitlist_settings, publish_at, published_at, deleted_at, created_at, updated_at, created_by, updated_by) FROM stdin;
f40ff953-cfcd-4069-8042-0e7139fa6cd6	Fall 2025 – Spring 2026	AYDT full academic year program	published	f	\N	{}	{}	{"enabled": false}	2026-02-27 04:21:18.916+00	2026-02-27 04:21:18.916+00	\N	2026-02-27 04:13:11.876096+00	2026-02-27 04:21:18.916+00	\N	\N
5038f261-a4b2-4f80-b1b9-cbc51dd467ce	Fall 2025 – Spring 2026 (Copy)	\N	draft	f	0	{"elements": [{"id": "07bc48e6-d5a6-4ffb-838a-58402e34ca9b", "type": "question", "label": "birthday", "required": true, "inputType": "date", "sessionIds": ["d54083b3-8e29-4d7e-9f68-e7d92e0c37d2", "bd103305-534e-43b9-84da-68b40fa08e5b", "a112b465-08d7-4c79-9c35-9ffd38e9626d", "22e77866-5c5d-47ed-90d0-d90e60d79c94", "2279ddcc-d824-49f3-bca5-c54a0973411b", "29c7ed28-5ed0-4bf6-96df-4e59ee826c0e", "702fe4ed-5a3d-4ccf-b354-af5f4914f401", "831f4fb5-6c62-4131-8e4d-c7275eceeb53", "59553be1-3ff9-48df-91e3-0dea3469843a", "3ff2437c-6591-4f1e-8c41-35a1b5be31e5", "ff959145-caf5-4cdc-bf62-c53e5081a324", "562e5105-65bd-41cc-987f-55f0be6d9bea", "44e839d4-b5a1-4126-aa3d-e5f2542b4d81", "2c324dd3-046d-4d31-aa5b-b3fabe968de6", "c5440b64-e454-4d7d-ad10-845945278f7a"]}, {"id": "3bc99c87-41aa-4b46-927b-548422e6ff22", "type": "question", "label": "first name", "required": true, "inputType": "short_answer", "sessionIds": ["d54083b3-8e29-4d7e-9f68-e7d92e0c37d2", "bd103305-534e-43b9-84da-68b40fa08e5b", "a112b465-08d7-4c79-9c35-9ffd38e9626d", "22e77866-5c5d-47ed-90d0-d90e60d79c94", "2279ddcc-d824-49f3-bca5-c54a0973411b", "29c7ed28-5ed0-4bf6-96df-4e59ee826c0e", "702fe4ed-5a3d-4ccf-b354-af5f4914f401", "831f4fb5-6c62-4131-8e4d-c7275eceeb53", "59553be1-3ff9-48df-91e3-0dea3469843a", "3ff2437c-6591-4f1e-8c41-35a1b5be31e5", "ff959145-caf5-4cdc-bf62-c53e5081a324", "562e5105-65bd-41cc-987f-55f0be6d9bea", "44e839d4-b5a1-4126-aa3d-e5f2542b4d81", "2c324dd3-046d-4d31-aa5b-b3fabe968de6", "c5440b64-e454-4d7d-ad10-845945278f7a"], "reportLabel": "first_name"}, {"id": "dd5e1405-d21d-43b4-b043-9cc6db15e910", "type": "subheader", "label": "Parent Information below", "subtitle": "More info"}, {"id": "1b54d1d0-4963-4cea-84c0-7f8d7d705193", "type": "text_block", "label": "Hello Happy Holidays", "htmlContent": "<h1 style=\\"text-align: center;\\">Hello <span style=\\"color: rgb(220, 38, 38);\\">Happy</span> <span style=\\"color: rgb(22, 163, 74);\\">Holidays</span></h1><p></p>"}]}	{"subject": "AYDT SUBJECT", "fromName": "AYDT Admin", "htmlBody": "<img class=\\"email-image\\" src=\\"https://bulplzknfbietpmdfwlk.supabase.co/storage/v1/object/public/email-assets/email-images/97d883ea-0030-4e71-b0d9-c0f294f682a9.jpg\\" alt=\\"ABOUT-US-MAIN-Copy-of-Copy-of-IMG_1784-R-1536x862\\" data-layout=\\"banner\\" data-align=\\"left\\" data-banner-height=\\"medium\\" data-image-id=\\"6bf15ad8-e3ea-436f-a019-40dc7d5b20cb\\"><h1 style=\\"text-align: center;\\">Dear [Parent/Guardian Name],</h1><p><code>{{first_name}}</code><span style=\\"color: lab(47.7841 -0.393182 -10.0268); font-family: Arial, Helvetica, sans-serif; font-size: 14px;\\">, </span><code>{{session_title}}</code><span style=\\"color: lab(47.7841 -0.393182 -10.0268); font-family: Arial, Helvetica, sans-serif; font-size: 14px;\\">, </span><code>{{total_amount}}</code><span style=\\"color: lab(47.7841 -0.393182 -10.0268); font-family: Arial, Helvetica, sans-serif; font-size: 14px;\\">, </span><code>{{registration_date}}</code></p><ul><li><p>Thank you for completing your registration with AYDT. We’re pleased to confirm that your student, [Student Name], has been successfully enrolled in the following class(es):</p><ul><li><p><strong>Class:</strong> [Class Name]</p></li><li><p><strong>Session:</strong> [Day(s) and Time]</p></li><li><p><strong>Start Date:</strong> [Start Date]</p></li><li><p><strong>Location:</strong> [Studio Location]</p></li></ul></li></ul><p>If you selected a payment plan, your scheduled installments will be processed according to the agreed timeline. You can view your registration details, payment history, and any outstanding balances at any time through your parent portal.</p><p>Please review the class schedule carefully. If you need to request a change or notice an error in your registration, contact us at [Support Email] within 48 hours so we can assist promptly.</p><p>We look forward to a productive and rewarding season at AYDT. If you have any questions before classes begin, feel free to reach out.</p><p>Sincerely,<br>Ethan Flores<br>AYDT Administration</p>", "fromEmail": "ethan@madascollective.com"}	{"enabled": false}	2026-02-27 19:09:14.237+00	2026-02-27 19:09:14.237+00	\N	2026-02-27 18:22:15.595178+00	2026-03-01 23:44:01.84+00	\N	\N
d9d5b059-9abb-48d6-981d-8dfa163e0956	Untitled Semester	\N	draft	f	0	{"elements": []}	{"subject": "", "fromName": "", "htmlBody": "", "fromEmail": ""}	{"enabled": false}	2026-03-02 00:12:31.678+00	2026-03-02 00:12:31.678+00	\N	2026-03-02 00:11:25.725165+00	2026-03-02 00:14:08.057+00	\N	\N
8ff5b44c-cd22-4bd4-b85f-632bf3390172	Untitled Semester	\N	draft	f	0	{"elements": []}	{"subject": "", "fromName": "", "htmlBody": "", "fromEmail": ""}	{"enabled": false}	\N	\N	\N	2026-03-02 00:23:39.648571+00	2026-03-02 00:23:39.648571+00	\N	\N
c01c9f2f-1ec8-4f68-80bc-8a8077f921ec	Fall 2025 – Spring 2026 (Copy)	\N	draft	f	\N	{"elements": [{"id": "b56d5dc6-f8a5-4239-99c0-ea741daf5ab3", "type": "question", "label": "another question", "required": true, "inputType": "date", "sessionIds": ["2c820960-20a7-4dff-8b99-7ad7c161f2d3", "88954e69-739f-4e7d-b968-89a83be56d75", "63fc6a6b-c09b-420e-8d90-ad4193b2d6b3", "bbb59df8-644c-47a9-8dc1-d065d9e79869", "7636bf36-d72e-4e27-90c8-9106e5e7b6ae", "3580efd0-e953-48cc-b8c2-81568c7c2cbd", "8c5599f8-edad-4140-9b13-3911d34bd54c", "b70829c4-6d07-4941-9a72-3a3cd97f15a7", "308b5a34-f360-44ab-bc1c-ec1183265c10", "515a381f-9b50-47c4-b647-a20a629f994d", "67ae7f9d-97a3-4ea1-93de-5a510964452c", "248ac18b-4fa9-4611-8f41-806c8b9a75dc", "f3c0b98e-7b9f-426d-aba5-fbb2ff11d0b6", "0d51e747-61ee-4595-9d9c-a170f32a6706", "290c7258-dda2-423e-94ee-c27a975678e2"], "reportLabel": "birth date"}, {"id": "13f2f908-aee5-43fd-b2c8-86d35fd3b3ea", "type": "question", "label": "Some Unique Question", "required": false, "inputType": "short_answer"}, {"id": "9b2fc644-7de1-47da-bfe7-3ec8f9821935", "type": "subheader", "label": "Parent Info Below", "subtitle": "Parent / guardian"}, {"id": "4dafefaf-676e-4937-bece-591c4edce6ee", "type": "text_block", "label": "Some custom information here", "htmlContent": "<h1 style=\\"text-align: center;\\"><span style=\\"color: rgb(22, 163, 74);\\"><em>Some custom information here</em></span></h1><p></p>"}]}	{"subject": "Your reg is confirmed!", "fromName": "AYDT Studio", "htmlBody": "<img class=\\"email-image\\" src=\\"https://bulplzknfbietpmdfwlk.supabase.co/storage/v1/object/public/email-assets/email-images/cd96b659-a5e3-4449-baf1-6abc04232cf1.png\\" alt=\\"Screen Shot 2025-10-14 at 10.16.22 AM\\" data-layout=\\"banner\\" data-align=\\"left\\" data-banner-height=\\"medium\\" data-image-id=\\"cb1a0138-2455-48d8-b5bd-665b89ea462f\\"><p style=\\"text-align: left;\\">Dear [Parent/Guardian Name],</p><p>Thank you for completing your registration with AYDT. We’re pleased to confirm that your student, [Student Name], has been successfully enrolled in the following class(es):</p><ul><li><p><strong>Class:</strong> [Class Name]</p></li><li><p><strong>Session:</strong> [Day(s) and Time]</p></li><li><p><strong>Start Date:</strong> [Start Date]</p></li><li><p><strong>Location:</strong> [Studio Location]</p></li></ul><p>If you selected a payment plan, your scheduled installments will be processed according to the agreed timeline. You can view your registration details, payment history, and any outstanding balances at any time through your parent portal.</p><p>Please review the class schedule carefully. If you need to request a change or notice an error in your registration, contact us at [Support Email] within 48 hours so we can assist promptly.</p><p>We look forward to a productive and rewarding season at AYDT. If you have any questions before classes begin, feel free to reach out.</p><p>Sincerely,<br>Ethan Flores<br>AYDT Administration</p><p><code>{{first_name}}</code><span style=\\"color: lab(47.7841 -0.393182 -10.0268); font-family: Arial, Helvetica, sans-serif; font-size: 14px;\\">, </span><code>{{session_title}}</code><span style=\\"color: lab(47.7841 -0.393182 -10.0268); font-family: Arial, Helvetica, sans-serif; font-size: 14px;\\">, </span><code>{{total_amount}}</code><span style=\\"color: lab(47.7841 -0.393182 -10.0268); font-family: Arial, Helvetica, sans-serif; font-size: 14px;\\">, </span><code>{{registration_date}}</code><span style=\\"color: lab(47.7841 -0.393182 -10.0268); font-family: Arial, Helvetica, sans-serif; font-size: 14px;\\">.</span></p>", "fromEmail": "ethan@madasacollective.com"}	{"enabled": false}	\N	\N	\N	2026-02-27 15:33:01.66882+00	2026-03-02 19:23:06.709+00	\N	\N
\.


--
-- Data for Name: session_group_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.session_group_sessions (id, session_group_id, created_at, session_id) FROM stdin;
195c6034-b383-49ff-bcf3-0b60646a9fb3	3c00b84c-a866-47fb-9e16-3e2b9cc4515b	2026-03-01 23:44:10.781099+00	a112b465-08d7-4c79-9c35-9ffd38e9626d
29d50f19-afd3-4de0-b822-b8193d572c1c	3c00b84c-a866-47fb-9e16-3e2b9cc4515b	2026-03-01 23:44:10.781099+00	22e77866-5c5d-47ed-90d0-d90e60d79c94
98d70839-4e71-44d0-a45a-f1e4885c2b6a	3c00b84c-a866-47fb-9e16-3e2b9cc4515b	2026-03-01 23:44:10.781099+00	d54083b3-8e29-4d7e-9f68-e7d92e0c37d2
3c72f027-351a-4336-8f2e-4976c0e46d99	3c00b84c-a866-47fb-9e16-3e2b9cc4515b	2026-03-01 23:44:10.781099+00	bd103305-534e-43b9-84da-68b40fa08e5b
98187277-2d08-461b-a5df-f53e20c0ad19	b8a1b1f3-2304-4d24-bb12-294717dddc6d	2026-03-01 23:44:10.781099+00	2279ddcc-d824-49f3-bca5-c54a0973411b
e4020867-76fb-44d0-9077-591e5d29dbf0	b8a1b1f3-2304-4d24-bb12-294717dddc6d	2026-03-01 23:44:10.781099+00	29c7ed28-5ed0-4bf6-96df-4e59ee826c0e
6cfd5ebd-1016-4d85-8a46-7eaa5d5b9a8b	b8a1b1f3-2304-4d24-bb12-294717dddc6d	2026-03-01 23:44:10.781099+00	702fe4ed-5a3d-4ccf-b354-af5f4914f401
\.


--
-- Data for Name: session_group_tags; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.session_group_tags (id, session_group_id, tag, created_at) FROM stdin;
\.


--
-- Data for Name: session_groups; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.session_groups (id, semester_id, name, description, created_at) FROM stdin;
3c00b84c-a866-47fb-9e16-3e2b9cc4515b	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	Group 1	\N	2026-02-27 18:50:11.002208+00
b8a1b1f3-2304-4d24-bb12-294717dddc6d	5038f261-a4b2-4f80-b1b9-cbc51dd467ce	Group 2	\N	2026-02-27 18:50:11.002208+00
\.


--
-- Data for Name: session_occurrence_dates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.session_occurrence_dates (id, session_id, date, is_cancelled, cancellation_reason, created_at) FROM stdin;
4f2b6533-b439-45d5-9ccf-03d382eac3ac	d54083b3-8e29-4d7e-9f68-e7d92e0c37d2	2026-03-03	f	\N	2026-03-01 23:44:08.920432+00
f9375013-d0bc-4766-b2c3-6c8b7e029993	d54083b3-8e29-4d7e-9f68-e7d92e0c37d2	2026-03-10	f	\N	2026-03-01 23:44:08.920432+00
31d10e7f-c1d1-4175-8b98-2ba6a83665ac	d54083b3-8e29-4d7e-9f68-e7d92e0c37d2	2026-03-17	f	\N	2026-03-01 23:44:08.920432+00
\.


--
-- Data for Name: session_tags; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.session_tags (id, session_id, tag, created_at) FROM stdin;
\.


--
-- Data for Name: tuition_rate_bands; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tuition_rate_bands (id, semester_id, division, weekly_class_count, base_tuition, recital_fee_included, notes, created_at, updated_at) FROM stdin;
074db8b5-7aae-474f-99ba-05e3dafa0b71	f40ff953-cfcd-4069-8042-0e7139fa6cd6	junior	1	870.93	55.00	\N	2026-02-27 04:13:11.876096+00	2026-02-27 04:13:11.876096+00
4f278c48-3f56-48ad-a0c7-febd1bf18a36	f40ff953-cfcd-4069-8042-0e7139fa6cd6	junior	2	1663.06	55.00	\N	2026-02-27 04:13:11.876096+00	2026-02-27 04:13:11.876096+00
964b3870-bbb1-474b-8f4a-69a5a763d5bd	f40ff953-cfcd-4069-8042-0e7139fa6cd6	junior	3	2416.39	55.00	\N	2026-02-27 04:13:11.876096+00	2026-02-27 04:13:11.876096+00
eee82920-5b53-42a3-9181-ab02ee08b325	f40ff953-cfcd-4069-8042-0e7139fa6cd6	senior	1	916.43	80.00	\N	2026-02-27 04:13:11.876096+00	2026-02-27 04:13:11.876096+00
442c2010-1a6a-43df-9e4c-5b1467e7485d	f40ff953-cfcd-4069-8042-0e7139fa6cd6	senior	2	1738.04	80.00	\N	2026-02-27 04:13:11.876096+00	2026-02-27 04:13:11.876096+00
63fca8f9-d574-4cb8-8830-eef5ff535e8c	f40ff953-cfcd-4069-8042-0e7139fa6cd6	senior	3	2519.83	80.00	\N	2026-02-27 04:13:11.876096+00	2026-02-27 04:13:11.876096+00
763730e1-23aa-4089-94ec-1dbb4363c3bf	f40ff953-cfcd-4069-8042-0e7139fa6cd6	senior	4	3261.80	80.00	\N	2026-02-27 04:13:11.876096+00	2026-02-27 04:13:11.876096+00
cfe1e944-7643-4802-b129-369e81a91c6c	f40ff953-cfcd-4069-8042-0e7139fa6cd6	senior	5	3963.94	80.00	\N	2026-02-27 04:13:11.876096+00	2026-02-27 04:13:11.876096+00
902d3678-59a7-4c73-8074-fe1c28881227	f40ff953-cfcd-4069-8042-0e7139fa6cd6	senior	6	4626.26	80.00	\N	2026-02-27 04:13:11.876096+00	2026-02-27 04:13:11.876096+00
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, family_id, email, first_name, middle_name, last_name, phone_number, is_primary_parent, role, status, display_name, signature_html, reply_to_email, created_at) FROM stdin;
20000000-0000-0000-0000-000000000001	\N	super@studio.com	System	\N	Admin	\N	f	super_admin	active	\N	\N	\N	2026-02-25 12:43:54.980005+00
20000000-0000-0000-0000-000000000002	10000000-0000-0000-0000-000000000001	amy@smith.com	Amy	\N	Smith	\N	t	parent	active	\N	\N	\N	2026-02-25 12:43:54.980005+00
20000000-0000-0000-0000-000000000003	10000000-0000-0000-0000-000000000002	brian@johnson.com	Brian	\N	Johnson	\N	t	parent	active	\N	\N	\N	2026-02-25 12:43:54.980005+00
20000000-0000-0000-0000-000000000004	10000000-0000-0000-0000-000000000003	carla@martinez.com	Carla	\N	Martinez	\N	t	parent	active	\N	\N	\N	2026-02-25 12:43:54.980005+00
64ebf65c-e32f-4e22-9440-e7bb5a0fee8d	b71f447d-3334-4721-b32b-401f655e661e	ethanf.flores@gmail.com	Ethan	\N	Flores	\N	f	super_admin	active	\N	\N	\N	2026-02-25 12:44:17.654123+00
ac5da674-8f8b-4039-8b9a-f9f2f34aec7e	66bbff98-668e-4033-86b8-fc41258f67e7	ethan.flores@gmail.com	Ethan	\N	Flores	\N	f	parent	active	\N	\N	\N	2026-02-26 00:54:41.535705+00
aaaaaaaa-1111-1111-1111-111111111111	aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa	ethan@example.com	Ethan	\N	Flores	\N	t	parent	active	\N	\N	\N	2026-02-27 01:26:31.974756+00
bbbbbbbb-2222-2222-2222-222222222222	bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb	sarah@example.com	Sarah	\N	Johnson	\N	t	parent	active	\N	\N	\N	2026-02-27 01:26:31.974756+00
cccccccc-3333-3333-3333-333333333333	cccccccc-cccc-cccc-cccc-cccccccccccc	luis@example.com	Luis	\N	Martinez	\N	t	parent	active	\N	\N	\N	2026-02-27 01:26:31.974756+00
\.


--
-- Data for Name: waitlist_entries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.waitlist_entries (id, dancer_id, "position", status, invite_token, invitation_sent_at, invitation_expires_at, created_at, session_id) FROM stdin;
\.


--
-- Name: authorized_pickups authorized_pickups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authorized_pickups
    ADD CONSTRAINT authorized_pickups_pkey PRIMARY KEY (id);


--
-- Name: batch_payment_installments batch_payment_installments_batch_id_installment_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_payment_installments
    ADD CONSTRAINT batch_payment_installments_batch_id_installment_number_key UNIQUE (batch_id, installment_number);


--
-- Name: batch_payment_installments batch_payment_installments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_payment_installments
    ADD CONSTRAINT batch_payment_installments_pkey PRIMARY KEY (id);


--
-- Name: class_requirements class_requirements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_requirements
    ADD CONSTRAINT class_requirements_pkey PRIMARY KEY (id);


--
-- Name: class_sessions class_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_pkey PRIMARY KEY (id);


--
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--
-- Name: dancers dancers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dancers
    ADD CONSTRAINT dancers_pkey PRIMARY KEY (id);


--
-- Name: discount_rule_sessions discount_rule_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_rule_sessions
    ADD CONSTRAINT discount_rule_sessions_pkey PRIMARY KEY (id);


--
-- Name: discount_rules discount_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_rules
    ADD CONSTRAINT discount_rules_pkey PRIMARY KEY (id);


--
-- Name: discounts discounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discounts
    ADD CONSTRAINT discounts_pkey PRIMARY KEY (id);


--
-- Name: email_activity_logs email_activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_activity_logs
    ADD CONSTRAINT email_activity_logs_pkey PRIMARY KEY (id);


--
-- Name: email_deliveries email_deliveries_email_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_deliveries
    ADD CONSTRAINT email_deliveries_email_id_user_id_key UNIQUE (email_id, user_id);


--
-- Name: email_deliveries email_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_deliveries
    ADD CONSTRAINT email_deliveries_pkey PRIMARY KEY (id);


--
-- Name: email_recipient_selections email_recipient_selections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_recipient_selections
    ADD CONSTRAINT email_recipient_selections_pkey PRIMARY KEY (id);


--
-- Name: email_recipients email_recipients_email_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_recipients
    ADD CONSTRAINT email_recipients_email_id_user_id_key UNIQUE (email_id, user_id);


--
-- Name: email_recipients email_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_recipients
    ADD CONSTRAINT email_recipients_pkey PRIMARY KEY (id);


--
-- Name: email_subscriptions email_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_subscriptions
    ADD CONSTRAINT email_subscriptions_pkey PRIMARY KEY (user_id);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: emails emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emails
    ADD CONSTRAINT emails_pkey PRIMARY KEY (id);


--
-- Name: families families_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.families
    ADD CONSTRAINT families_pkey PRIMARY KEY (id);


--
-- Name: media_images media_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_images
    ADD CONSTRAINT media_images_pkey PRIMARY KEY (id);


--
-- Name: media_images media_images_storage_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_images
    ADD CONSTRAINT media_images_storage_path_key UNIQUE (storage_path);


--
-- Name: class_sessions no_duplicate_class_slot; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT no_duplicate_class_slot UNIQUE (class_id, day_of_week, start_time);


--
-- Name: payments payments_custom_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_custom_reference_key UNIQUE (custom_reference);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: payments payments_registration_batch_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_registration_batch_id_key UNIQUE (registration_batch_id);


--
-- Name: registration_batches registration_batches_payment_intent_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_batches
    ADD CONSTRAINT registration_batches_payment_intent_id_key UNIQUE (payment_intent_id);


--
-- Name: registration_batches registration_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_batches
    ADD CONSTRAINT registration_batches_pkey PRIMARY KEY (id);


--
-- Name: registration_days registration_days_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_days
    ADD CONSTRAINT registration_days_pkey PRIMARY KEY (id);


--
-- Name: registration_days registration_days_registration_id_available_day_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_days
    ADD CONSTRAINT registration_days_registration_id_available_day_id_key UNIQUE (registration_id, available_day_id);


--
-- Name: registrations registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrations
    ADD CONSTRAINT registrations_pkey PRIMARY KEY (id);


--
-- Name: requirement_waivers requirement_waivers_class_requirement_id_dancer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requirement_waivers
    ADD CONSTRAINT requirement_waivers_class_requirement_id_dancer_id_key UNIQUE (class_requirement_id, dancer_id);


--
-- Name: requirement_waivers requirement_waivers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requirement_waivers
    ADD CONSTRAINT requirement_waivers_pkey PRIMARY KEY (id);


--
-- Name: semester_audit_logs semester_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.semester_audit_logs
    ADD CONSTRAINT semester_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: semester_discounts semester_discounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.semester_discounts
    ADD CONSTRAINT semester_discounts_pkey PRIMARY KEY (semester_id, discount_id);


--
-- Name: semester_fee_config semester_fee_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.semester_fee_config
    ADD CONSTRAINT semester_fee_config_pkey PRIMARY KEY (semester_id);


--
-- Name: semester_payment_installments semester_payment_installments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.semester_payment_installments
    ADD CONSTRAINT semester_payment_installments_pkey PRIMARY KEY (id);


--
-- Name: semester_payment_installments semester_payment_installments_semester_id_installment_numbe_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.semester_payment_installments
    ADD CONSTRAINT semester_payment_installments_semester_id_installment_numbe_key UNIQUE (semester_id, installment_number);


--
-- Name: semester_payment_plans semester_payment_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.semester_payment_plans
    ADD CONSTRAINT semester_payment_plans_pkey PRIMARY KEY (semester_id);


--
-- Name: semesters semesters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.semesters
    ADD CONSTRAINT semesters_pkey PRIMARY KEY (id);


--
-- Name: session_group_sessions session_group_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_group_sessions
    ADD CONSTRAINT session_group_sessions_pkey PRIMARY KEY (id);


--
-- Name: session_group_tags session_group_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_group_tags
    ADD CONSTRAINT session_group_tags_pkey PRIMARY KEY (id);


--
-- Name: session_group_tags session_group_tags_session_group_id_tag_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_group_tags
    ADD CONSTRAINT session_group_tags_session_group_id_tag_key UNIQUE (session_group_id, tag);


--
-- Name: session_groups session_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_groups
    ADD CONSTRAINT session_groups_pkey PRIMARY KEY (id);


--
-- Name: session_occurrence_dates session_occurrence_dates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_occurrence_dates
    ADD CONSTRAINT session_occurrence_dates_pkey PRIMARY KEY (id);


--
-- Name: session_occurrence_dates session_occurrence_dates_session_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_occurrence_dates
    ADD CONSTRAINT session_occurrence_dates_session_id_date_key UNIQUE (session_id, date);


--
-- Name: session_tags session_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_tags
    ADD CONSTRAINT session_tags_pkey PRIMARY KEY (id);


--
-- Name: session_tags session_tags_session_id_tag_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_tags
    ADD CONSTRAINT session_tags_session_id_tag_key UNIQUE (session_id, tag);


--
-- Name: tuition_rate_bands tuition_rate_bands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tuition_rate_bands
    ADD CONSTRAINT tuition_rate_bands_pkey PRIMARY KEY (id);


--
-- Name: tuition_rate_bands tuition_rate_bands_semester_id_division_weekly_class_count_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tuition_rate_bands
    ADD CONSTRAINT tuition_rate_bands_semester_id_division_weekly_class_count_key UNIQUE (semester_id, division, weekly_class_count);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: waitlist_entries waitlist_entries_invite_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist_entries
    ADD CONSTRAINT waitlist_entries_invite_token_key UNIQUE (invite_token);


--
-- Name: waitlist_entries waitlist_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist_entries
    ADD CONSTRAINT waitlist_entries_pkey PRIMARY KEY (id);


--
-- Name: idx_batches_family_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batches_family_id ON public.registration_batches USING btree (family_id);


--
-- Name: idx_batches_semester_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batches_semester_id ON public.registration_batches USING btree (semester_id);


--
-- Name: idx_batches_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batches_status ON public.registration_batches USING btree (status);


--
-- Name: idx_class_requirements_class_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_requirements_class_id ON public.class_requirements USING btree (class_id);


--
-- Name: idx_class_sessions_class_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_sessions_class_id ON public.class_sessions USING btree (class_id);


--
-- Name: idx_class_sessions_semester_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_sessions_semester_id ON public.class_sessions USING btree (semester_id);


--
-- Name: idx_classes_division; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_classes_division ON public.classes USING btree (division);


--
-- Name: idx_classes_semester_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_classes_semester_id ON public.classes USING btree (semester_id);


--
-- Name: idx_email_activity_email_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_activity_email_id ON public.email_activity_logs USING btree (email_id);


--
-- Name: idx_email_deliveries_email_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_deliveries_email_id ON public.email_deliveries USING btree (email_id);


--
-- Name: idx_email_deliveries_resend_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_deliveries_resend_id ON public.email_deliveries USING btree (resend_message_id) WHERE (resend_message_id IS NOT NULL);


--
-- Name: idx_email_deliveries_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_deliveries_status ON public.email_deliveries USING btree (status);


--
-- Name: idx_email_deliveries_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_deliveries_user_id ON public.email_deliveries USING btree (user_id);


--
-- Name: idx_email_recipients_email_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_recipients_email_id ON public.email_recipients USING btree (email_id);


--
-- Name: idx_email_recipients_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_recipients_user_id ON public.email_recipients USING btree (user_id);


--
-- Name: idx_email_selections_email_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_selections_email_id ON public.email_recipient_selections USING btree (email_id);


--
-- Name: idx_email_subscriptions_unsub; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_subscriptions_unsub ON public.email_subscriptions USING btree (is_subscribed) WHERE (is_subscribed = false);


--
-- Name: idx_email_templates_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_templates_created_at ON public.email_templates USING btree (created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_emails_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_emails_created_at ON public.emails USING btree (created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_emails_scheduled_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_emails_scheduled_at ON public.emails USING btree (scheduled_at) WHERE ((status = 'scheduled'::text) AND (deleted_at IS NULL));


--
-- Name: idx_emails_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_emails_sent_at ON public.emails USING btree (sent_at DESC) WHERE (status = 'sent'::text);


--
-- Name: idx_emails_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_emails_status ON public.emails USING btree (status) WHERE (deleted_at IS NULL);


--
-- Name: idx_installments_batch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_installments_batch_id ON public.batch_payment_installments USING btree (batch_id);


--
-- Name: idx_installments_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_installments_due_date ON public.batch_payment_installments USING btree (due_date) WHERE (status = 'scheduled'::text);


--
-- Name: idx_media_images_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_images_created_at ON public.media_images USING btree (created_at DESC);


--
-- Name: idx_media_images_folder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_images_folder ON public.media_images USING btree (folder);


--
-- Name: idx_media_images_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_images_tags ON public.media_images USING gin (tags);


--
-- Name: idx_occurrence_dates_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_occurrence_dates_session_id ON public.session_occurrence_dates USING btree (session_id);


--
-- Name: idx_payments_batch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_batch_id ON public.payments USING btree (registration_batch_id);


--
-- Name: idx_payments_custom_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_custom_reference ON public.payments USING btree (custom_reference);


--
-- Name: idx_payments_transaction_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_transaction_id ON public.payments USING btree (transaction_id) WHERE (transaction_id IS NOT NULL);


--
-- Name: idx_rate_bands_semester_division; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_bands_semester_division ON public.tuition_rate_bands USING btree (semester_id, division);


--
-- Name: idx_registration_batches_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registration_batches_parent_id ON public.registration_batches USING btree (parent_id);


--
-- Name: idx_registration_batches_payment_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registration_batches_payment_intent ON public.registration_batches USING btree (payment_intent_id) WHERE (payment_intent_id IS NOT NULL);


--
-- Name: idx_registration_days_available_day_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registration_days_available_day_id ON public.registration_days USING btree (available_day_id);


--
-- Name: idx_registration_days_registration_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registration_days_registration_id ON public.registration_days USING btree (registration_id);


--
-- Name: idx_registrations_batch_fk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registrations_batch_fk ON public.registrations USING btree (registration_batch_id) WHERE (registration_batch_id IS NOT NULL);


--
-- Name: idx_registrations_batch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registrations_batch_id ON public.registrations USING btree (batch_id);


--
-- Name: idx_registrations_hold_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registrations_hold_expires ON public.registrations USING btree (hold_expires_at);


--
-- Name: idx_registrations_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registrations_session_id ON public.registrations USING btree (session_id);


--
-- Name: idx_registrations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registrations_status ON public.registrations USING btree (status);


--
-- Name: idx_session_group_sessions_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_group_sessions_group_id ON public.session_group_sessions USING btree (session_group_id);


--
-- Name: idx_session_group_tags_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_group_tags_group_id ON public.session_group_tags USING btree (session_group_id);


--
-- Name: idx_session_groups_semester_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_groups_semester_id ON public.session_groups USING btree (semester_id);


--
-- Name: idx_session_tags_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_tags_session_id ON public.session_tags USING btree (session_id);


--
-- Name: idx_users_family_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_family_id ON public.users USING btree (family_id);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_waitlist_entries_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waitlist_entries_session_id ON public.waitlist_entries USING btree (session_id);


--
-- Name: idx_waitlist_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waitlist_token ON public.waitlist_entries USING btree (invite_token);


--
-- Name: idx_waivers_dancer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waivers_dancer_id ON public.requirement_waivers USING btree (dancer_id);


--
-- Name: idx_waivers_requirement_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waivers_requirement_id ON public.requirement_waivers USING btree (class_requirement_id);


--
-- Name: registrations_batch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX registrations_batch_id_idx ON public.registrations USING btree (batch_id) WHERE (batch_id IS NOT NULL);


--
-- Name: email_analytics _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.email_analytics AS
 SELECT e.id,
    e.subject,
    e.sent_at,
    e.sender_name,
    count(DISTINCT er.user_id) AS recipient_count,
    count(DISTINCT
        CASE
            WHEN (ed.status = 'delivered'::text) THEN ed.user_id
            ELSE NULL::uuid
        END) AS delivered_count,
    count(DISTINCT
        CASE
            WHEN (ed.opened_at IS NOT NULL) THEN ed.user_id
            ELSE NULL::uuid
        END) AS opened_count,
    count(DISTINCT
        CASE
            WHEN (ed.clicked_at IS NOT NULL) THEN ed.user_id
            ELSE NULL::uuid
        END) AS clicked_count,
    count(DISTINCT
        CASE
            WHEN (ed.bounced_at IS NOT NULL) THEN ed.user_id
            ELSE NULL::uuid
        END) AS bounced_count,
    round(((100.0 * (count(DISTINCT
        CASE
            WHEN (ed.opened_at IS NOT NULL) THEN ed.user_id
            ELSE NULL::uuid
        END))::numeric) / (NULLIF(count(DISTINCT er.user_id), 0))::numeric), 1) AS open_rate,
    round(((100.0 * (count(DISTINCT
        CASE
            WHEN (ed.clicked_at IS NOT NULL) THEN ed.user_id
            ELSE NULL::uuid
        END))::numeric) / (NULLIF(count(DISTINCT er.user_id), 0))::numeric), 1) AS click_rate
   FROM ((public.emails e
     LEFT JOIN public.email_recipients er ON ((er.email_id = e.id)))
     LEFT JOIN public.email_deliveries ed ON ((ed.email_id = e.id)))
  WHERE ((e.status = 'sent'::text) AND (e.deleted_at IS NULL))
  GROUP BY e.id;


--
-- Name: email_deliveries email_deliveries_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER email_deliveries_updated_at BEFORE UPDATE ON public.email_deliveries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_subscriptions email_subscriptions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER email_subscriptions_updated_at BEFORE UPDATE ON public.email_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_templates email_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER email_templates_updated_at BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: emails emails_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER emails_updated_at BEFORE UPDATE ON public.emails FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: semester_discounts lock_discounts_if_published; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lock_discounts_if_published BEFORE INSERT OR DELETE OR UPDATE ON public.semester_discounts FOR EACH ROW EXECUTE FUNCTION public.prevent_child_modification_if_semester_published();


--
-- Name: semester_payment_installments lock_installments_if_published; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lock_installments_if_published BEFORE INSERT OR DELETE OR UPDATE ON public.semester_payment_installments FOR EACH ROW EXECUTE FUNCTION public.prevent_child_modification_if_semester_published();


--
-- Name: semester_payment_plans lock_payment_plan_if_published; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lock_payment_plan_if_published BEFORE INSERT OR DELETE OR UPDATE ON public.semester_payment_plans FOR EACH ROW EXECUTE FUNCTION public.prevent_child_modification_if_semester_published();


--
-- Name: semesters lock_semester_core_if_published; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lock_semester_core_if_published BEFORE UPDATE ON public.semesters FOR EACH ROW EXECUTE FUNCTION public.prevent_semester_core_edit_if_published();


--
-- Name: session_group_sessions lock_session_group_sessions_if_published; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lock_session_group_sessions_if_published BEFORE INSERT OR DELETE OR UPDATE ON public.session_group_sessions FOR EACH ROW EXECUTE FUNCTION public.prevent_session_group_structure_if_published();


--
-- Name: session_group_tags lock_session_group_tags_if_published; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lock_session_group_tags_if_published BEFORE INSERT OR DELETE OR UPDATE ON public.session_group_tags FOR EACH ROW EXECUTE FUNCTION public.prevent_session_group_structure_if_published();


--
-- Name: session_groups lock_session_groups_if_published; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lock_session_groups_if_published BEFORE INSERT OR DELETE OR UPDATE ON public.session_groups FOR EACH ROW EXECUTE FUNCTION public.prevent_session_group_structure_if_published();


--
-- Name: session_tags lock_session_tags_if_published; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lock_session_tags_if_published BEFORE INSERT OR DELETE OR UPDATE ON public.session_tags FOR EACH ROW EXECUTE FUNCTION public.prevent_session_group_structure_if_published();


--
-- Name: media_images media_images_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER media_images_updated_at BEFORE UPDATE ON public.media_images FOR EACH ROW EXECUTE FUNCTION public.update_media_images_updated_at();


--
-- Name: registrations trg_check_registration_time_conflict; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_check_registration_time_conflict BEFORE INSERT OR UPDATE OF session_id, dancer_id, status ON public.registrations FOR EACH ROW EXECUTE FUNCTION public.check_registration_time_conflict();


--
-- Name: authorized_pickups authorized_pickups_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authorized_pickups
    ADD CONSTRAINT authorized_pickups_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;


--
-- Name: batch_payment_installments batch_payment_installments_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_payment_installments
    ADD CONSTRAINT batch_payment_installments_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.registration_batches(id) ON DELETE CASCADE;


--
-- Name: class_requirements class_requirements_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_requirements
    ADD CONSTRAINT class_requirements_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_requirements class_requirements_required_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_requirements
    ADD CONSTRAINT class_requirements_required_class_id_fkey FOREIGN KEY (required_class_id) REFERENCES public.classes(id) ON DELETE SET NULL;


--
-- Name: class_sessions class_sessions_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_sessions class_sessions_cloned_from_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_cloned_from_session_id_fkey FOREIGN KEY (cloned_from_session_id) REFERENCES public.class_sessions(id) ON DELETE SET NULL;


--
-- Name: class_sessions class_sessions_semester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_semester_id_fkey FOREIGN KEY (semester_id) REFERENCES public.semesters(id);


--
-- Name: classes classes_cloned_from_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_cloned_from_class_id_fkey FOREIGN KEY (cloned_from_class_id) REFERENCES public.classes(id) ON DELETE SET NULL;


--
-- Name: classes classes_semester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_semester_id_fkey FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE CASCADE;


--
-- Name: dancers dancers_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dancers
    ADD CONSTRAINT dancers_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;


--
-- Name: dancers dancers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dancers
    ADD CONSTRAINT dancers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: discount_rule_sessions discount_rule_sessions_discount_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_rule_sessions
    ADD CONSTRAINT discount_rule_sessions_discount_id_fkey FOREIGN KEY (discount_id) REFERENCES public.discounts(id) ON DELETE CASCADE;


--
-- Name: discount_rule_sessions discount_rule_sessions_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_rule_sessions
    ADD CONSTRAINT discount_rule_sessions_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.class_sessions(id);


--
-- Name: discount_rules discount_rules_discount_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_rules
    ADD CONSTRAINT discount_rules_discount_id_fkey FOREIGN KEY (discount_id) REFERENCES public.discounts(id) ON DELETE CASCADE;


--
-- Name: email_activity_logs email_activity_logs_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_activity_logs
    ADD CONSTRAINT email_activity_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id);


--
-- Name: email_activity_logs email_activity_logs_email_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_activity_logs
    ADD CONSTRAINT email_activity_logs_email_id_fkey FOREIGN KEY (email_id) REFERENCES public.emails(id) ON DELETE CASCADE;


--
-- Name: email_deliveries email_deliveries_email_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_deliveries
    ADD CONSTRAINT email_deliveries_email_id_fkey FOREIGN KEY (email_id) REFERENCES public.emails(id) ON DELETE CASCADE;


--
-- Name: email_deliveries email_deliveries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_deliveries
    ADD CONSTRAINT email_deliveries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: email_recipient_selections email_recipient_selections_email_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_recipient_selections
    ADD CONSTRAINT email_recipient_selections_email_id_fkey FOREIGN KEY (email_id) REFERENCES public.emails(id) ON DELETE CASCADE;


--
-- Name: email_recipient_selections email_recipient_selections_semester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_recipient_selections
    ADD CONSTRAINT email_recipient_selections_semester_id_fkey FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE SET NULL;


--
-- Name: email_recipient_selections email_recipient_selections_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_recipient_selections
    ADD CONSTRAINT email_recipient_selections_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.class_sessions(id);


--
-- Name: email_recipient_selections email_recipient_selections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_recipient_selections
    ADD CONSTRAINT email_recipient_selections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: email_recipients email_recipients_email_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_recipients
    ADD CONSTRAINT email_recipients_email_id_fkey FOREIGN KEY (email_id) REFERENCES public.emails(id) ON DELETE CASCADE;


--
-- Name: email_recipients email_recipients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_recipients
    ADD CONSTRAINT email_recipients_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: email_subscriptions email_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_subscriptions
    ADD CONSTRAINT email_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: email_templates email_templates_created_by_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_created_by_admin_id_fkey FOREIGN KEY (created_by_admin_id) REFERENCES public.users(id);


--
-- Name: email_templates email_templates_updated_by_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_updated_by_admin_id_fkey FOREIGN KEY (updated_by_admin_id) REFERENCES public.users(id);


--
-- Name: emails emails_created_by_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emails
    ADD CONSTRAINT emails_created_by_admin_id_fkey FOREIGN KEY (created_by_admin_id) REFERENCES public.users(id);


--
-- Name: emails emails_updated_by_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emails
    ADD CONSTRAINT emails_updated_by_admin_id_fkey FOREIGN KEY (updated_by_admin_id) REFERENCES public.users(id);


--
-- Name: payments payments_registration_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_registration_batch_id_fkey FOREIGN KEY (registration_batch_id) REFERENCES public.registration_batches(id) ON DELETE CASCADE;


--
-- Name: registration_batches registration_batches_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_batches
    ADD CONSTRAINT registration_batches_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: registration_batches registration_batches_semester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_batches
    ADD CONSTRAINT registration_batches_semester_id_fkey FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE CASCADE;


--
-- Name: registration_days registration_days_registration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_days
    ADD CONSTRAINT registration_days_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES public.registrations(id) ON DELETE CASCADE;


--
-- Name: registrations registrations_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrations
    ADD CONSTRAINT registrations_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.registration_batches(id) ON DELETE SET NULL;


--
-- Name: registrations registrations_dancer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrations
    ADD CONSTRAINT registrations_dancer_id_fkey FOREIGN KEY (dancer_id) REFERENCES public.dancers(id) ON DELETE CASCADE;


--
-- Name: registrations registrations_registration_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrations
    ADD CONSTRAINT registrations_registration_batch_id_fkey FOREIGN KEY (registration_batch_id) REFERENCES public.registration_batches(id) ON DELETE SET NULL;


--
-- Name: registrations registrations_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrations
    ADD CONSTRAINT registrations_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.class_sessions(id);


--
-- Name: registrations registrations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrations
    ADD CONSTRAINT registrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: requirement_waivers requirement_waivers_class_requirement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requirement_waivers
    ADD CONSTRAINT requirement_waivers_class_requirement_id_fkey FOREIGN KEY (class_requirement_id) REFERENCES public.class_requirements(id) ON DELETE CASCADE;


--
-- Name: requirement_waivers requirement_waivers_dancer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requirement_waivers
    ADD CONSTRAINT requirement_waivers_dancer_id_fkey FOREIGN KEY (dancer_id) REFERENCES public.dancers(id) ON DELETE CASCADE;


--
-- Name: requirement_waivers requirement_waivers_granted_by_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requirement_waivers
    ADD CONSTRAINT requirement_waivers_granted_by_admin_id_fkey FOREIGN KEY (granted_by_admin_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: semester_audit_logs semester_audit_logs_semester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.semester_audit_logs
    ADD CONSTRAINT semester_audit_logs_semester_id_fkey FOREIGN KEY (semester_id) REFERENCES public.semesters(id);


--
-- Name: semester_discounts semester_discounts_discount_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.semester_discounts
    ADD CONSTRAINT semester_discounts_discount_id_fkey FOREIGN KEY (discount_id) REFERENCES public.discounts(id) ON DELETE CASCADE;


--
-- Name: semester_discounts semester_discounts_semester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.semester_discounts
    ADD CONSTRAINT semester_discounts_semester_id_fkey FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE CASCADE;


--
-- Name: semester_fee_config semester_fee_config_semester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.semester_fee_config
    ADD CONSTRAINT semester_fee_config_semester_id_fkey FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE CASCADE;


--
-- Name: semester_payment_installments semester_payment_installments_semester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.semester_payment_installments
    ADD CONSTRAINT semester_payment_installments_semester_id_fkey FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE CASCADE;


--
-- Name: semester_payment_plans semester_payment_plans_semester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.semester_payment_plans
    ADD CONSTRAINT semester_payment_plans_semester_id_fkey FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE CASCADE;


--
-- Name: session_group_sessions session_group_sessions_session_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_group_sessions
    ADD CONSTRAINT session_group_sessions_session_group_id_fkey FOREIGN KEY (session_group_id) REFERENCES public.session_groups(id) ON DELETE CASCADE;


--
-- Name: session_group_sessions session_group_sessions_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_group_sessions
    ADD CONSTRAINT session_group_sessions_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.class_sessions(id);


--
-- Name: session_group_tags session_group_tags_session_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_group_tags
    ADD CONSTRAINT session_group_tags_session_group_id_fkey FOREIGN KEY (session_group_id) REFERENCES public.session_groups(id) ON DELETE CASCADE;


--
-- Name: session_groups session_groups_semester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_groups
    ADD CONSTRAINT session_groups_semester_id_fkey FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE CASCADE;


--
-- Name: session_occurrence_dates session_occurrence_dates_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_occurrence_dates
    ADD CONSTRAINT session_occurrence_dates_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.class_sessions(id) ON DELETE CASCADE;


--
-- Name: tuition_rate_bands tuition_rate_bands_semester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tuition_rate_bands
    ADD CONSTRAINT tuition_rate_bands_semester_id_fkey FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE CASCADE;


--
-- Name: users users_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;


--
-- Name: waitlist_entries waitlist_entries_dancer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist_entries
    ADD CONSTRAINT waitlist_entries_dancer_id_fkey FOREIGN KEY (dancer_id) REFERENCES public.dancers(id) ON DELETE CASCADE;


--
-- Name: waitlist_entries waitlist_entries_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist_entries
    ADD CONSTRAINT waitlist_entries_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.class_sessions(id);


--
-- Name: authorized_pickups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.authorized_pickups ENABLE ROW LEVEL SECURITY;

--
-- Name: authorized_pickups authorized_pickups_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authorized_pickups_admin_all ON public.authorized_pickups TO authenticated USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());


--
-- Name: authorized_pickups authorized_pickups_parent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authorized_pickups_parent ON public.authorized_pickups TO authenticated USING ((family_id = ( SELECT users.family_id
   FROM public.users
  WHERE (users.id = auth.uid())))) WITH CHECK ((family_id = ( SELECT users.family_id
   FROM public.users
  WHERE (users.id = auth.uid()))));


--
-- Name: dancers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dancers ENABLE ROW LEVEL SECURITY;

--
-- Name: dancers dancers_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dancers_admin_all ON public.dancers TO authenticated USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());


--
-- Name: dancers dancers_parent_family; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dancers_parent_family ON public.dancers TO authenticated USING ((family_id = ( SELECT users.family_id
   FROM public.users
  WHERE (users.id = auth.uid())))) WITH CHECK ((family_id = ( SELECT users.family_id
   FROM public.users
  WHERE (users.id = auth.uid()))));


--
-- Name: dancers dancers_service_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dancers_service_role ON public.dancers TO service_role USING (true) WITH CHECK (true);


--
-- Name: discount_rule_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.discount_rule_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: discount_rule_sessions discount_rule_sessions_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY discount_rule_sessions_admin_all ON public.discount_rule_sessions TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: discount_rule_sessions discount_rule_sessions_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY discount_rule_sessions_public_read ON public.discount_rule_sessions FOR SELECT USING (true);


--
-- Name: discount_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.discount_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: discount_rules discount_rules_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY discount_rules_admin_all ON public.discount_rules TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: discount_rules discount_rules_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY discount_rules_public_read ON public.discount_rules FOR SELECT USING (true);


--
-- Name: discounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;

--
-- Name: discounts discounts_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY discounts_admin_all ON public.discounts TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: discounts discounts_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY discounts_public_read ON public.discounts FOR SELECT USING ((is_active = true));


--
-- Name: email_activity_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_activity_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: email_deliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: email_deliveries email_deliveries_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_deliveries_admin_select ON public.email_deliveries FOR SELECT TO authenticated USING (public.is_admin_or_super());


--
-- Name: email_deliveries email_deliveries_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_deliveries_admin_update ON public.email_deliveries FOR UPDATE TO authenticated USING (public.is_admin_or_super());


--
-- Name: email_deliveries email_deliveries_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_deliveries_admin_write ON public.email_deliveries FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_super());


--
-- Name: email_deliveries email_deliveries_service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_deliveries_service_role_all ON public.email_deliveries TO service_role USING (true) WITH CHECK (true);


--
-- Name: email_activity_logs email_logs_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_logs_admin_all ON public.email_activity_logs TO authenticated USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());


--
-- Name: email_recipient_selections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_recipient_selections ENABLE ROW LEVEL SECURITY;

--
-- Name: email_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: email_recipients email_recipients_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_recipients_admin_all ON public.email_recipients TO authenticated USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());


--
-- Name: email_recipient_selections email_selections_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_selections_admin_all ON public.email_recipient_selections TO authenticated USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());


--
-- Name: email_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: email_subscriptions email_subscriptions_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_subscriptions_admin_all ON public.email_subscriptions TO authenticated USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());


--
-- Name: email_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: email_templates email_templates_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_templates_admin_all ON public.email_templates TO authenticated USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());


--
-- Name: emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;

--
-- Name: emails emails_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY emails_admin_all ON public.emails TO authenticated USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());


--
-- Name: families; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;

--
-- Name: families families_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY families_admin_all ON public.families TO authenticated USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());


--
-- Name: families families_parent_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY families_parent_read ON public.families FOR SELECT TO authenticated USING ((id = ( SELECT users.family_id
   FROM public.users
  WHERE (users.id = auth.uid()))));


--
-- Name: families families_service_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY families_service_role ON public.families TO service_role USING (true) WITH CHECK (true);


--
-- Name: media_images; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_images ENABLE ROW LEVEL SECURITY;

--
-- Name: media_images media_images_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY media_images_admin_all ON public.media_images TO authenticated USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());


--
-- Name: registration_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.registration_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: registration_batches registration_batches_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY registration_batches_admin_all ON public.registration_batches TO authenticated USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());


--
-- Name: registration_batches registration_batches_parent_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY registration_batches_parent_insert ON public.registration_batches FOR INSERT TO authenticated WITH CHECK ((parent_id = auth.uid()));


--
-- Name: registration_batches registration_batches_parent_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY registration_batches_parent_read ON public.registration_batches FOR SELECT TO authenticated USING ((parent_id = auth.uid()));


--
-- Name: registration_batches registration_batches_service_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY registration_batches_service_role ON public.registration_batches TO service_role USING (true) WITH CHECK (true);


--
-- Name: registration_days; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.registration_days ENABLE ROW LEVEL SECURITY;

--
-- Name: registration_days registration_days_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY registration_days_admin_all ON public.registration_days TO authenticated USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());


--
-- Name: registration_days registration_days_parent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY registration_days_parent ON public.registration_days TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.registrations
  WHERE ((registrations.id = registration_days.registration_id) AND (registrations.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.registrations
  WHERE ((registrations.id = registration_days.registration_id) AND (registrations.user_id = auth.uid())))));


--
-- Name: registration_days registration_days_service_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY registration_days_service_role ON public.registration_days TO service_role USING (true) WITH CHECK (true);


--
-- Name: registrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

--
-- Name: registrations registrations_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY registrations_admin_all ON public.registrations TO authenticated USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());


--
-- Name: registrations registrations_parent_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY registrations_parent_insert ON public.registrations FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: registrations registrations_parent_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY registrations_parent_read ON public.registrations FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: registrations registrations_service_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY registrations_service_role ON public.registrations TO service_role USING (true) WITH CHECK (true);


--
-- Name: semester_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.semester_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: semester_audit_logs semester_audit_logs_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY semester_audit_logs_admin_all ON public.semester_audit_logs TO authenticated USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());


--
-- Name: semester_discounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.semester_discounts ENABLE ROW LEVEL SECURITY;

--
-- Name: semester_discounts semester_discounts_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY semester_discounts_admin_all ON public.semester_discounts TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: semester_discounts semester_discounts_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY semester_discounts_public_read ON public.semester_discounts FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.semesters
  WHERE ((semesters.id = semester_discounts.semester_id) AND (semesters.status = 'published'::text) AND (semesters.deleted_at IS NULL)))));


--
-- Name: semester_payment_installments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.semester_payment_installments ENABLE ROW LEVEL SECURITY;

--
-- Name: semester_payment_installments semester_payment_installments_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY semester_payment_installments_admin_all ON public.semester_payment_installments TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: semester_payment_installments semester_payment_installments_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY semester_payment_installments_public_read ON public.semester_payment_installments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.semesters
  WHERE ((semesters.id = semester_payment_installments.semester_id) AND (semesters.status = 'published'::text) AND (semesters.deleted_at IS NULL)))));


--
-- Name: semester_payment_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.semester_payment_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: semester_payment_plans semester_payment_plans_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY semester_payment_plans_admin_all ON public.semester_payment_plans TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: semester_payment_plans semester_payment_plans_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY semester_payment_plans_public_read ON public.semester_payment_plans FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.semesters
  WHERE ((semesters.id = semester_payment_plans.semester_id) AND (semesters.status = 'published'::text) AND (semesters.deleted_at IS NULL)))));


--
-- Name: semesters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;

--
-- Name: semesters semesters_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY semesters_admin_all ON public.semesters TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: semesters semesters_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY semesters_public_read ON public.semesters FOR SELECT USING (((status = 'published'::text) AND (deleted_at IS NULL)));


--
-- Name: session_group_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.session_group_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: session_group_sessions session_group_sessions_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_group_sessions_admin_all ON public.session_group_sessions TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: session_group_sessions session_group_sessions_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_group_sessions_public_read ON public.session_group_sessions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.session_groups sg
     JOIN public.semesters s ON ((s.id = sg.semester_id)))
  WHERE ((sg.id = session_group_sessions.session_group_id) AND (s.status = 'published'::text) AND (s.deleted_at IS NULL)))));


--
-- Name: session_group_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.session_group_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: session_group_tags session_group_tags_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_group_tags_admin_all ON public.session_group_tags TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: session_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.session_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: session_groups session_groups_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_groups_admin_all ON public.session_groups TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: session_groups session_groups_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_groups_public_read ON public.session_groups FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.semesters
  WHERE ((semesters.id = session_groups.semester_id) AND (semesters.status = 'published'::text) AND (semesters.deleted_at IS NULL)))));


--
-- Name: session_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.session_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: session_tags session_tags_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY session_tags_admin_all ON public.session_tags TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_admin_all ON public.users TO authenticated USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());


--
-- Name: users users_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_self_read ON public.users FOR SELECT TO authenticated USING ((id = auth.uid()));


--
-- Name: users users_self_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_self_update ON public.users FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


--
-- Name: users users_service_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_service_role ON public.users TO service_role USING (true) WITH CHECK (true);


--
-- Name: waitlist_entries waitlist_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY waitlist_admin_all ON public.waitlist_entries TO authenticated USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());


--
-- Name: waitlist_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: waitlist_entries waitlist_parent_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY waitlist_parent_read ON public.waitlist_entries FOR SELECT TO authenticated USING ((dancer_id IN ( SELECT dancers.id
   FROM public.dancers
  WHERE (dancers.family_id = ( SELECT users.family_id
           FROM public.users
          WHERE (users.id = auth.uid()))))));


--
-- Name: waitlist_entries waitlist_service_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY waitlist_service_role ON public.waitlist_entries TO service_role USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict O1dcw6cgMRlrfKZX5DzCYLrgwQXyNIDt3v0xkuluumfYCoQFnEMZUnJdlbwOssP

