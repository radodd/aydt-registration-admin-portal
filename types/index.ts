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
/* Semester Domain                                                                */
/* -------------------------------------------------------------------------- */

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

  discounts?: {
    // semesterDiscountIds: string[];
    // sessionDiscounts: Record<string, string[]>;
    appliedDiscounts: DiscountApplication[];
  };
};

export type SemesterAction =
  | { type: "SET_ID"; payload: SemesterDraft["id"] }
  | { type: "SET_DETAILS"; payload: SemesterDraft["details"] }
  | { type: "SET_SESSIONS"; payload: SemesterDraft["sessions"] }
  | { type: "SET_SESSION_GROUPS"; payload: SemesterDraft["sessionGroups"] }
  | { type: "SET_PAYMENT"; payload: SemesterDraft["paymentPlan"] }
  | { type: "SET_DISCOUNTS"; payload: SemesterDraft["discounts"] }
  | { type: "RESET" };

export type SemesterSession = {
  sessionId: string;

  title: string;
  type: string | null;
  capacity: number | null;

  startDate: string | null;
  endDate: string | null;
  daysOfWeek: string[];

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

  rules: DiscountRule[];
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
  rules: DiscountRule[];
  enabled: boolean;
  created_at: string;
};

export type DiscountApplication = {
  discountId: string;
  scope: "all_sessions" | "selected_sessions";
  sessionIds?: string[];
};

export type DiscountCategory = "multi_person" | "multi_session" | "custom";

export type DiscountRule = {
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
};

export type PaymentStepProps = {
  state: SemesterDraft;
  dispatch: React.Dispatch<SemesterAction>;
  onNext: () => void;
  onBack: () => void;
};

export type DiscountsStepProps = {
  state: SemesterDraft;
  dispatch: React.Dispatch<SemesterAction>;
  onNext: () => void;
  onBack: () => void;
  allDiscounts: Discount[];
  refreshDiscounts: () => Promise<void>;
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
  rules: DiscountRule[];
  sessionIds?: string[];
};
