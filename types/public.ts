/* -------------------------------------------------------------------------- */
/* Public-facing normalized types                                              */
/* Subset of admin domain types — safe to expose in user-facing UI.           */
/* No admin-only fields (audit logs, email HTML, internal config).            */
/* -------------------------------------------------------------------------- */

import type { RegistrationFormElement, HydratedDiscount } from "./index";

export type DataMode = "live" | "preview";

/* -------------------------------------------------------------------------- */
/* Session primitives                                                          */
/* -------------------------------------------------------------------------- */

export interface PublicAvailableDay {
  id: string;
  date: string; // ISO date "YYYY-MM-DD"
  dayOfWeek: string; // "Monday", "Tuesday", etc.
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  instructor?: string | null;
}

export interface PublicSession {
  /** class_session id (Phase 1+) */
  id: string;
  /** Phase 1+: classes.id this session slot belongs to */
  classId?: string | null;
  /** class_schedules.id this session was generated from */
  scheduleId?: string | null;
  name: string;
  description?: string | null;
  category?: string | null;

  discipline?: string | null;
  division?: string | null;

  location?: string | null;

  scheduleDate: string;
  startTime?: string | null;
  endTime?: string | null;

  instructorName?: string | null;

  /**
   * Pricing model inherited from the parent schedule.
   *   full_schedule — this session belongs to a full-season enrollment;
   *                   priced via priceTiers on the schedule, not individually.
   *   per_session   — this session can be purchased standalone at dropInPrice.
   */
  pricingModel: "full_schedule" | "per_session";
  /**
   * Mode A only: available price tiers for the parent schedule.
   * User selects one tier; amount covers the entire schedule.
   */
  priceTiers?: Array<{
    id: string;
    label: string;
    amount: number;
    isDefault: boolean;
  }>;
  /**
   * Mode B only: flat price for this individual session date.
   * Null if the session belongs to a full_schedule schedule.
   */
  dropInPrice?: number | null;

  /** Capacity semantics differ by pricingModel:
   *  full_schedule → schedule-level enrollment count (schedule_enrollments)
   *  per_session   → per-session registration count (registrations)
   */
  capacity: number;
  enrolledCount: number;
  spotsRemaining: number;

  minAge?: number | null;
  maxAge?: number | null;
  minGrade?: number | null;
  maxGrade?: number | null;

  registrationCloseAt?: string | null;
  /** Assigned group id for bundle/grouping UI */
  groupId?: string | null;
  waitlistEnabled: boolean;

  /** Phase 6: true when the class is part of the competition program */
  isCompetitionTrack?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Session group                                                               */
/* -------------------------------------------------------------------------- */

export interface PublicSessionGroup {
  id: string;
  name: string;
  sessionIds: string[];
}

/* -------------------------------------------------------------------------- */
/* Payment plan                                                                */
/* -------------------------------------------------------------------------- */

export interface PublicPaymentPlan {
  type: "pay_in_full" | "deposit_flat" | "deposit_percent" | "installments";
  depositAmount?: number | null;
  depositPercent?: number | null;
  installmentCount?: number | null;
  dueDate?: string | null;
  installments?: { number: number; amount: number; dueDate: string }[];
}

/* -------------------------------------------------------------------------- */
/* Semester                                                                    */
/* -------------------------------------------------------------------------- */

export interface PublicSemester {
  id: string;
  name: string;
  status: "draft" | "scheduled" | "published" | "archived";
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  /** When set, the class catalog is hidden until this timestamp is reached. */
  registrationOpenAt?: string | null;
  paymentPlan?: PublicPaymentPlan | null;
  registrationForm: RegistrationFormElement[];
  sessions: PublicSession[];
  sessionGroups: PublicSessionGroup[];
  discounts: HydratedDiscount[];
  waitlistEnabled: boolean;
}

/* -------------------------------------------------------------------------- */
/* Cart                                                                        */
/* -------------------------------------------------------------------------- */

export interface CartItem {
  /** Client-generated uuid for this cart line */
  id: string;
  semesterId: string;
  sessionId: string;
  sessionName: string;

  priceSnapshot?: number;
  /** IDs of PublicAvailableDay the user selected */
  // selectedDayIds: string[];
  /** Full day objects snapshotted at add-time (for display without re-fetching semester) */
  // selectedDays: PublicAvailableDay[];
  // pricePerDay: number;
  /** pricePerDay * selectedDayIds.length */
  // subtotal: number;
  addedAt: string; // ISO timestamp
  /** Session age constraints — snapshotted for use in participant validation */
  // minAge: number | null;
  // maxAge: number | null;
}

export interface CartState {
  semesterId: string;
  sessionIds: string[];
  // items: CartItem[];
  /** ISO timestamp — 2h from first addItem */
  expiresAt: string;
  // subtotal: number;
  // discountAmount: number;
  // total: number;
}

/* -------------------------------------------------------------------------- */
/* Registration flow                                                           */
/* -------------------------------------------------------------------------- */

export type RegistrationStep =
  | "email"
  | "participants"
  | "form"
  | "payment"
  | "success";

export interface ParticipantAssignment {
  sessionId: string;
  /** null = creating a new dancer */
  dancerId: string | null;
  newDancer?: NewDancerDraft;
  ageStatus: "valid" | "warning" | "error" | "unchecked";
  /** IDs of session_occurrence_dates selected in the cart for this session */
  selectedDayIds?: string[];
}

export interface NewDancerDraft {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender?: string;
}

export interface RegistrationState {
  step: RegistrationStep;
  email: string;
  isExistingParent: boolean;
  parentId: string | null;
  participants: ParticipantAssignment[];
  /** Answers to the dynamic registration form — keyed by RegistrationFormElement.id */
  formData: Record<string, unknown>;
  paymentIntentId: string | null;
  batchId: string | null;
  isPreview: boolean;
  errors: Partial<Record<RegistrationStep, string[]>>;
}

export type RegistrationAction =
  | { type: "SET_EMAIL"; payload: string }
  | {
      type: "SET_PARENT_CHECK";
      payload: { isExisting: boolean; parentId: string | null };
    }
  | { type: "SET_PARTICIPANTS"; payload: ParticipantAssignment[] }
  | { type: "SET_FORM_DATA"; payload: Record<string, unknown> }
  | {
      type: "SET_PAYMENT_INTENT";
      payload: { intentId: string; batchId: string };
    }
  | { type: "SET_STEP"; payload: RegistrationStep }
  | { type: "SET_ERRORS"; payload: Partial<Record<RegistrationStep, string[]>> }
  | { type: "RESET" };
