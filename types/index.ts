/* -------------------------------------------------------------------------- */
/* User Domain                                                                */
/* -------------------------------------------------------------------------- */

export type SignatureConfig = {
  name: string;
  title: string;
  phone: string;
  website: string;
};

export interface User {
  id: string;
  family_id: string;
  email: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  phone_number: string;
  is_primary_parent: boolean;
  role: string;
  status: string;
  created_at: string;
  display_name?: string | null;
  signature_html?: string | null;
  signature_config?: SignatureConfig | null;
  reply_to_email?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zipcode?: string | null;
  sms_opt_in?: boolean;
  sms_verified?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Dancer Domain                                                                */
/* -------------------------------------------------------------------------- */

export interface Dancer {
  id: string;

  first_name: string;
  middle_name?: string | null;
  last_name: string;
  gender: string | null;
  birth_date: string | null;
  grade: string | null;
  email: string | null;
  phone_number: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
  is_self: boolean;
  created_at: string;
  users: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  }[];
  registrations?: {
    id: string;
    status: string;
    total_amount: number;
    created_at: string;
    sessions: {
      id: string;
      title: string;
      description: string | null;
      type: string | null;
      location: string | null;
      // price: number | null;
      start_date: string | null;
      end_date: string | null;
    };
  }[];
}

/* -------------------------------------------------------------------------- */
/* Family Domain                                                                */
/* -------------------------------------------------------------------------- */

export interface Family {
  id: string;
  family_name: string | null;
  created_at: string;
  users: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string | null;
    is_primary_parent: boolean;
  }[];
  dancers: {
    id: string;
    first_name: string;
    last_name: string;
    is_self: boolean;
    registrations: {
      id: string;
      status: string;
      class_sessions: {
        id: string;
        day_of_week: string;
        start_time: string | null;
        end_time: string | null;
        classes: { name: string } | null;
      } | null;
    }[];
  }[];
}

/* -------------------------------------------------------------------------- */
/* Class + ClassSession Domain  (Phase 1 — replaces Session)                  */
/* -------------------------------------------------------------------------- */

/** Discipline values — authoritative list */
export type Discipline =
  | "ballet"
  | "tap"
  | "broadway"
  | "hip_hop"
  | "contemporary"
  | "technique"
  | "pointe"
  | "jazz"
  | "lyrical"
  | "acro";

/** Division values — authoritative list */
export type Division = "early_childhood" | "junior" | "senior" | "competition";

/** Day of week values — lowercase, matching DB constraint */
export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

/** Controls whether a class appears in the public catalog. */
export type ClassVisibility = "public" | "hidden" | "invite_only";

/** Controls the booking flow for a class. */
export type ClassEnrollmentType = "standard" | "audition";

/**
 * Top-level offering archetype. TypeScript-only discriminator — never persisted.
 * Derived from `is_competition_track` during hydration in mapSemesterToDraft.
 *
 * - "standard"           → isCompetitionTrack=false, visibility configurable (public/hidden)
 * - "competition_track"  → isCompetitionTrack=true, visibility=invite_only, enrollmentType=audition (all fixed)
 */
export type ClassOfferingType = "standard" | "competition_track";

/**
 * Inline email config for per-class competition transactional emails.
 * Structurally identical to the SemesterDraft confirmationEmail shape.
 * Stored as JSONB in classes.invite_email / audition_booking_email / competition_acceptance_email.
 */
export type ClassEmailConfig = {
  subject: string;
  fromName: string;
  fromEmail: string;
  htmlBody: string;
};

/**
 * DB row type for a class (curriculum entity).
 * Replaces the old `Session` interface.
 */
export interface DanceClass {
  id: string;
  semester_id: string;
  name: string;
  discipline: string;
  division: string;
  description: string | null;
  min_age: number | null;
  max_age: number | null;
  min_grade: number | null;
  max_grade: number | null;
  is_active: boolean;
  is_competition_track: boolean;
  requires_teacher_rec: boolean;
  /** "public" | "hidden" | "invite_only" — defaults to "public" */
  visibility: ClassVisibility;
  /** "standard" | "audition" — defaults to "standard" */
  enrollment_type: ClassEnrollmentType;
  created_at: string;
  updated_at: string;
  /** Nested class_sessions — included when queried with select */
  class_sessions?: ClassSession[];
}

/**
 * DB row type for a class session (time-slot offering within a class).
 * One row = one specific day/time slot.  Replacing session_available_days.
 */
export interface ClassSession {
  id: string;
  class_id: string;
  semester_id: string;
  day_of_week: string;
  start_time: string | null;    // "HH:MM:SS"
  end_time: string | null;      // "HH:MM:SS"
  start_date: string | null;    // "YYYY-MM-DD"
  end_date: string | null;      // "YYYY-MM-DD"
  location: string | null;
  instructor_name: string | null;
  capacity: number | null;
  registration_close_at: string | null;
  is_active: boolean;
  created_at: string;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  /** Nested occurrence dates — included when queried with select */
  session_occurrence_dates?: SessionOccurrenceDate[];
}

/** Individual calendar date for a class_session (for day picker / attendance). */
export interface SessionOccurrenceDate {
  id: string;
  session_id: string;
  date: string;           // "YYYY-MM-DD"
  is_cancelled: boolean;
  cancellation_reason: string | null;
  created_at: string;
}

