/**
 * DEV-ONLY: Complete SemesterDraft fixture covering all 9 steps.
 * Used by the "Fill Test Data" button in SemesterForm.tsx.
 * This file is dynamically imported and excluded from production bundles.
 */

import { SemesterDraft } from "@/types";

const SCHED_BALLET_KEY = "dev-sched-ballet-1a";
const SCHED_CONTEMP_KEY = "dev-sched-contemp-1";

export const TEST_SEMESTER_FIXTURE: SemesterDraft = {
  details: {
    name: "Dev Test Semester (Spring 2027)",
    trackingMode: false,
    capacityWarningThreshold: 3,
  },

  sessions: {
    classes: [
      {
        _clientKey: "dev-class-ballet-1a",
        offeringType: "standard",
        name: "Ballet 1A",
        discipline: "ballet",
        division: "junior",
        description: "Introductory ballet for junior dancers.",
        minAge: 6,
        maxAge: 9,
        isCompetitionTrack: false,
        requiresTeacherRec: false,
        visibility: "public",
        enrollmentType: "standard",
        schedules: [
          {
            _clientKey: SCHED_BALLET_KEY,
            daysOfWeek: ["wednesday"],
            startTime: "16:00",
            endTime: "17:00",
            startDate: "2027-01-08",
            endDate: "2027-05-21",
            location: "Studio A",
            instructorName: "Ms. Rivera",
            capacity: 14,
            genderRestriction: "no_restriction",
            pricingModel: "full_schedule",
          },
        ],
      },
      {
        _clientKey: "dev-class-contemp-1",
        offeringType: "standard",
        name: "Contemporary 1",
        discipline: "contemporary",
        division: "senior",
        description: "Beginning contemporary for senior dancers.",
        minAge: 12,
        maxAge: 17,
        isCompetitionTrack: false,
        requiresTeacherRec: false,
        visibility: "public",
        enrollmentType: "standard",
        schedules: [
          {
            _clientKey: SCHED_CONTEMP_KEY,
            daysOfWeek: ["monday"],
            startTime: "17:30",
            endTime: "18:30",
            startDate: "2027-01-06",
            endDate: "2027-05-19",
            location: "Studio B",
            instructorName: "Mr. Chen",
            capacity: 12,
            genderRestriction: "no_restriction",
            pricingModel: "full_schedule",
          },
        ],
      },
    ],
  },

  sessionGroups: {
    groups: [
      {
        id: "dev-group-1",
        name: "All Classes",
        sessionIds: [SCHED_BALLET_KEY, SCHED_CONTEMP_KEY],
      },
    ],
  },

  paymentPlan: {
    type: "pay_in_full",
    dueDate: "2027-09-01",
  },

  tuitionRateBands: [
    {
      _clientKey: "dev-band-junior-1x",
      division: "junior",
      weekly_class_count: 1,
      base_tuition: 775.93,
      progressive_discount_percent: 0,
    },
    {
      _clientKey: "dev-band-junior-2x",
      division: "junior",
      weekly_class_count: 2,
      base_tuition: 1250.0,
      progressive_discount_percent: 0,
    },
    {
      _clientKey: "dev-band-senior-1x",
      division: "senior",
      weekly_class_count: 1,
      base_tuition: 796.43,
      progressive_discount_percent: 0,
    },
    {
      _clientKey: "dev-band-senior-2x",
      division: "senior",
      weekly_class_count: 2,
      base_tuition: 1275.0,
      progressive_discount_percent: 0,
    },
  ],

  feeConfig: {
    registration_fee_per_child: 40,
    family_discount_amount: 50,
    auto_pay_admin_fee_monthly: 5,
    auto_pay_installment_count: 5,
    senior_video_fee_per_registrant: 15,
    senior_costume_fee_per_class: 65,
    junior_costume_fee_per_class: 55,
  },

  discounts: {
    appliedDiscounts: [],
  },

  coupons: [
    {
      _clientKey: "dev-coupon-devtest10",
      name: "Dev Test 10% Off",
      code: "DEVTEST10",
      value: 10,
      valueType: "percent",
      validFrom: null,
      validUntil: null,
      maxTotalUses: null,
      usesCount: 0,
      maxPerFamily: 99,
      stackable: true,
      eligibleSessionsMode: "all",
      isActive: true,
    },
  ],

  registrationForm: {
    elements: [
      {
        id: "dev-elem-header",
        type: "subheader",
        label: "Dancer Information",
        subtitle: "Please fill out the form below for each dancer.",
      },
      {
        id: "dev-elem-emergency",
        type: "question",
        label: "Emergency Contact Name",
        inputType: "short_answer",
        required: true,
      },
    ],
  },

  confirmationEmail: {
    subject: "You're registered for {{session_title}}!",
    fromName: "AYDT Studio",
    fromEmail: "no-reply@aydt.com",
    htmlBody:
      "<p>Hi {{first_name}},</p><p>Thank you for registering! We look forward to seeing you in class.</p>",
  },

  waitlist: {
    enabled: false,
    sessionSettings: {},
    inviteExpiryHours: 48,
    stopDaysBeforeClose: 3,
    invitationEmail: {
      subject: "A spot opened up in {{session_name}}!",
      fromName: "AYDT Studio",
      fromEmail: "no-reply@aydt.com",
      htmlBody:
        "<p>Hi {{parent_name}},</p><p>A spot has opened up for {{participant_name}}. Accept by {{hold_until_datetime}}.</p><p><a href='{{accept_link}}'>Accept your spot</a></p>",
    },
  },
};
