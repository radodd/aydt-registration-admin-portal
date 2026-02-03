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
    programs: {
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

export type SemesterDraft = {
  details: {
    name: string;
    trackingMode: boolean;
    capacityWarningThreshold?: number;
    publishAt?: Date;
  };

  sessions: {
    sessionIds: string[];
    tagsBySession: Record<string, string[]>;
  };

  paymentPlan: {
    type: "pay_in_full" | "deposit_flat" | "deposit_percent" | "installments";
    depositAmount?: number;
    depositPercent?: number;
    installmentCount?: number;
    dueDate: string;
    installments?: { number: number; amount: number; dueDate: string }[];
  };

  discounts: {
    semesterDiscountIds: string[];
    sessionDiscounts: Record<string, string[]>;
  };
};

export type SemesterSession = {
  sessionId: string;
  title: string;

  startDate: string;
  endDate: string;
  daysOfWeek: string[];
  type: string;
  capacity: number;

  // Optional overrides (what the user edits)
  overriddenTitle?: string;
  overriddenStartDate?: string;
  overriddenEndDate?: string;
  overriddenDaysOfWeek?: string[];
  overriddenType?: string;
  overriddenCapacity?: number;
};

export type SemesterDiscount = {
  discountId: string;

  // snapshot fields
  name: string;
  category: DiscountCategory;
  eligibleSessionsMode: "all" | "selected";
  eligibleSessionIds?: string[];

  rules: DiscountRule[];

  // lifecycle controls
  enabled: boolean;
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