/** Tuition rate band — one row per (semester, division, weekly_class_count). */
export interface TuitionRateBand {
  id: string;
  semester_id: string;
  division: string;
  weekly_class_count: number;
  base_tuition: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Per-semester admin-configurable fee constants. */
export interface SemesterFeeConfig {
  semester_id: string;
  registration_fee_per_child: number;
  family_discount_amount: number;
  auto_pay_admin_fee_monthly: number;
  auto_pay_installment_count: number;
  /** Flat video fee charged once per senior registrant ($15 default). */
  senior_video_fee_per_registrant: number;
  /** Per-class costume fee for senior division ($65/class default). */
  senior_costume_fee_per_class: number;
  created_at: string;
  updated_at: string;
}

/* -------------------------------------------------------------------------- */
/* Pricing Engine Types (Phase 2)                                              */
/* -------------------------------------------------------------------------- */

/** A tuition rate band as held in the SemesterDraft editor state. */
export type DraftTuitionRateBand = {
  /** Temporary client-only key for React lists (before DB save). */
  _clientKey: string;
  /** DB id if the row already exists; undefined for new rows. */
  id?: string;
  division: "early_childhood" | "junior" | "senior" | "competition";
  weekly_class_count: number;
  base_tuition: number;
  /** Discount % applied to the base tuition for this nth class (0 = no discount). */
  progressive_discount_percent: number;
  /** Pre-calculated semester total (base + discounts + fees). Admin-editable reference. */
  semester_total?: number;
  /** Per-installment amount for auto-pay (semester_total / installment_count). */
  autopay_installment_amount?: number;
  notes?: string;
};

/**
 * A fixed-tuition special program entry held in SemesterDraft.
 * These programs bypass the division-based progressive discount calculation.
 * Includes: Technique, Pre-Pointe, Pointe, Competition Team, Early Childhood.
 */
export type DraftSpecialProgramTuition = {
  /** Temporary client-only key for React lists (before DB save). */
  _clientKey: string;
  /** DB id if the row already exists; undefined for new rows. */
  id?: string;
  /**
   * Stable engine key used to match classes to overrides:
   * 'technique' | 'pre_pointe' | 'pointe' |
   * 'competition_junior' | 'competition_senior' | 'early_childhood'
   */
  programKey: string;
  /** Human-readable label shown in the admin UI. */
  programLabel: string;
  /** Fixed semester total — no progressive discounts applied. */
  semesterTotal: number;
  /** Per-installment amount for auto-pay (null when N/A, e.g. Early Childhood). */
  autoPayInstallmentAmount: number | null;
  /** Number of auto-pay installments (null when N/A). */
  autoPayInstallmentCount: number | null;
  /**
   * Override for the semester-level registration fee.
   * null  → use global registration_fee_per_child
   * 0     → exempt (no registration fee)
   * Other → use this exact amount
   * Technique, Pre-Pointe, Pointe, and Competition programs default to 0.
   */
  registrationFeeOverride?: number | null;
  notes?: string;
};

/** Per-semester fee constants as held in the SemesterDraft editor state. */
export type DraftFeeConfig = {
  registration_fee_per_child: number;          // default 40.00
  family_discount_amount: number;              // default 50.00
  auto_pay_admin_fee_monthly: number;          // default 5.00
  auto_pay_installment_count: number;          // default 5
  senior_video_fee_per_registrant: number;     // default 15.00
  senior_costume_fee_per_class: number;        // default 65.00
  junior_costume_fee_per_class: number;        // default 55.00
};

/** A coupon/promo code as held in the SemesterDraft editor state. */
export type DraftCoupon = {
  _clientKey: string;
  id?: string;
  name: string;
  /** Alphanumeric code the parent enters at checkout. null = auto-apply by date range. */
  code: string | null;
  value: number;
  valueType: "flat" | "percent";
  /** ISO date-time string or null (no start restriction). */
  validFrom: string | null;
  /** ISO date-time string or null (no expiry). */
  validUntil: string | null;
  /** null = unlimited uses. */
  maxTotalUses: number | null;
  usesCount: number;
  maxPerFamily: number;
  /** If false, coupon will not apply when threshold-based discounts are already applied. */
  stackable: boolean;
  eligibleSessionsMode: "all" | "selected";
  /** Only populated when eligibleSessionsMode = 'selected'. */
  sessionIds?: string[];
  isActive: boolean;
};

/**
 * Result of validating a coupon code or auto-apply coupon at checkout.
 * `valid: true` means it is safe to apply and the coupon details are included.
 */
export type CouponValidationResult =
  | { valid: true; coupon: DraftCoupon }
  | {
      valid: false;
      reason:
        | "not_found"      // code does not exist or is not linked to this semester
        | "inactive"       // coupon is disabled by admin
        | "expired"        // current date is past valid_until
        | "not_yet_valid"  // current date is before valid_from
        | "cap_reached"    // max_total_uses exhausted
        | "already_used"   // this family has already redeemed this coupon
        | "not_applicable"; // eligible_sessions_mode=selected but no enrolled session matches
    };

export interface PricingInput {
  semesterId: string;
  /**
   * Family ID for the discount-already-applied check.
   * If omitted, the server action resolves it from the auth session.
   */
  familyId?: string;
  enrollments: Array<{
    dancerId: string;
    /** Display name override — used for new dancers not yet in DB. */
    dancerName?: string;
    sessionIds: string[];
  }>;
  paymentPlanType: "pay_in_full" | "deposit_50pct" | "auto_pay_monthly";
  /** Optional promo code entered by the parent at checkout. */
  couponCode?: string;
}

export interface LineItem {
  type:
    | "tuition"
    | "recital_fee"
    | "registration_fee"
    | "family_discount"
    | "auto_pay_admin_fee"
    | "video_fee"       // senior division: flat fee per registrant
    | "costume_fee"     // senior division: per-class costume fee
    | "session_discount" // custom/multi-session discount rules
    | "coupon_discount"; // promo code or auto-apply coupon
  label: string;
  amount: number; // positive = charge, negative = credit
  description?: string;
}

export interface InstallmentPreview {
  installmentNumber: number;
  amountDue: number;
  dueDate: string; // 'YYYY-MM-DD'
}

export interface DancerPricingBreakdown {
  dancerId: string;
  dancerName: string;
  division: string;
  weeklyClassCount: number;
  tuition: number;        // includes recital fee, senior video/costume fees, minus session discounts
  recitalFee: number;     // display only — already included in tuition
  videoFee: number;       // senior division only; display only — already included in tuition
  costumeFee: number;     // senior division only; display only — already included in tuition
  sessionDiscountTotal: number; // total of all applied session-level discounts (negative or 0)
  registrationFee: number;
  lineItems: LineItem[];
}

export interface PricingQuote {
  perDancer: DancerPricingBreakdown[];
  tuitionSubtotal: number;
  registrationFeeTotal: number;
  recitalFeeTotal: number;
  familyDiscountAmount: number;
  autoPayAdminFeeTotal: number;
  couponDiscount: number;       // 0 if no coupon applied; positive = amount saved
  appliedCouponId?: string;
  appliedCouponName?: string;
  grandTotal: number;
  amountDueNow: number;
  lineItems: LineItem[];
  paymentSchedule: InstallmentPreview[];
}

/** Error returned when server-computed price differs from client-visible quote. */
export interface PriceChangedError {
  code: "PRICE_CHANGED";
  newQuote: PricingQuote;
}

/* -------------------------------------------------------------------------- */
/* Validation Engine Types (Phase 3)                                          */
/* -------------------------------------------------------------------------- */

/** Schedule metadata fetched for a class_session (used for conflict detection). */
export interface SessionScheduleInfo {
  sessionId: string;
  className: string;
  dayOfWeek: string;
  startTime: string | null;    // 'HH:MM:SS'
  endTime: string | null;      // 'HH:MM:SS'
  scheduleDate?: string | null; // 'YYYY-MM-DD'; null/undefined on legacy sessions
  minAge?: number | null;
  maxAge?: number | null;
  minGrade?: number | null;
  maxGrade?: number | null;
}

export interface ConflictDetail {
  sessionA: SessionScheduleInfo;
  sessionB: SessionScheduleInfo;
}

export interface ConflictResult {
  hasConflict: boolean;
  conflicts: ConflictDetail[];
}

export type ValidationIssueType =
  | "time_conflict"
  | "prerequisite_completed"
  | "concurrent_enrollment"
  | "teacher_recommendation"
  | "skill_qualification"
  | "audition_required"
  | "age_range"
  | "parent_accompaniment"
  | "concurrent_enrollment_group";

export interface EnrollmentValidationIssue {
  type: ValidationIssueType;
  enforcement: "soft_warn" | "hard_block";
  message: string;
  dancerId: string;
  sessionId?: string;
  requirementId?: string;
  isWaivable: boolean;
}

export interface EnrollmentValidationResult {
  valid: boolean;
  hasHardBlock: boolean;
  issues: EnrollmentValidationIssue[];
}

/** Prerequisite / concurrent enrollment rule for a class. */
export interface ClassRequirement {
  id: string;
  class_id: string;
  requirement_type: string;
  required_discipline: string | null;
  required_level: string | null;
  required_class_id: string | null;
  description: string;
  enforcement: "soft_warn" | "hard_block";
  is_waivable: boolean;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Draft types for the semester editor (admin UI state)                        */
/* -------------------------------------------------------------------------- */

/**
 * A named price tier for a class_session.
 * If any rows exist for a session, the default row drives checkout.
 * Sessions with no rows fall back to tuition_rate_bands.
 * @deprecated For new schedules use DraftSchedulePriceTier (full_schedule mode)
 * or dropInPrice (per_session mode) on DraftClassSchedule instead.
 */
export type DraftSessionPriceRow = {
  /** Stable React list key — use crypto.randomUUID() or Date.now().toString() */
  _clientKey: string;
  /** DB id if already persisted */
  id?: string;
  label: string;        // e.g. "Regular", "Early Bird", "Scholarship"
  amount: number;       // non-negative dollar amount
  sortOrder: number;
  isDefault: boolean;   // exactly one row per session should be true
};

/**
 * A named price tier for a schedule block (Mode A — full_schedule pricing).
 * Maps 1:1 to schedule_price_tiers rows in the DB.
 * One tier is selected by the user at checkout; the amount covers the
 * entire schedule (all generated sessions).
 */
export type DraftSchedulePriceTier = {
  /** Stable React list key */
  _clientKey: string;
  /** DB id once persisted */
  id?: string;
  label: string;        // e.g. "Regular", "Early Bird", "Scholarship"
  amount: number;       // non-negative dollar amount; covers the full schedule
  sortOrder: number;
  isDefault: boolean;   // exactly one tier per schedule should be true
};

/**
 * A purchasable add-on attached to a class_session.
 */
export type DraftSessionOption = {
  _clientKey: string;
  id?: string;
  name: string;
  description?: string;
  price: number;
  isRequired: boolean;
  sortOrder: number;
};

/**
 * A calendar date on which a recurring session does NOT meet.
 */
export type DraftSessionExcludedDate = {
  id?: string;
  date: string;    // 'YYYY-MM-DD'
  reason?: string;
};

/**
 * Admin-level schedule configuration block for a class.
 * Maps 1:1 to class_schedules rows in the DB.
 * The system auto-generates one class_session per valid calendar date from this config.
 *
 * Pricing modes:
 *   full_schedule — user buys access to the entire schedule; price from priceTiers.
 *   per_session   — user picks individual sessions; each session priced at dropInPrice.
 */
export type DraftClassSchedule = {
  /** Stable React list key */
  _clientKey: string;
  /** DB id once persisted; undefined for new schedules */
  id?: string;
  /** Selected days of week — e.g. ['monday', 'wednesday'] */
  daysOfWeek: string[];
  startTime?: string;     // 'HH:mm'
  endTime?: string;       // 'HH:mm'
  startDate?: string;     // 'YYYY-MM-DD'
  endDate?: string;       // 'YYYY-MM-DD'
  location?: string;
  instructorName?: string;
  capacity?: number | null;
  registrationOpenAt?: string | null;
  registrationCloseAt?: string | null;
  genderRestriction?: 'male' | 'female' | 'no_restriction' | null;
  urgencyThreshold?: number | null;
  /** Dates on which sessions should NOT be generated (holidays, closures) */
  excludedDates?: DraftSessionExcludedDate[];

  // ── Pricing model ──────────────────────────────────────────────────────────
  /** Determines enrollment and pricing semantics. Defaults to 'full_schedule'. */
  pricingModel?: 'full_schedule' | 'per_session';
  /**
   * Mode A (full_schedule): named price tiers stored in schedule_price_tiers.
   * User selects one tier at checkout; amount covers all generated sessions.
   */
  priceTiers?: DraftSchedulePriceTier[];
  /**
   * Mode B (per_session): flat drop-in price propagated to each generated
   * class_session. Stored in class_sessions.drop_in_price.
   */
  dropInPrice?: number | null;

  // ── Legacy — do not use for new schedules ──────────────────────────────────
  /** @deprecated Use priceTiers (full_schedule) or dropInPrice (per_session) */
  priceRows?: DraftSessionPriceRow[];
  /** Purchasable add-ons displayed at checkout for every day in this schedule */
  options?: DraftSessionOption[];
};

/**
 * A single generated time-slot within a class, as held in the SemesterDraft state.
 * Maps 1:1 to class_sessions rows in the DB.
 * In the per-day enrollment model, class_sessions are generated from DraftClassSchedule
 * and should not be edited directly in the admin UI.
 */
export type DraftClassSession = {
  /** DB id if the row already exists; undefined for new (unsaved) sessions */
  id?: string;
  dayOfWeek: string;      // lowercase: 'monday', 'tuesday', …
  startTime?: string;     // 'HH:mm'
  endTime?: string;       // 'HH:mm'
  startDate?: string;     // 'YYYY-MM-DD'
  endDate?: string;       // 'YYYY-MM-DD'
  location?: string;
  instructorName?: string;
  capacity?: number | null;
  registrationCloseAt?: string | null;
  /** When registration opens for this session (null = always open) */
  registrationOpenAt?: string | null;
  /** Optional gender restriction */
  genderRestriction?: 'male' | 'female' | 'no_restriction' | null;
  /** Urgency threshold: show "Only X spots left!" when spots remaining ≤ this value */
  urgencyThreshold?: number | null;
  /** Named price tiers. If populated, overrides tuition_rate_bands for this session. */
  priceRows?: DraftSessionPriceRow[];
  /** Purchasable add-ons shown during checkout for this session */
  options?: DraftSessionOption[];
  /** Calendar dates when this session does NOT meet */
  excludedDates?: DraftSessionExcludedDate[];
};

/**
 * An enrollment rule for a class, as held in the SemesterDraft state.
 * Maps 1:1 to class_requirements rows in the DB.
 */
export type DraftClassRequirement = {
  /** DB id if the row already exists; undefined for new (unsaved) requirements */
  id?: string;
  requirement_type:
    | "prerequisite_completed"
    | "concurrent_enrollment"
    | "teacher_recommendation"
    | "skill_qualification"
    | "audition_required"
    | "parent_accompaniment";
  /** Human-readable explanation shown to the user when the rule fires */
  description: string;
  enforcement: "soft_warn" | "hard_block";
  is_waivable: boolean;
  /** Optionally constrain to a specific discipline (e.g. 'ballet') */
  required_discipline?: string | null;
  /** Optionally constrain to a specific level (e.g. '2') */
  required_level?: string | null;
  /** Optionally constrain to a specific class DB id */
  required_class_id?: string | null;
};

/**
 * One acceptable class option within a DraftConcurrentEnrollmentGroup.
 * Maps to concurrent_enrollment_options rows. Options within a group are OR'd.
 */
export type DraftConcurrentEnrollmentOption = {
  /** Stable client-side key for React list rendering (not persisted) */
  _clientKey: string;
  /** DB id if the row already exists */
  id?: string;
  /** Exact class match (UUID). If set with discipline, both must match. */
  classId?: string | null;
  /** Discipline-level match (e.g. 'ballet'). Any class in this discipline satisfies the option. */
  discipline?: string | null;
  /** Optional level filter within the discipline (e.g. 'Open 5'). */
  level?: string | null;
};

/**
 * An OR-logic group of concurrent enrollment options on a class.
 * Maps to concurrent_enrollment_groups rows.
 * A dancer satisfies the group if they enroll in ANY one of its options.
 * Multiple groups on the same class are AND'd (each must be independently satisfied).
 */
export type DraftConcurrentEnrollmentGroup = {
  /** Stable client-side key for React list rendering (not persisted) */
  _clientKey: string;
  /** DB id if the row already exists */
  id?: string;
  /** Internal label for this group (e.g. "third_weekly_class", "non_ballet_class") */
  groupLabel: string;
  enforcement: "hard_block" | "soft_warn";
  isWaivable: boolean;
  /** Human-readable message shown to the user when no option is satisfied */
  description: string;
  options: DraftConcurrentEnrollmentOption[];
};

/**
 * A class (curriculum entity) as held in the SemesterDraft state.
 * Maps 1:1 to classes rows in the DB, with nested DraftClassSchedule[].
 */
export type DraftClass = {
  /** DB id if the row already exists; undefined for new (unsaved) classes */
  id?: string;
  /**
   * Top-level offering archetype — TypeScript-only discriminator, never persisted.
   * Derived from is_competition_track on hydration. Use this in UI logic instead of
   * reading isCompetitionTrack directly; keeps identity centralized.
   *
   * Invariants enforced by handleUpdateClass (UI) and syncSemesterSessions (server):
   *   competition_track → isCompetitionTrack=true, visibility=invite_only, enrollmentType=audition, schedules=[]
   *   standard         → isCompetitionTrack=false, visibility configurable (public/hidden only)
   */
  offeringType?: ClassOfferingType;
  name: string;
  /** Optional public-facing display name; falls back to `name` if not set */
  displayName?: string;
  discipline: string;
  division: string;
  description?: string;
  minAge?: number | null;
  maxAge?: number | null;
  /** Age range in whole months — used for early childhood classes (e.g. 18–26 months).
   *  When non-null, takes precedence over minAge/maxAge in validation. */
  minAgeMonths?: number | null;
  maxAgeMonths?: number | null;
  /** Optional grade range for enrollment eligibility (K=0, Pre-K4=-1, Pre-K3=-2) */
  minGrade?: number | null;
  maxGrade?: number | null;
  isCompetitionTrack?: boolean;
  requiresTeacherRec?: boolean;
  /** If true, a parent or caregiver must accompany the dancer in class.
   *  Set alongside a parent_accompaniment class_requirement row. */
  requiresParentAccompaniment?: boolean;
  /** Informational text shown to families during enrollment. Not enforced.
   *  Use for mandatory rehearsal notices, multi-year program notes, etc. */
  registrationNote?: string | null;
  /** "public" | "hidden" | "invite_only" — controls catalog visibility */
  visibility?: ClassVisibility;
  /** "standard" | "audition" — controls booking flow */
  enrollmentType?: ClassEnrollmentType;
  /** Schedule blocks — each generates per-day class_sessions automatically.
   *  INVARIANT: always [] for competition_track classes. */
  schedules: DraftClassSchedule[];
  /** Phase 6: enrollment rules (prerequisite, concurrent, audition, etc.) */
  requirements?: DraftClassRequirement[];
  /** OR-logic concurrent enrollment groups (e.g. "must also enroll in Ballet OR Tap").
   *  Each group must be independently satisfied (groups are AND'd; options within a group are OR'd). */
  concurrentEnrollmentGroups?: DraftConcurrentEnrollmentGroup[];
  // ---- Competition track transactional emails (nullable for standard classes) ----
  /** Sent when admin sends an invite to a dancer. */
  inviteEmail?: ClassEmailConfig;
  /** Sent when a dancer books an audition slot. */
  auditionBookingEmail?: ClassEmailConfig;
  /** Sent when admin accepts a dancer into the competition track. */
  competitionAcceptanceEmail?: ClassEmailConfig;
};

/** @deprecated Use DraftClass / DraftClassSession instead. */
export interface Session {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  type?: string | null;
  location?: string | null;
  price: number | null;
  registration_fee?: number | null;
  discount?: string[] | null;
  start_date: string | null;
  end_date: string | null;
  days_of_week: string[] | null;
  start_time: string | null;
  end_time: string | null;
  capacity?: number | null;
  is_active: boolean;
  created_at: string;
}

export interface ProgramAvailableDay {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  capacity: number | null;
}

export interface Registration {
  id: string;
  dancer_id: string;
  user_id: string;
  program_id: string;
  status: string | "pending";
  total_amount: number;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Registration Form Domain                                                   */
/* -------------------------------------------------------------------------- */

export type RegistrationElementType = "question" | "subheader" | "text_block";

export type QuestionInputType =
  | "short_answer"
  | "long_answer"
  | "select"
  | "checkbox"
  | "date"
  | "phone_number";

export type TextBlockFormatting = {
  style: "normal" | "header";
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: "gray" | "black" | "indigo";
  listType?: "bullet" | "numbered" | null;
  link?: string;
};

export type RegistrationFormElement = {
  id: string;
  type: RegistrationElementType;

  // Shared / Question fields
  label?: string;
  reportLabel?: string;
  inputType?: QuestionInputType;
  required?: boolean;
  instructionalText?: string;
  options?: string[]; // for select/checkbox
  sessionIds?: string[]; // applicability

  // Subheader fields
  subtitle?: string;

  // Text block fields
  textFormatting?: TextBlockFormatting;
  htmlContent?: string; // TipTap HTML output (preferred for new elements)
};

/* -------------------------------------------------------------------------- */
/* Semester Domain                                                                */
/* -------------------------------------------------------------------------- */

export type SemesterStatus = "draft" | "scheduled" | "published" | "archived";

export type WaitlistConfig = {
  enabled: boolean;
  sessionSettings: Record<string, { enabled: boolean }>; // keyed by sessionId
  inviteExpiryHours: number;
  stopDaysBeforeClose: number;
  invitationEmail: {
    subject: string;
    fromName: string;
    fromEmail: string;
    htmlBody: string;
  };
};

export type SemesterDraft = {
  id?: string;

  details?: {
    name: string;
    trackingMode: boolean;
    capacityWarningThreshold?: number;
    publishAt?: Date;
  };

  sessions?: {
    /** Phase 1+: list of classes (curriculum entities) with nested time-slots */
    classes: DraftClass[];
  };

  sessionGroups?: {
    groups: {
      id: string;
      name: string;
      sessionIds: string[];
    }[];
  };

  paymentPlan?: {
    type: "pay_in_full" | "deposit_flat" | "deposit_percent" | "installments";
    depositAmount?: number;
    depositPercent?: number;
    installmentCount?: number;
    dueDate: string;
    installments?: { number: number; amount: number; dueDate: string }[];
  };

  registrationForm?: {
    elements: RegistrationFormElement[];
  };

  confirmationEmail?: {
    subject: string;
    fromName: string;
    fromEmail: string;
    htmlBody: string;
  };

  waitlist?: WaitlistConfig;

  discounts?: {
    // semesterDiscountIds: string[];
    // sessionDiscounts: Record<string, string[]>;
    appliedDiscounts: AppliedSemesterDiscount[];
  };

  /** Phase 2: tuition rate bands (division × weekly count → price). */
  tuitionRateBands?: DraftTuitionRateBand[];

  /** Phase 2: per-semester fee constants (registration fee, family discount, auto-pay). */
  feeConfig?: DraftFeeConfig;

  /** Tuition engine: fixed-fee programs that bypass progressive discount calculations. */
  specialProgramTuition?: DraftSpecialProgramTuition[];

  /** Coupon/promo codes linked to this semester. */
  coupons?: DraftCoupon[];
};

export type SemesterAction =
  | { type: "SET_ID"; payload: SemesterDraft["id"] }
  | { type: "SET_DETAILS"; payload: SemesterDraft["details"] }
  | { type: "SET_SESSIONS"; payload: SemesterDraft["sessions"] }   // payload.classes: DraftClass[]
  | { type: "SET_SESSION_GROUPS"; payload: SemesterDraft["sessionGroups"] }
  | { type: "SET_PAYMENT"; payload: SemesterDraft["paymentPlan"] }
  | { type: "SET_DISCOUNTS"; payload: SemesterDraft["discounts"] }
  | {
      type: "SET_REGISTRATION_FORM";
      payload: SemesterDraft["registrationForm"];
    }
  | {
      type: "SET_CONFIRMATION_EMAIL";
      payload: SemesterDraft["confirmationEmail"];
    }
  | { type: "SET_WAITLIST"; payload: SemesterDraft["waitlist"] }
  | { type: "SET_TUITION_RATE_BANDS"; payload: DraftTuitionRateBand[] }
  | { type: "SET_FEE_CONFIG"; payload: DraftFeeConfig }
  | { type: "SET_SPECIAL_PROGRAM_TUITION"; payload: DraftSpecialProgramTuition[] }
  | { type: "SET_COUPONS"; payload: DraftCoupon[] }
  | { type: "ADD_FORM_ELEMENT"; payload: RegistrationFormElement }
  | { type: "UPDATE_FORM_ELEMENT"; payload: RegistrationFormElement }
  | { type: "REMOVE_FORM_ELEMENT"; payload: string }
  | { type: "REORDER_FORM_ELEMENTS"; payload: RegistrationFormElement[] }
  | { type: "RESET" };

export type SemesterSession = {
  sessionId: string;

  title: string;
  type: string | null;
  capacity: number | null;

  startDate: string | null;
  endDate: string | null;
  daysOfWeek: string[];

  registrationCloseAt?: string | null; // ISO datetime (TIMESTAMPTZ)

  overriddenTitle?: string | null;
  overriddenCategory?: string | null;
  overriddenType?: string | null;
  overriddenCapacity?: number | null;
  overriddenStartDate?: string | null;
  overriddenEndDate?: string | null;
  overriddenDaysOfWeek?: string[] | null;
};

export type SemesterDiscount = {
  id: string;
  discountId: string;

  // snapshot fields
  name: string;
  category: DiscountCategory;
  eligibleSessionsMode: "all" | "selected";
  eligibleSessionIds?: string[];

  rules: DiscountRules[];
  created_at: string;

  // lifecycle controls
  enabled: boolean;
};

/* -------------------------------------------------------------------------- */
/* Discount Domain                                                                */
/* -------------------------------------------------------------------------- */

export type Discount = {
  id: string;
  name: string;
  category: DiscountCategory;
  rules: DiscountRules[];
  enabled: boolean;
  created_at: string;
  eligible_sessions_mode: "all" | "selected";
};

export type AppliedSemesterDiscount = {
  discountId: string;
  // scope: "all_sessions" | "selected_sessions";
  // sessionIds?: string[];
};

export type DiscountCategory = "multi_person" | "multi_session" | "custom";

export type DiscountRules = {
  threshold: number;
  value: number;
  valueType: "flat" | "percent";

  // rule-specific targeting
  sessionScope:
    | "one_session"
    | "all_sessions"
    | "all_sessions_once_threshold"
    | "threshold_session_only"
    | "threshold_and_additional_sessions";

  recipientScope?: "threshold_only" | "threshold_and_additional";
};

export type HydratedDiscount = {
  id: string;
  name: string;
  category: DiscountCategory;
  eligible_sessions_mode: "all" | "selected";
  give_session_scope: string;
  recipient_scope: "threshold_only" | "threshold_and_additional" | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;

  discount_rules: {
    id: string;
    threshold: number;
    threshold_unit: "person" | "session";
    value: number;
    value_type: "flat" | "percent";
  }[];

  discount_rule_sessions: {
    session_id: string;
  }[];
};

/* -------------------------------------------------------------------------- */
/* Details Domain                                                                */
/* -------------------------------------------------------------------------- */

export type DetailsStepProps = {
  state: SemesterDraft;
  dispatch: React.Dispatch<SemesterAction>;
  onNext: () => void;
};

export type DetailsFormState = {
  name: string;
  trackingMode: boolean;
  publishAt?: string;
};

/* -------------------------------------------------------------------------- */
/* Sessions Domain                                                                */
/* -------------------------------------------------------------------------- */

export type SessionsStepProps = {
  state: SemesterDraft;
  dispatch: React.Dispatch<SemesterAction>;
  onNext: () => void;
  onBack: () => void;
  isLocked?: boolean;
};

export type PaymentStepProps = {
  state: SemesterDraft;
  dispatch: React.Dispatch<SemesterAction>;
  onNext: () => void;
  onBack: () => void;
  isLocked?: boolean;
};

export type DiscountsStepProps = {
  state: SemesterDraft;
  dispatch: React.Dispatch<SemesterAction>;
  onNext: () => void;
  onBack: () => void;
  isLocked?: boolean;
};

export type ReviewStepProps = {
  state: SemesterDraft;
  draft: SemesterDraft;
  allDiscounts: Discount[];
  onBack: () => void;
  onPublish: () => void;
};

/* -------------------------------------------------------------------------- */
/* Payment Domain                                                                */
/* -------------------------------------------------------------------------- */

export type PaymentFormState = {
  type: "pay_in_full" | "deposit_flat" | "deposit_percent" | "installments";
  dueDate: string;
  installmentCount: string;
};

export type GiveSessionScope =
  | "one_session"
  | "all_sessions"
  | "all_sessions_once_threshold"
  | "threshold_session_only"
  | "threshold_and_additional_sessions";

export type RecipientScope = "threshold_only" | "threshold_and_additional";

export type EligibleSessionsMode = "all" | "selected";

export type CreateDiscountInput = {
  name: string;
  category: DiscountCategory;
  eligibleSessionsMode: EligibleSessionsMode;
  giveSessionScope: GiveSessionScope;
  recipientScope?: RecipientScope;
  rules: DiscountRules[];
  sessionIds?: string[];
};

/* -------------------------------------------------------------------------- */
/* Email Broadcast Domain                                                      */
/* -------------------------------------------------------------------------- */

export type EmailStatus = "draft" | "scheduled" | "sending" | "sent" | "failed" | "cancelled";

export type Email = {
  id: string;
  subject: string;
  body_html: string;
  body_json: Record<string, unknown>;
  status: EmailStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  sender_name: string;
  sender_email: string;
  reply_to_email: string | null;
  include_signature: boolean;
  created_by_admin_id: string;
  updated_by_admin_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  body_json: Record<string, unknown>;
  created_by_admin_id: string;
  updated_by_admin_id: string;
  created_at: string;
  updated_at: string;
};

export type EmailRecipient = {
  id: string;
  email_id: string;
  user_id: string;
  email_address: string;
  first_name: string;
  last_name: string;
  created_at: string;
};

export type EmailDelivery = {
  id: string;
  email_id: string;
  user_id: string;
  email_address: string;
  resend_message_id: string | null;
  status: "pending" | "sent" | "delivered" | "bounced" | "complained";
  delivered_at: string | null;
  bounced_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailSubscription = {
  user_id: string;
  is_subscribed: boolean;
  unsubscribed_at: string | null;
  updated_at: string;
};

export type EmailActivityLog = {
  id: string;
  email_id: string;
  action:
    | "created"
    | "edited"
    | "scheduled"
    | "sent"
    | "cancelled"
    | "cloned"
    | "deleted";
  admin_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type EmailAnalytics = {
  id: string;
  subject: string;
  sent_at: string;
  sender_name: string;
  recipient_count: number;
  delivered_count: number;
  opened_count: number;
  clicked_count: number;
  bounced_count: number;
  failed_count: number;
  open_rate: number;
  click_rate: number;
};

/* Email wizard draft state */

export type DancerClassContext = {
  dancerName: string;
  classes: { className: string; sessionLabel: string }[];
};

export type FamilyRecipient = {
  familyId: string;
  primaryEmail: string;
  primaryParentFirstName: string;
  primaryParentLastName: string;
  dancers: DancerClassContext[];
  isInstructor?: boolean;
};

export type EmailDraft = {
  id?: string;
  setup?: {
    subject: string;
    senderName: string;
    senderEmail: string;
    replyToEmail?: string;
    includeSignature: boolean;
  };
  recipients?: {
    selections: EmailSelectionCriteria[];
    manualAdditions: ManualUserEntry[];
    /** Family IDs to exclude from the send list */
    excludedFamilyIds: string[];
    /** Client-side preview cache — not persisted to DB */
    resolvedFamilies?: FamilyRecipient[];
    resolvedCount?: number;
  };
  design?: {
    bodyHtml: string;
    bodyJson: Record<string, unknown>;
  };
  schedule?: {
    sendMode: "now" | "scheduled";
    scheduledAt?: string;
  };
};

export type EmailSelectionCriteria = {
  localId: string;
  type: "semester" | "class" | "session" | "subscribed_list" | "instructor";
  semesterId?: string;
  semesterName?: string;
  /** For type === "class" */
  classId?: string;
  className?: string;
  /** For type === "session" */
  sessionId?: string;
  sessionName?: string;
  /** Auto-include the instructor(s) of the selected class/session */
  includeInstructors?: boolean;
  /** For type === "instructor" — targets all families enrolled in any class taught by this person */
  instructorName?: string;
};

export type EmailSubscriber = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  is_subscribed: boolean;
  unsubscribed_at: string | null;
  created_at: string;
};

export type ManualUserEntry = {
  userId?: string;
  subscriberId?: string;
  email: string;
  firstName: string;
  lastName: string;
};

export type EmailWizardAction =
  | { type: "SET_ID"; payload: string }
  | { type: "SET_SETUP"; payload: EmailDraft["setup"] }
  | { type: "SET_RECIPIENTS"; payload: EmailDraft["recipients"] }
  | { type: "ADD_SELECTION"; payload: EmailSelectionCriteria }
  | { type: "REMOVE_SELECTION"; payload: string }
  | { type: "TOGGLE_INSTRUCTOR_INCLUSION"; payload: string } // localId
  | { type: "ADD_MANUAL_USER"; payload: ManualUserEntry }
  | { type: "REMOVE_MANUAL_USER"; payload: string }
  | { type: "TOGGLE_FAMILY_EXCLUSION"; payload: string } // familyId
  | { type: "SET_RESOLVED_FAMILIES"; payload: FamilyRecipient[] }
  | { type: "SET_RESOLVED_COUNT"; payload: number }
  | { type: "SET_DESIGN"; payload: EmailDraft["design"] }
  | { type: "SET_SCHEDULE"; payload: EmailDraft["schedule"] }
  | { type: "RESET" };

export type AdminSignature = {
  display_name: string | null;
  signature_html: string | null;
  reply_to_email: string | null;
};

export type EmailTab =
  | "drafts"
  | "scheduled"
  | "sent"
  | "failed"
  | "templates"
  | "unsubscribed"
  | "subscribed"
  | "external_subscribers";

export type PaginatedResult<T> = {
  data: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type EmailListRow = Email & {
  recipient_count: number;
  created_by: { first_name: string; last_name: string } | null;
  updated_by: { first_name: string; last_name: string } | null;
};

export type EmailAnalyticsRow = EmailAnalytics & {
  created_by: { first_name: string; last_name: string } | null;
};

export type TemplateListRow = EmailTemplate & {
  created_by: { first_name: string; last_name: string } | null;
};

export type SubscriptionListRow = EmailSubscription & {
  users: { email: string; first_name: string; last_name: string } | null;
};

export type FamilyEmailHistoryRow = {
  email_id: string;
  subject: string;
  sent_at: string;
  opened: boolean;
  clicked: boolean;
  status: string;
};

/* ============================================================================
   MEDIA
============================================================================ */

export const MEDIA_FOLDERS = [
  "general",
  "email-banners",
  "website",
  "staff",
] as const;
export type MediaFolder = (typeof MEDIA_FOLDERS)[number];

export const MEDIA_FOLDER_LABELS: Record<MediaFolder, string> = {
  "general":       "General",
  "email-banners": "Email Banners",
  "website":       "Website Images",
  "staff":         "Staff Photos",
};

export type MediaImage = {
  id: string;
  display_name: string;
  storage_path: string;
  public_url: string;
  folder: string;
  tags: string[];
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  created_at: string;
  updated_at: string;
};

export type ImageLayout = "inline" | "banner";

export type MediaFolderRow = {
  name: string;
  label: string;
  created_at?: string;
};

/* -------------------------------------------------------------------------- */
/* EPG Payment Types                                                           */
/* -------------------------------------------------------------------------- */

/** State machine for the payments table, aligned with EPG EventType values. */
export type PaymentState =
  | "initiated"           // Row created; no EPG calls made yet
  | "pending_authorization" // Payment session created; user on EPG HPP
  | "authorized"          // saleAuthorized webhook received
  | "captured"            // saleCaptured (only relevant if doCapture=false flow)
  | "settled"             // saleSettled
  | "declined"            // saleDeclined
  | "voided"              // voidAuthorized
  | "refunded"            // refundAuthorized
  | "held_for_review";    // saleHeldForReview

/** A row in the `payments` table. */
export interface Payment {
  id: string;
  registration_batch_id: string;
  order_id: string | null;
  payment_session_id: string | null;
  transaction_id: string | null;
  custom_reference: string;
  amount: number;
  currency: string;
  state: PaymentState;
  event_type: string | null;
  raw_notification: Record<string, unknown> | null;
  raw_transaction: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/* -------------------------------------------------------------------------- */
/* Competition Track Domain                                                    */
/* -------------------------------------------------------------------------- */

/** A single audition time slot for a competition/invite-only class. */
export interface AuditionSession {
  id: string;
  class_id: string;
  semester_id: string;
  label: string | null;
  start_at: string;      // TIMESTAMPTZ ISO
  end_at: string;        // TIMESTAMPTZ ISO
  location: string | null;
  capacity: number | null;
  price: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Access types for a class invite. */
export type InviteAccessType = "invite_only" | "token_link" | "hybrid";

/** Lifecycle status for a class invite. */
export type InviteStatus =
  | "pending"
  | "sent"
  | "opened"
  | "registered"
  | "expired"
  | "revoked";

/** A DB row from `class_invites`. */
export interface ClassInvite {
  id: string;
  class_id: string;
  access_type: InviteAccessType;
  email: string | null;
  dancer_id: string | null;
  invite_token: string;   // UUID stored as text
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  status: InviteStatus;
  sent_at: string | null;
  /** ISO timestamp of first invite open. Set once by recordInviteOpen (idempotent).
   *  null = invite has never been opened. */
  opened_at: string | null;
  created_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Immutable event log entry for an invite (open, click, register …). */
export interface InviteEvent {
  id: string;
  invite_id: string;
  event_type: "sent" | "opened" | "clicked" | "registered" | "expired" | "revoked";
  audition_booking_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** A confirmed booking for an audition session. */
export interface AuditionBooking {
  id: string;
  audition_session_id: string;
  class_id: string;
  invite_id: string | null;
  dancer_id: string | null;
  parent_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  status: "confirmed" | "cancelled" | "no_show";
  amount_paid: number;
  payment_status: "unpaid" | "paid" | "waived";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Admin-facing invite row with counts for the invite management table. */
export type ClassInviteRow = ClassInvite & {
  dancer?: { first_name: string; last_name: string } | null;
  event_counts?: {
    opened: number;
    registered: number;
  };
  /** Derived: true when expires_at is in the past */
  isExpired: boolean;
  /** Derived: true when max_uses is not null and use_count >= max_uses */
  isExhausted: boolean;
};

/** Payload for creating a new invite (admin action). */
export type CreateInviteInput = {
  classId: string;
  accessType: InviteAccessType;
  /** Required for invite_only / hybrid */
  email?: string;
  /** Optionally link to an existing dancer */
  dancerId?: string;
  expiresAt?: string;   // ISO datetime
  maxUses?: number;
  notes?: string;
};

/* -------------------------------------------------------------------------- */
/* SMS Domain                                                                  */
/* -------------------------------------------------------------------------- */

export interface SmsNotification {
  id: string;
  user_id: string | null;
  to_phone: string;
  body: string;
  status: "queued" | "sent" | "delivered" | "failed" | "undelivered";
  twilio_sid: string | null;
  error_message: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Admin Registration ────────────────────────────────────────────────────

export type AdminPaymentPlanType = "pay_in_full" | "monthly";

export type AdminAdjustment = {
  type: "tuition_adjustment" | "credit";
  label: string;
  amount: number; // positive value; applied as a deduction from grand total
};

// ─── Invite Token ──────────────────────────────────────────────────────────

/** Result returned from validateInviteToken server action. */
export type InviteTokenValidation =
  | {
      valid: true;
      invite: ClassInvite;
      danceClass: {
        id: string;
        name: string;
        discipline: string;
        division: string;
        description: string | null;
      };
      auditionSessions: AuditionSession[];
    }
  | {
      valid: false;
      reason: "not_found" | "expired" | "exhausted" | "revoked";
    };
