/* -------------------------------------------------------------------------- */
/* User Domain                                                                */
/* -------------------------------------------------------------------------- */

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
    registrations: {
      id: string;
      programs: {
        id: string;
        title: string;
        days_of_week: string | null;
        start_time: string | null;
        end_time: string | null;
      } | null;
    }[];
  }[];
}

/* -------------------------------------------------------------------------- */
/* Session Domain                                                                */
/* -------------------------------------------------------------------------- */

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
  // created_at: string;
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
    appliedSessions: SemesterSession[];
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
};

export type SemesterAction =
  | { type: "SET_ID"; payload: SemesterDraft["id"] }
  | { type: "SET_DETAILS"; payload: SemesterDraft["details"] }
  | { type: "SET_SESSIONS"; payload: SemesterDraft["sessions"] }
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
    sessions: {
      id: string;
      title: string;
    } | null;
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
  capacityWarningThreshold: string;
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
  open_rate: number;
  click_rate: number;
};

/* Email wizard draft state */

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
    exclusions: string[];
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
  type: "semester" | "session";
  semesterId: string;
  semesterName: string;
  sessionId?: string;
  sessionName?: string;
};

export type ManualUserEntry = {
  userId: string;
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
  | { type: "ADD_MANUAL_USER"; payload: ManualUserEntry }
  | { type: "REMOVE_MANUAL_USER"; payload: string }
  | { type: "TOGGLE_EXCLUSION"; payload: string }
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
  | "subscribed";

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

export const MEDIA_FOLDERS = ["general", "banners", "logos"] as const;
export type MediaFolder = (typeof MEDIA_FOLDERS)[number];

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
