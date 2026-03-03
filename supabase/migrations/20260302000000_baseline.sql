--
-- PostgreSQL database dump
--



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



