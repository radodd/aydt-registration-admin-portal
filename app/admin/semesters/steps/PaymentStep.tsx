"use client";

import {
  DraftFeeConfig,
  DraftSpecialProgramTuition,
  DraftTuitionRateBand,
  PaymentFormState,
  PaymentStepProps,
} from "@/types";
import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { InlineDatePicker } from "@/app/components/ui/InlineDatePicker";

/* -------------------------------------------------------------------------- */
/* Sub-step types                                                              */
/* -------------------------------------------------------------------------- */

type SubStep = "plans" | "tuition" | "programs" | "fees";

const SUB_STEPS: { key: SubStep; label: string }[] = [
  { key: "plans", label: "1. Payment Plans" },
  { key: "tuition", label: "2. Tuition Rates" },
  { key: "programs", label: "3. Special Programs" },
  { key: "fees", label: "4. Fee Config" },
];

const DIVISIONS = [
  { value: "early_childhood", label: "Early Childhood" },
  { value: "junior", label: "Junior" },
  { value: "senior", label: "Senior" },
  { value: "competition", label: "Competition" },
] as const;

const SPECIAL_PROGRAM_KEYS: { value: string; label: string }[] = [
  { value: "early_childhood", label: "Early Childhood (9-class session)" },
  { value: "technique", label: "Technique 1 / 2 / 3" },
  { value: "pre_pointe", label: "Pre-Pointe (2×/week)" },
  { value: "pointe", label: "Pointe (2×/week)" },
  { value: "competition_junior", label: "Competition Team — Junior" },
  { value: "competition_senior", label: "Competition Team — Senior" },
];

const DEFAULT_FEE_CONFIG: DraftFeeConfig = {
  registration_fee_per_child: 40,
  family_discount_amount: 50,
  auto_pay_admin_fee_monthly: 5,
  auto_pay_installment_count: 5,
  senior_video_fee_per_registrant: 15,
  senior_costume_fee_per_class: 65,
  junior_costume_fee_per_class: 55,
  costume_fee_exempt_keys: ["technique", "pointe", "competition"],
};

const EXEMPT_KEY_OPTIONS: { value: string; label: string }[] = [
  { value: "technique", label: "Technique" },
  { value: "pre_pointe", label: "Pre-Pointe" },
  { value: "pointe", label: "Pointe" },
  { value: "competition", label: "Competition" },
  { value: "early_childhood", label: "Early Childhood" },
];

const EMPTY_PROGRAM: Omit<DraftSpecialProgramTuition, "_clientKey" | "id"> = {
  programKey: "technique",
  programLabel: "Technique 1 / 2 / 3",
  semesterTotal: 0,
  autoPayInstallmentAmount: null,
  autoPayInstallmentCount: 5,
  notes: "",
};

/* -------------------------------------------------------------------------- */
/* Established AYDT tuition defaults                                          */
/* -------------------------------------------------------------------------- */
/*
 * Source: AYDT internal tuition sheet. base_tuition is the cumulative class
 * fee for that many classes/week with the progressive discount already applied
 * (1×: 0%, 2×: 5%, 3×: 10%, 4×: 15%, 5×: 20%, 6×: 25%). semester_total adds
 * costume + video fees. Auto-pay amounts are over 5 monthly installments.
 *
 * Admins can edit any row at creation time; these are seeded on a brand-new
 * semester and re-seeded if the Tuition Rates tab is opened with zero rows.
 */
const DEFAULT_TUITION_RATE_BANDS: Omit<
  DraftTuitionRateBand,
  "_clientKey" | "id"
>[] = [
  { division: "junior", weekly_class_count: 1, base_tuition: 775.93,  progressive_discount_percent: 0,  semester_total: 870.93,  autopay_installment_amount: 179.19 },
  { division: "junior", weekly_class_count: 2, base_tuition: 1513.06, progressive_discount_percent: 5,  semester_total: 1663.06, autopay_installment_amount: 337.61 },
  { division: "junior", weekly_class_count: 3, base_tuition: 2211.39, progressive_discount_percent: 10, semester_total: 2416.39, autopay_installment_amount: 488.28 },
  { division: "senior", weekly_class_count: 1, base_tuition: 796.43,  progressive_discount_percent: 0,  semester_total: 916.43,  autopay_installment_amount: 188.29 },
  { division: "senior", weekly_class_count: 2, base_tuition: 1553.04, progressive_discount_percent: 5,  semester_total: 1738.04, autopay_installment_amount: 352.61 },
  { division: "senior", weekly_class_count: 3, base_tuition: 2269.83, progressive_discount_percent: 10, semester_total: 2519.83, autopay_installment_amount: 508.97 },
  { division: "senior", weekly_class_count: 4, base_tuition: 2946.80, progressive_discount_percent: 15, semester_total: 3261.80, autopay_installment_amount: 657.36 },
  { division: "senior", weekly_class_count: 5, base_tuition: 3583.94, progressive_discount_percent: 20, semester_total: 3963.94, autopay_installment_amount: 797.79 },
  { division: "senior", weekly_class_count: 6, base_tuition: 4181.26, progressive_discount_percent: 25, semester_total: 4626.26, autopay_installment_amount: 930.25 },
];

/*
 * Established defaults for Special Programs keyed by programKey. Used by
 * autoPopulatePrograms when matching a class discipline → program row.
 * Auto-pay amounts for Technique/Pointe deliberately exclude the standard
 * $5/mo admin fee per AYDT's policy.
 */
const DEFAULT_SPECIAL_PROGRAM_BY_KEY: Record<
  string,
  Pick<
    DraftSpecialProgramTuition,
    "programLabel" | "semesterTotal" | "autoPayInstallmentAmount" | "autoPayInstallmentCount" | "registrationFeeOverride"
  >
> = {
  // semesterTotal is TUITION-ONLY ($394.11); the engine adds the standard $40
  // registration fee as a separate line (registrationFeeOverride left undefined
  // so EC tracks fee-config like junior/senior) → $434.11 all-in. Storing the
  // all-in $434.11 here double-charged reg (tuition line already baked it in,
  // then +$40 again = $474.11). Matches pricingConvergence "Mode 4".
  early_childhood:     { programLabel: "Early Childhood (9-class session)", semesterTotal: 394.11, autoPayInstallmentAmount: null,   autoPayInstallmentCount: 5, registrationFeeOverride: undefined },
  technique:           { programLabel: "Technique 1 / 2 / 3",               semesterTotal: 716.78, autoPayInstallmentAmount: 143.36, autoPayInstallmentCount: 5, registrationFeeOverride: 0 },
  pre_pointe:          { programLabel: "Pre-Pointe (2×/week)",              semesterTotal: 457.63, autoPayInstallmentAmount: 91.53,  autoPayInstallmentCount: 5, registrationFeeOverride: 0 },
  pointe:              { programLabel: "Pointe (2×/week)",                  semesterTotal: 517.49, autoPayInstallmentAmount: 103.50, autoPayInstallmentCount: 5, registrationFeeOverride: 0 },
  competition_junior:  { programLabel: "Competition Team — Junior",         semesterTotal: 842.61, autoPayInstallmentAmount: 168.52, autoPayInstallmentCount: 5, registrationFeeOverride: 0 },
  competition_senior:  { programLabel: "Competition Team — Senior",         semesterTotal: 802.94, autoPayInstallmentAmount: 160.59, autoPayInstallmentCount: 5, registrationFeeOverride: 0 },
};

// Stable display order for the seeded Special Programs list.
const DEFAULT_SPECIAL_PROGRAM_ORDER: string[] = [
  "early_childhood",
  "technique",
  "pre_pointe",
  "pointe",
  "competition_junior",
  "competition_senior",
];

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export default function PaymentStep({
  state,
  dispatch,
  onNext,
  onBack,
  isLocked = false,
  isSaving = false,
}: PaymentStepProps) {
  const [activeSubStep, setActiveSubStep] = useState<SubStep>("plans");

  /* ---- Payment plan state ---- */
  const [form, setForm] = useState<PaymentFormState>({
    type: state.paymentPlan?.type ?? "pay_in_full",
    depositAmount: state.paymentPlan?.depositAmount?.toString() ?? "",
    depositPercent: state.paymentPlan?.depositPercent?.toString() ?? "",
    dueDate: state.paymentPlan?.dueDate ?? "",
    installmentCount: state.paymentPlan?.installmentCount?.toString() ?? "",
  });

  /* ---- Tuition rate bands state ---- */
  const [bands, setBands] = useState<DraftTuitionRateBand[]>(
    state.tuitionRateBands ?? [],
  );
  const [newBand, setNewBand] = useState<
    Omit<DraftTuitionRateBand, "_clientKey" | "id">
  >({
    division: "junior",
    weekly_class_count: 1,
    base_tuition: 0,
    progressive_discount_percent: 0,
    semester_total: undefined,
    autopay_installment_amount: undefined,
    notes: "",
  });

  /* ---- Special program tuition state ---- */
  const [programs, setPrograms] = useState<DraftSpecialProgramTuition[]>(
    state.specialProgramTuition ?? [],
  );
  const [autoPopulateMsg, setAutoPopulateMsg] = useState("");
  const [newProgram, setNewProgram] = useState<
    Omit<DraftSpecialProgramTuition, "_clientKey" | "id">
  >({ ...EMPTY_PROGRAM });

  /* ---- Fee config state ---- */
  const [feeConfig, setFeeConfig] = useState<DraftFeeConfig>(
    state.feeConfig ?? DEFAULT_FEE_CONFIG,
  );

  /* ---- Registration-fee-exempt classes (meeting-plan #22) ----
   * The flag lives per-class on state.sessions.classes, not in feeConfig.
   * We track exempt selections by class index (stable within this step) and
   * merge them back into the classes array via SET_SESSIONS on submit. */
  const [regFeeExemptIdxs, setRegFeeExemptIdxs] = useState<Set<number>>(
    () =>
      new Set(
        (state.sessions?.classes ?? [])
          .map((c, i) => (c.registrationFeeExempt ? i : -1))
          .filter((i) => i >= 0),
      ),
  );

  // Meeting-plan #32: persist the reg-fee-exempt toggle the moment it changes.
  // Previously the selection was only merged into the draft inside handleSubmit
  // (this step's primary button), so toggling a pill and then saving via the
  // top-bar Save or the footer Next button silently dropped the change. Merging
  // on every toggle keeps state.sessions (and the synced stateRef) current, so
  // any save path persists it.
  function toggleRegFeeExempt(idx: number) {
    const next = new Set(regFeeExemptIdxs);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setRegFeeExemptIdxs(next);

    const classes = state.sessions?.classes;
    if (classes?.length) {
      dispatch({
        type: "SET_SESSIONS",
        payload: {
          ...state.sessions,
          classes: classes.map((c, ci) => ({
            ...c,
            registrationFeeExempt: next.has(ci),
          })),
        },
      });
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Handlers — plans                                                          */
  /* ------------------------------------------------------------------------ */

  function updateField<K extends keyof PaymentFormState>(
    key: K,
    value: PaymentFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /* ------------------------------------------------------------------------ */
  /* Handlers — tuition rate bands                                             */
  /* ------------------------------------------------------------------------ */

  function addBand() {
    if (newBand.base_tuition <= 0) {
      alert("Base tuition must be greater than zero.");
      return;
    }
    if (
      newBand.progressive_discount_percent < 0 ||
      newBand.progressive_discount_percent > 100
    ) {
      alert("Discount percent must be between 0 and 100.");
      return;
    }
    if (
      newBand.semester_total !== undefined &&
      newBand.semester_total < 0
    ) {
      alert("Semester total cannot be negative.");
      return;
    }
    if (
      newBand.autopay_installment_amount !== undefined &&
      newBand.semester_total !== undefined &&
      newBand.autopay_installment_amount > newBand.semester_total
    ) {
      alert("Auto-pay installment amount cannot exceed semester total.");
      return;
    }
    const duplicate = bands.some(
      (b) =>
        b.division === newBand.division &&
        b.weekly_class_count === newBand.weekly_class_count,
    );
    if (duplicate) {
      alert(
        `A rate band for ${newBand.division} / ${newBand.weekly_class_count} class(es)/week already exists.`,
      );
      return;
    }
    setBands((prev) => [
      ...prev,
      { ...newBand, _clientKey: crypto.randomUUID() },
    ]);
    setNewBand((prev) => ({
      ...prev,
      weekly_class_count: prev.weekly_class_count + 1,
      base_tuition: 0,
      progressive_discount_percent: 0,
      semester_total: undefined,
      autopay_installment_amount: undefined,
      notes: "",
    }));
  }

  function removeBand(clientKey: string) {
    setBands((prev) => prev.filter((b) => b._clientKey !== clientKey));
  }

  function updateBand(
    clientKey: string,
    field: keyof Omit<DraftTuitionRateBand, "_clientKey" | "id">,
    value: string | number | undefined,
  ) {
    setBands((prev) =>
      prev.map((b) =>
        b._clientKey === clientKey ? { ...b, [field]: value } : b,
      ),
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Handlers — special programs                                               */
  /* ------------------------------------------------------------------------ */

  function addProgram() {
    if (newProgram.semesterTotal <= 0) {
      alert("Semester total must be greater than zero.");
      return;
    }
    if (
      newProgram.autoPayInstallmentAmount !== null &&
      newProgram.autoPayInstallmentAmount > newProgram.semesterTotal
    ) {
      alert("Auto-pay installment amount cannot exceed semester total.");
      return;
    }
    const duplicate = programs.some((p) => p.programKey === newProgram.programKey);
    if (duplicate) {
      alert(`A special program entry for "${newProgram.programLabel}" already exists.`);
      return;
    }
    setPrograms((prev) => [
      ...prev,
      { ...newProgram, _clientKey: crypto.randomUUID() },
    ]);
    setNewProgram({ ...EMPTY_PROGRAM });
  }

  function removeProgram(clientKey: string) {
    setPrograms((prev) => prev.filter((p) => p._clientKey !== clientKey));
  }

  /** Scans the semester's classes and adds a program entry for each discipline
   *  that maps to a special program key and doesn't already have one. */
  function autoPopulatePrograms() {
    const classes = state.sessions?.classes ?? [];
    const disciplineToProgram: Record<string, { key: string; label: string }> = {
      technique:       { key: "technique",         label: "Technique 1 / 2 / 3" },
      pre_pointe:      { key: "pre_pointe",         label: "Pre-Pointe (2×/week)" },
      pointe:          { key: "pointe",             label: "Pointe (2×/week)" },
      early_childhood: { key: "early_childhood",    label: "Early Childhood (9-class session)" },
    };
    const seen = new Set<string>();
    const toAdd: DraftSpecialProgramTuition[] = [];

    for (const cls of classes) {
      // Competition track → junior or senior
      if (cls.isCompetitionTrack) {
        const key = cls.division === "senior" ? "competition_senior" : "competition_junior";
        const label = cls.division === "senior"
          ? "Competition Team — Senior"
          : "Competition Team — Junior";
        if (!seen.has(key)) {
          seen.add(key);
          const d = DEFAULT_SPECIAL_PROGRAM_BY_KEY[key];
          toAdd.push({ _clientKey: crypto.randomUUID(), programKey: key, programLabel: label,
            semesterTotal: d?.semesterTotal ?? 0,
            autoPayInstallmentAmount: d?.autoPayInstallmentAmount ?? null,
            autoPayInstallmentCount: d?.autoPayInstallmentCount ?? 5,
            registrationFeeOverride: d?.registrationFeeOverride ?? 0 });
        }
        continue;
      }
      const mapping = disciplineToProgram[cls.discipline];
      if (mapping && !seen.has(mapping.key)) {
        seen.add(mapping.key);
        const d = DEFAULT_SPECIAL_PROGRAM_BY_KEY[mapping.key];
        toAdd.push({ _clientKey: crypto.randomUUID(), programKey: mapping.key,
          programLabel: mapping.label,
          semesterTotal: d?.semesterTotal ?? 0,
          autoPayInstallmentAmount: d?.autoPayInstallmentAmount ?? null,
          autoPayInstallmentCount: d?.autoPayInstallmentCount ?? 5,
          registrationFeeOverride: d?.registrationFeeOverride ?? 0 });
      }
    }

    setPrograms((prev) => {
      const existingKeys = new Set(prev.map((p) => p.programKey));
      const newEntries = toAdd.filter((p) => !existingKeys.has(p.programKey));
      if (newEntries.length === 0) {
        setAutoPopulateMsg("All programs already added.");
        return prev;
      }
      setAutoPopulateMsg(`Added ${newEntries.length} program${newEntries.length !== 1 ? "s" : ""} — enter tuition rates below.`);
      return [...prev, ...newEntries];
    });
  }

  function updateProgram(
    clientKey: string,
    patch: Partial<Omit<DraftSpecialProgramTuition, "_clientKey" | "id">>,
  ) {
    setPrograms((prev) =>
      prev.map((p) => (p._clientKey === clientKey ? { ...p, ...patch } : p)),
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Handlers — fee config                                                     */
  /* ------------------------------------------------------------------------ */

  function updateFeeConfig<K extends keyof DraftFeeConfig>(
    key: K,
    value: DraftFeeConfig[K],
  ) {
    setFeeConfig((prev) => ({ ...prev, [key]: value }));
  }

  /* ------------------------------------------------------------------------ */
  /* Submit                                                                    */
  /* ------------------------------------------------------------------------ */

  function isPlansValid(): boolean {
    if (form.type !== "pay_in_full" && !form.dueDate) {
      alert("Payment due date required");
      return false;
    }
    return true;
  }

  function handleSubmit() {
    if (!isPlansValid()) {
      setActiveSubStep("plans");
      return;
    }

    // Warn if any band's semester_total changed by more than 10% vs what was
    // loaded from state (guards against accidental large changes).
    const origBands = state.tuitionRateBands ?? [];
    const hasBigChange = bands.some((b) => {
      if (!b.semester_total) return false;
      const orig = origBands.find(
        (ob) =>
          ob.division === b.division &&
          ob.weekly_class_count === b.weekly_class_count,
      );
      if (!orig?.semester_total) return false;
      const pctChange =
        Math.abs(b.semester_total - orig.semester_total) / orig.semester_total;
      return pctChange > 0.1;
    });
    if (hasBigChange) {
      const ok = window.confirm(
        "One or more tuition totals have changed by more than 10%. This will affect all future registrations for this semester. Continue?",
      );
      if (!ok) return;
    }

    dispatch({
      type: "SET_PAYMENT",
      payload: {
        type: form.type,
        depositAmount: form.type === "deposit_flat" && form.depositAmount ? Number(form.depositAmount) : undefined,
        depositPercent: form.type === "deposit_percent" && form.depositPercent ? Number(form.depositPercent) : undefined,
        dueDate: form.dueDate,
        installmentCount:
          form.type === "installments"
            ? Number(form.installmentCount)
            : undefined,
      },
    });

    dispatch({ type: "SET_TUITION_RATE_BANDS", payload: bands });
    dispatch({ type: "SET_FEE_CONFIG", payload: feeConfig });
    dispatch({ type: "SET_SPECIAL_PROGRAM_TUITION", payload: programs });

    // Merge per-class registration-fee-exempt selections back into the classes
    // array (meeting-plan #22). Only dispatch if the semester actually has
    // classes, to avoid clobbering an empty/undefined sessions object.
    if (state.sessions?.classes?.length) {
      dispatch({
        type: "SET_SESSIONS",
        payload: {
          ...state.sessions,
          classes: state.sessions.classes.map((c, i) => ({
            ...c,
            registrationFeeExempt: regFeeExemptIdxs.has(i),
          })),
        },
      });
    }

    onNext();
  }

  /* ------------------------------------------------------------------------ */
  /* Render                                                                    */
  /* ------------------------------------------------------------------------ */

  /* ---- Division badge styles (matches badge-* system: rgba at 18% opacity) ---- */
  function divisionBadgeStyle(division: string): React.CSSProperties {
    switch (division) {
      case "early_childhood": return { background: "rgba(125,206,194,0.18)", color: "#0A5A50" };
      case "junior":          return { background: "rgba(196,160,212,0.18)", color: "#5A2878" };
      case "senior":          return { background: "rgba(158,196,180,0.18)", color: "#20503A" };
      case "competition":     return { background: "rgba(232,184,176,0.18)", color: "#802818" };
      default:                return { background: "rgba(158,196,180,0.18)", color: "#20503A" };
    }
  }

  // Tuition rate bands and Special Programs both depend on standard rate-band
  // classes. If the semester contains only drop-in/tiered classes, both tabs
  // (and the Junior Division Fees panel) are hidden — they have nothing to
  // act on. Special Programs is a subset of the rate-band model.
  const semesterClasses = state.sessions?.classes ?? [];
  const hasStandardClass = semesterClasses.some(
    (c) =>
      c.offeringType !== "competition_track" &&
      !c.isTiered &&
      !(c.schedules ?? []).some((s) => s.isDropIn === true),
  );

  /* ------------------------------------------------------------------------ */
  /* Applicability — which seeded rows actually match the semester's classes  */
  /* ------------------------------------------------------------------------ */
  // A band (division, weekly_class_count) applies if some standard class has
  // that division AND meets that many days/week (counted from its first
  // schedule's daysOfWeek). A program applies if some class matches its
  // discipline (or, for Competition JR/SR, if any competition-track class
  // exists — JR/SR routing is a separate follow-up).
  // If no classes have been added yet, treat every row as applicable
  // (admin hasn't told us what to filter against — don't fade the whole table).
  const standardClasses = semesterClasses.filter(
    (c) =>
      c.offeringType !== "competition_track" &&
      !c.isTiered &&
      !(c.schedules ?? []).some((s) => s.isDropIn === true),
  );
  const applicableBandKeys = new Set<string>();
  for (const cls of standardClasses) {
    if (!cls.division) continue;
    const freq = (cls.schedules ?? []).reduce(
      (max, s) => Math.max(max, (s.daysOfWeek ?? []).length),
      0,
    );
    if (freq > 0) applicableBandKeys.add(`${cls.division}:${freq}`);
  }

  const disciplineToProgramKey: Record<string, string> = {
    technique: "technique",
    pre_pointe: "pre_pointe",
    pointe: "pointe",
    early_childhood: "early_childhood",
  };
  const hasCompetitionClass = semesterClasses.some(
    (c) => c.offeringType === "competition_track" || c.isCompetitionTrack,
  );
  const applicableProgramKeys = new Set<string>();
  if (hasCompetitionClass) {
    applicableProgramKeys.add("competition_junior");
    applicableProgramKeys.add("competition_senior");
  }
  for (const cls of semesterClasses) {
    const k = disciplineToProgramKey[cls.discipline];
    if (k) applicableProgramKeys.add(k);
  }

  const noClassesYet = semesterClasses.length === 0;
  const isBandApplicable = (b: DraftTuitionRateBand): boolean =>
    noClassesYet
      ? true
      : applicableBandKeys.has(`${b.division}:${b.weekly_class_count}`);
  const isProgramApplicable = (p: DraftSpecialProgramTuition): boolean =>
    noClassesYet ? true : applicableProgramKeys.has(p.programKey);

  // Per-row expansion: admin can click a collapsed row to reveal its inputs.
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  function toggleRowExpanded(clientKey: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(clientKey)) next.delete(clientKey);
      else next.add(clientKey);
      return next;
    });
  }
  const visibleSubSteps = hasStandardClass
    ? SUB_STEPS
    : SUB_STEPS.filter((s) => s.key !== "tuition" && s.key !== "programs");
  useEffect(() => {
    if (
      !hasStandardClass &&
      (activeSubStep === "tuition" || activeSubStep === "programs")
    ) {
      setActiveSubStep("plans");
    }
  }, [hasStandardClass, activeSubStep]);

  // Auto-seed established AYDT tuition rate bands when the Tuition Rates tab
  // is opened with zero rows (brand-new semester OR admin has cleared them).
  // Per product decision: re-seed on revisit if empty — treat empty as "not
  // configured yet," not as "intentionally none."
  useEffect(() => {
    if (
      activeSubStep === "tuition" &&
      hasStandardClass &&
      bands.length === 0
    ) {
      setBands(
        DEFAULT_TUITION_RATE_BANDS.map((b) => ({
          ...b,
          _clientKey: crypto.randomUUID(),
        })),
      );
    }
    // bands intentionally omitted: we only seed on tab change, not on every
    // band edit (otherwise deleting the last row would immediately re-seed).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubStep, hasStandardClass]);

  // Auto-seed ALL established Special Programs (EC, Technique, Pre-Pointe,
  // Pointe, Comp JR, Comp SR) when the Special Programs tab is opened with
  // zero rows. Mirrors the Tuition Rate Bands seed behavior — admin sees the
  // full known catalog pre-filled and can delete what doesn't apply. Re-seeds
  // on revisit if empty.
  useEffect(() => {
    if (
      activeSubStep === "programs" &&
      hasStandardClass &&
      programs.length === 0
    ) {
      setPrograms(
        DEFAULT_SPECIAL_PROGRAM_ORDER.map((key) => {
          const d = DEFAULT_SPECIAL_PROGRAM_BY_KEY[key];
          return {
            _clientKey: crypto.randomUUID(),
            programKey: key,
            programLabel: d.programLabel,
            semesterTotal: d.semesterTotal,
            autoPayInstallmentAmount: d.autoPayInstallmentAmount,
            autoPayInstallmentCount: d.autoPayInstallmentCount ?? 5,
            registrationFeeOverride: d.registrationFeeOverride,
          };
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubStep, hasStandardClass]);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h2
          className="text-xl font-semibold tracking-tight"
          style={{ color: "var(--admin-text)" }}
        >
          Payment &amp; pricing
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--admin-text-faint)" }}>
          Configure payment plans, tuition rates, special programs, and fee
          constants for this semester.
        </p>
      </div>

      {isLocked && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            background: "#FDF2F1",
            border: "1px solid #E6D5D1",
            color: "var(--admin-text-muted)",
          }}
        >
          This semester has active registrations. Payment settings are locked.
        </div>
      )}

      {/* Sub-step Tabs */}
      <div style={{ borderBottom: "0.5px solid var(--admin-border)" }}>
        <div className="flex gap-1 overflow-x-auto">
          {visibleSubSteps.map((s) => (
            <button
              key={s.key}
              onClick={() => setActiveSubStep(s.key)}
              className="px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors"
              style={{
                borderBottomColor:
                  activeSubStep === s.key
                    ? "var(--admin-sidebar-active)"
                    : "transparent",
                color:
                  activeSubStep === s.key
                    ? "var(--admin-sidebar-active)"
                    : "var(--admin-text-faint)",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Tab: Payment Plans                                                  */}
      {/* ------------------------------------------------------------------ */}
      {activeSubStep === "plans" && (
        <fieldset disabled={isLocked} className="space-y-5">
          <div
            className="rounded-xl p-5 space-y-4"
            style={{
              background: "var(--admin-surface)",
              border: "0.5px solid var(--admin-border)",
            }}
          >
            <p
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--admin-text-faint)" }}
            >
              Payment type
            </p>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  {
                    value: "pay_in_full",
                    label: "Pay in full",
                    desc: "Full payment at time of checkout",
                  },
                  {
                    value: "deposit_flat",
                    label: "Flat deposit",
                    desc: "Fixed deposit, balance due later",
                  },
                  {
                    value: "deposit_percent",
                    label: "Percent deposit",
                    desc: "% of total due upfront",
                  },
                  {
                    value: "installments",
                    label: "Installments",
                    desc: "Split into multiple payments",
                  },
                ] as const
              ).map((option) => {
                const active = form.type === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={isLocked}
                    onClick={() => updateField("type", option.value)}
                    className="relative text-left rounded-xl px-4 py-3 transition-all focus:outline-none disabled:opacity-50"
                    style={{
                      background: active ? "#FDF2F1" : "var(--admin-surface)",
                      border: active
                        ? "1.5px solid var(--admin-sidebar-active)"
                        : "0.5px solid var(--admin-border)",
                      boxShadow: active
                        ? "0 0 0 3px rgba(142,42,35,0.08)"
                        : "none",
                    }}
                  >
                    <span
                      className="absolute top-3 right-3 w-4 h-4 rounded-full border-2 flex items-center justify-center"
                      style={{
                        borderColor: active
                          ? "var(--admin-sidebar-active)"
                          : "var(--admin-border)",
                        background: active
                          ? "var(--admin-sidebar-active)"
                          : "transparent",
                      }}
                    >
                      {active && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </span>
                    <p
                      className="text-sm font-medium pr-6"
                      style={{
                        color: active
                          ? "var(--admin-sidebar-active)"
                          : "var(--admin-text)",
                      }}
                    >
                      {option.label}
                    </p>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: "var(--admin-text-faint)" }}
                    >
                      {option.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {(form.type === "deposit_flat" || form.type === "deposit_percent" || form.type === "installments") && (
            <div
              className="rounded-xl p-5"
              style={{
                background: "var(--admin-surface)",
                border: "0.5px solid var(--admin-border)",
              }}
            >
              <div className="grid grid-cols-2 gap-5">
                {form.type === "deposit_flat" && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="deposit-amount"
                      className="block text-sm font-medium"
                      style={{ color: "var(--admin-text)" }}
                    >
                      Deposit amount ($){" "}
                      <span style={{ color: "var(--admin-sidebar-active)" }}>*</span>
                    </label>
                    <input
                      id="deposit-amount"
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="0.00"
                      value={form.depositAmount}
                      onChange={(e) => updateField("depositAmount", e.target.value)}
                      className="admin-input"
                    />
                  </div>
                )}
                {form.type === "deposit_percent" && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="deposit-percent"
                      className="block text-sm font-medium"
                      style={{ color: "var(--admin-text)" }}
                    >
                      Deposit percent (%){" "}
                      <span style={{ color: "var(--admin-sidebar-active)" }}>*</span>
                    </label>
                    <input
                      id="deposit-percent"
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      placeholder="50"
                      value={form.depositPercent}
                      onChange={(e) => updateField("depositPercent", e.target.value)}
                      className="admin-input"
                    />
                  </div>
                )}
                {form.type === "installments" && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="installment-count"
                      className="block text-sm font-medium"
                      style={{ color: "var(--admin-text)" }}
                    >
                      Number of installments
                    </label>
                    <input
                      id="installment-count"
                      type="number"
                      min={1}
                      placeholder="3"
                      value={form.installmentCount}
                      onChange={(e) =>
                        updateField("installmentCount", e.target.value)
                      }
                      className="admin-input"
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <label
                    htmlFor="due-date"
                    className="block text-sm font-medium"
                    style={{ color: "var(--admin-text)" }}
                  >
                    {form.type === "deposit_flat" || form.type === "deposit_percent"
                      ? "Balance due date"
                      : "First payment due date"}
                  </label>
                  <InlineDatePicker
                    value={form.dueDate}
                    onChange={(v) => updateField("dueDate", v)}
                  />
                </div>
              </div>
            </div>
          )}
        </fieldset>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Tab: Tuition Rates                                                  */}
      {/* ------------------------------------------------------------------ */}
      {activeSubStep === "tuition" && hasStandardClass && (
        <div className="space-y-5">
          <div
            className="rounded-xl px-4 py-3 text-sm"
            style={{
              background: "#EEF2FF",
              border: "0.5px solid #C7D2FE",
              color: "#3730A3",
            }}
          >
            Division-based tuition using a progressive discount model. The base
            tuition applies to the first class; each additional class receives a
            progressively larger discount. Fill{" "}
            <strong>Semester Total</strong> and <strong>Auto-Pay /mo</strong>{" "}
            for admin reference and auto-fill in class setup.
          </div>

          {/* Existing bands */}
          {bands.length > 0 ? (
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: "0.5px solid var(--admin-border)" }}
            >
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr style={{ background: "var(--admin-table-header-bg)" }}>
                      {(["Division","Classes/Wk","Base Tuition","Discount %","Semester Total","Auto-Pay /mo","Notes"] as const).map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 text-left whitespace-nowrap"
                          style={{
                            fontSize: 10,
                            fontWeight: 500,
                            letterSpacing: "0.05em",
                            textTransform: "uppercase",
                            color: "var(--admin-table-header-text)",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                      {!isLocked && <th className="px-4 py-2.5" />}
                    </tr>
                  </thead>
                  <tbody>
                    {bands.map((band) => {
                      const applicable = isBandApplicable(band);
                      const expanded = expandedRows.has(band._clientKey);
                      if (!applicable && !expanded && !isLocked) {
                        const divLabel =
                          DIVISIONS.find((d) => d.value === band.division)?.label ??
                          band.division;
                        return (
                          <tr
                            key={band._clientKey}
                            style={{
                              borderBottom: "0.5px solid var(--admin-table-border)",
                              opacity: 0.55,
                              background: "var(--admin-surface-subtle, transparent)",
                            }}
                          >
                            <td colSpan={7} className="px-4 py-2 text-sm">
                              <div className="flex items-center gap-3">
                                <span
                                  className="badge"
                                  style={divisionBadgeStyle(band.division)}
                                >
                                  {divLabel}
                                </span>
                                <span style={{ color: "var(--admin-text)" }}>
                                  {band.weekly_class_count}×/week
                                </span>
                                <span
                                  className="badge"
                                  style={{
                                    background: "rgba(158,152,144,0.15)",
                                    color: "var(--admin-text-faint)",
                                    fontSize: 10,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.05em",
                                  }}
                                  title="No class in this semester matches this division + frequency"
                                >
                                  Not used in this semester
                                </span>
                                <button
                                  type="button"
                                  onClick={() => toggleRowExpanded(band._clientKey)}
                                  className="text-xs underline"
                                  style={{ color: "var(--admin-text-faint)" }}
                                >
                                  Edit
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-sm">
                              <button
                                onClick={() => removeBand(band._clientKey)}
                                className="text-xs transition-colors hover:text-red-600"
                                style={{ color: "var(--admin-text-faint)" }}
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        );
                      }
                      return (
                      <tr
                        key={band._clientKey}
                        className="hover:bg-[#EDE9E4] transition-colors"
                        style={{ borderBottom: "0.5px solid var(--admin-table-border)" }}
                      >
                        {/* Division */}
                        <td className="px-4 py-2.5 text-sm" style={{ color: "var(--admin-text)" }}>
                          {isLocked ? (
                            <span
                              className="badge"
                              style={divisionBadgeStyle(band.division)}
                            >
                              {DIVISIONS.find((d) => d.value === band.division)?.label ?? band.division}
                            </span>
                          ) : (
                            <select
                              value={band.division}
                              onChange={(e) =>
                                updateBand(band._clientKey, "division", e.target.value)
                              }
                              className="badge cursor-pointer outline-none border-0"
                              style={{
                                ...divisionBadgeStyle(band.division),
                                appearance: "none",
                                paddingRight: "1.25rem",
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 16 16' fill='none' stroke='%239E9890' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='4 6 8 10 12 6'/%3E%3C/svg%3E")`,
                                backgroundRepeat: "no-repeat",
                                backgroundPosition: "right 4px center",
                              }}
                            >
                              {DIVISIONS.map((d) => (
                                <option key={d.value} value={d.value}>
                                  {d.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        {/* Classes/Wk */}
                        <td className="px-4 py-2.5 text-sm" style={{ color: "var(--admin-text)" }}>
                          {isLocked ? (
                            band.weekly_class_count
                          ) : (
                            <input
                              type="number"
                              min={1}
                              value={band.weekly_class_count || ""}
                              onChange={(e) =>
                                updateBand(band._clientKey, "weekly_class_count", Number(e.target.value))
                              }
                              className="admin-input !w-14 !py-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          )}
                        </td>
                        {/* Base Tuition */}
                        <td className="px-4 py-2.5 text-sm" style={{ color: "var(--admin-text)" }}>
                          {isLocked ? (
                            `$${band.base_tuition.toFixed(2)}`
                          ) : (
                            <div className="relative">
                              <span
                                className="absolute left-2 top-1/2 -translate-y-1/2 text-xs pointer-events-none"
                                style={{ color: "var(--admin-text-faint)" }}
                              >
                                $
                              </span>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={band.base_tuition || ""}
                                onChange={(e) =>
                                  updateBand(band._clientKey, "base_tuition", Number(e.target.value))
                                }
                                className="admin-input !w-24 !pl-5 !py-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </div>
                          )}
                        </td>
                        {/* Discount % */}
                        <td className="px-4 py-2.5 text-sm" style={{ color: "var(--admin-text)" }}>
                          {isLocked ? (
                            `${band.progressive_discount_percent}%`
                          ) : (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={0.01}
                                value={band.progressive_discount_percent}
                                onChange={(e) =>
                                  updateBand(band._clientKey, "progressive_discount_percent", Number(e.target.value))
                                }
                                className="admin-input !w-16 !py-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <span className="text-xs" style={{ color: "var(--admin-text-faint)" }}>%</span>
                            </div>
                          )}
                        </td>
                        {/* Semester Total */}
                        <td className="px-4 py-2.5 text-sm" style={{ color: "var(--admin-text)" }}>
                          {isLocked ? (
                            band.semester_total != null ? `$${band.semester_total.toFixed(2)}` : "—"
                          ) : (
                            <div className="relative">
                              <span
                                className="absolute left-2 top-1/2 -translate-y-1/2 text-xs pointer-events-none"
                                style={{ color: "var(--admin-text-faint)" }}
                              >
                                $
                              </span>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                placeholder="0.00"
                                value={band.semester_total ?? ""}
                                onChange={(e) =>
                                  updateBand(
                                    band._clientKey,
                                    "semester_total",
                                    e.target.value ? Number(e.target.value) : undefined,
                                  )
                                }
                                className="admin-input !w-24 !pl-5 !py-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </div>
                          )}
                        </td>
                        {/* Auto-Pay /mo */}
                        <td className="px-4 py-2.5 text-sm" style={{ color: "var(--admin-text)" }}>
                          {isLocked ? (
                            band.autopay_installment_amount != null
                              ? `$${band.autopay_installment_amount.toFixed(2)}`
                              : "—"
                          ) : (
                            <div className="space-y-0.5">
                              <div className="relative">
                                <span
                                  className="absolute left-2 top-1/2 -translate-y-1/2 text-xs pointer-events-none"
                                  style={{ color: "var(--admin-text-faint)" }}
                                >
                                  $
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  placeholder="0.00"
                                  value={band.autopay_installment_amount ?? ""}
                                  onChange={(e) =>
                                    updateBand(
                                      band._clientKey,
                                      "autopay_installment_amount",
                                      e.target.value ? Number(e.target.value) : undefined,
                                    )
                                  }
                                  className="admin-input !w-24 !pl-5 !py-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                              </div>
                              {band.autopay_installment_amount && band.semester_total ? (
                                <p
                                  className="text-xs pl-1"
                                  style={{ color: "var(--admin-text-faint)" }}
                                >
                                  5× = ${(band.autopay_installment_amount * 5).toFixed(2)}
                                </p>
                              ) : null}
                            </div>
                          )}
                        </td>
                        {/* Notes */}
                        <td className="px-4 py-2.5 text-sm" style={{ color: "var(--admin-text)" }}>
                          {isLocked ? (
                            band.notes ?? "—"
                          ) : (
                            <input
                              type="text"
                              placeholder="Optional"
                              value={band.notes ?? ""}
                              onChange={(e) =>
                                updateBand(band._clientKey, "notes", e.target.value)
                              }
                              className="admin-input !w-32 !py-1"
                            />
                          )}
                        </td>
                        {!isLocked && (
                          <td className="px-4 py-2.5 text-sm">
                            <button
                              onClick={() => removeBand(band._clientKey)}
                              className="text-xs transition-colors hover:text-red-600"
                              style={{ color: "var(--admin-text-faint)" }}
                            >
                              ×
                            </button>
                          </td>
                        )}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            ) : (
              <div
                className="rounded-xl p-6 text-center"
                style={{
                  border: "1px dashed var(--admin-border)",
                }}
              >
                <p className="text-sm" style={{ color: "var(--admin-text-faint)" }}>
                  No rate bands configured yet. Add rows below.
                </p>
              </div>
            )}

            {/* Add new band row */}
            {!isLocked && (
              <div
                className="rounded-xl p-5 space-y-4"
                style={{
                  background: "var(--admin-surface)",
                  border: "0.5px solid var(--admin-border)",
                }}
              >
                <p
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--admin-text-faint)" }}
                >
                  Add Rate Band
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <label
                      className="text-xs font-medium"
                      style={{ color: "var(--admin-text-muted)" }}
                    >
                      Division
                    </label>
                    <select
                      value={newBand.division}
                      onChange={(e) =>
                        setNewBand((prev) => ({
                          ...prev,
                          division: e.target.value as DraftTuitionRateBand["division"],
                        }))
                      }
                      className="admin-select"
                    >
                      {DIVISIONS.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label
                      className="text-xs font-medium"
                      style={{ color: "var(--admin-text-muted)" }}
                    >
                      Classes/week
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={newBand.weekly_class_count}
                      onChange={(e) =>
                        setNewBand((prev) => ({
                          ...prev,
                          weekly_class_count: Number(e.target.value),
                        }))
                      }
                      className="admin-input"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      className="text-xs font-medium"
                      style={{ color: "var(--admin-text-muted)" }}
                    >
                      Base tuition ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="0.00"
                      value={newBand.base_tuition || ""}
                      onChange={(e) =>
                        setNewBand((prev) => ({
                          ...prev,
                          base_tuition: Number(e.target.value),
                        }))
                      }
                      className="admin-input"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      className="text-xs font-medium"
                      style={{ color: "var(--admin-text-muted)" }}
                    >
                      Discount %
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      placeholder="0"
                      value={newBand.progressive_discount_percent || ""}
                      onChange={(e) =>
                        setNewBand((prev) => ({
                          ...prev,
                          progressive_discount_percent: Number(e.target.value),
                        }))
                      }
                      className="admin-input"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      className="text-xs font-medium"
                      style={{ color: "var(--admin-text-muted)" }}
                    >
                      Semester total ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="0.00"
                      value={newBand.semester_total ?? ""}
                      onChange={(e) =>
                        setNewBand((prev) => ({
                          ...prev,
                          semester_total: e.target.value ? Number(e.target.value) : undefined,
                        }))
                      }
                      className="admin-input"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      className="text-xs font-medium"
                      style={{ color: "var(--admin-text-muted)" }}
                    >
                      Auto-pay /mo ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="0.00"
                      value={newBand.autopay_installment_amount ?? ""}
                      onChange={(e) =>
                        setNewBand((prev) => ({
                          ...prev,
                          autopay_installment_amount: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        }))
                      }
                      className="admin-input"
                    />
                    {newBand.autopay_installment_amount && (
                      <p
                        className="text-xs"
                        style={{ color: "var(--admin-text-faint)" }}
                      >
                        5× = ${(newBand.autopay_installment_amount * 5).toFixed(2)}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <label
                      className="text-xs font-medium"
                      style={{ color: "var(--admin-text-muted)" }}
                    >
                      Notes (optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. includes costume deposit"
                      value={newBand.notes ?? ""}
                      onChange={(e) =>
                        setNewBand((prev) => ({ ...prev, notes: e.target.value }))
                      }
                      className="admin-input"
                    />
                  </div>
                </div>
                <button onClick={addBand} className="admin-btn-primary admin-btn-sm">
                  + Add row
                </button>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Tab: Special Programs                                               */}
        {/* ------------------------------------------------------------------ */}
        {activeSubStep === "programs" && hasStandardClass && (
          <div className="space-y-5">
            <div
              className="rounded-xl px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
              style={{
                background: "#EEF2FF",
                border: "0.5px solid #C7D2FE",
                color: "#3730A3",
              }}
            >
              <span>
                Fixed-tuition programs that bypass division-based progressive
                discount calculations. Amounts are used exactly as entered —
                no additional discounts apply.
              </span>
              {!isLocked && (
                <button
                  type="button"
                  onClick={autoPopulatePrograms}
                  className="shrink-0 admin-btn-secondary admin-btn-sm"
                >
                  Auto-populate from classes
                </button>
              )}
            </div>
            {autoPopulateMsg && (
              <p
                className="text-xs"
                style={{ color: "var(--admin-sidebar-active)" }}
              >
                {autoPopulateMsg}
              </p>
            )}

            {programs.length > 0 ? (
              <div
                className="rounded-xl overflow-hidden"
                style={{ border: "0.5px solid var(--admin-border)" }}
              >
                <div className="overflow-x-auto">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Program</th>
                        <th>Semester total ($)</th>
                        <th>Auto-pay /mo</th>
                        <th>Installments</th>
                        <th>Reg. fee override</th>
                        <th>Notes</th>
                        {!isLocked && <th />}
                      </tr>
                    </thead>
                    <tbody>
                      {programs.map((prog) => {
                        const applicable = isProgramApplicable(prog);
                        const expanded = expandedRows.has(prog._clientKey);
                        if (!applicable && !expanded && !isLocked) {
                          return (
                            <tr
                              key={prog._clientKey}
                              style={{
                                opacity: 0.55,
                                background: "var(--admin-surface-subtle, transparent)",
                              }}
                            >
                              <td colSpan={6} className="px-4 py-2 text-sm">
                                <div className="flex items-center gap-3">
                                  <span style={{ color: "var(--admin-text)" }}>
                                    {prog.programLabel}
                                  </span>
                                  <span
                                    className="badge"
                                    style={{
                                      background: "rgba(158,152,144,0.15)",
                                      color: "var(--admin-text-faint)",
                                      fontSize: 10,
                                      textTransform: "uppercase",
                                      letterSpacing: "0.05em",
                                    }}
                                    title="No class in this semester matches this program"
                                  >
                                    Not used in this semester
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => toggleRowExpanded(prog._clientKey)}
                                    className="text-xs underline"
                                    style={{ color: "var(--admin-text-faint)" }}
                                  >
                                    Edit
                                  </button>
                                </div>
                              </td>
                              <td className="px-4 py-2 text-sm">
                                <button
                                  onClick={() => removeProgram(prog._clientKey)}
                                  className="text-xs transition-colors"
                                  style={{ color: "var(--admin-text-faint)" }}
                                  onMouseEnter={(e) =>
                                    ((e.target as HTMLElement).style.color = "#DC2626")
                                  }
                                  onMouseLeave={(e) =>
                                    ((e.target as HTMLElement).style.color =
                                      "var(--admin-text-faint)")
                                  }
                                >
                                  ×
                                </button>
                              </td>
                            </tr>
                          );
                        }
                        return (
                        <tr key={prog._clientKey}>
                          <td>
                            {isLocked ? (
                              <span>{prog.programLabel}</span>
                            ) : (
                              <select
                                value={prog.programKey}
                                onChange={(e) => {
                                  const selected = SPECIAL_PROGRAM_KEYS.find(
                                    (k) => k.value === e.target.value,
                                  );
                                  updateProgram(prog._clientKey, {
                                    programKey: e.target.value,
                                    programLabel: selected?.label ?? e.target.value,
                                  });
                                }}
                                className="admin-select !py-1"
                              >
                                {SPECIAL_PROGRAM_KEYS.map((k) => (
                                  <option key={k.value} value={k.value}>
                                    {k.label}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td>
                            {isLocked ? (
                              `$${prog.semesterTotal.toFixed(2)}`
                            ) : (
                              <div className="relative">
                                <span
                                  className="absolute left-2 top-1/2 -translate-y-1/2 text-xs pointer-events-none"
                                  style={{ color: "var(--admin-text-faint)" }}
                                >
                                  $
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={prog.semesterTotal}
                                  onChange={(e) =>
                                    updateProgram(prog._clientKey, {
                                      semesterTotal: Number(e.target.value),
                                    })
                                  }
                                  className="admin-input !w-28 !pl-5 !py-1"
                                />
                              </div>
                            )}
                          </td>
                          <td>
                            {isLocked ? (
                              prog.autoPayInstallmentAmount != null
                                ? `$${prog.autoPayInstallmentAmount.toFixed(2)}`
                                : "N/A"
                            ) : (
                              <div className="space-y-0.5">
                                <div className="relative">
                                  <span
                                    className="absolute left-2 top-1/2 -translate-y-1/2 text-xs pointer-events-none"
                                    style={{ color: "var(--admin-text-faint)" }}
                                  >
                                    $
                                  </span>
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    placeholder="N/A"
                                    value={prog.autoPayInstallmentAmount ?? ""}
                                    onChange={(e) =>
                                      updateProgram(prog._clientKey, {
                                        autoPayInstallmentAmount: e.target.value
                                          ? Number(e.target.value)
                                          : null,
                                      })
                                    }
                                    className="admin-input !w-24 !pl-5 !py-1"
                                  />
                                </div>
                                {prog.autoPayInstallmentAmount &&
                                prog.autoPayInstallmentCount ? (
                                  <p
                                    className="text-xs pl-1"
                                    style={{ color: "var(--admin-text-faint)" }}
                                  >
                                    {prog.autoPayInstallmentCount}× = $
                                    {(
                                      prog.autoPayInstallmentAmount *
                                      prog.autoPayInstallmentCount
                                    ).toFixed(2)}
                                  </p>
                                ) : null}
                              </div>
                            )}
                          </td>
                          <td>
                            {isLocked ? (
                              prog.autoPayInstallmentCount ?? "N/A"
                            ) : (
                              <input
                                type="number"
                                min={1}
                                placeholder="5"
                                value={prog.autoPayInstallmentCount ?? ""}
                                onChange={(e) =>
                                  updateProgram(prog._clientKey, {
                                    autoPayInstallmentCount: e.target.value
                                      ? Number(e.target.value)
                                      : null,
                                  })
                                }
                                className="admin-input !w-16 !py-1"
                              />
                            )}
                          </td>
                          <td>
                            {isLocked ? (
                              prog.registrationFeeOverride != null
                                ? prog.registrationFeeOverride === 0
                                  ? "Exempt ($0)"
                                  : `$${prog.registrationFeeOverride.toFixed(2)}`
                                : "Global"
                            ) : (
                              <div className="space-y-0.5">
                                <div className="relative">
                                  <span
                                    className="absolute left-2 top-1/2 -translate-y-1/2 text-xs pointer-events-none"
                                    style={{ color: "var(--admin-text-faint)" }}
                                  >
                                    $
                                  </span>
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    placeholder="Global"
                                    value={prog.registrationFeeOverride ?? ""}
                                    onChange={(e) =>
                                      updateProgram(prog._clientKey, {
                                        registrationFeeOverride:
                                          e.target.value !== ""
                                            ? Number(e.target.value)
                                            : null,
                                      })
                                    }
                                    className="admin-input !w-24 !pl-5 !py-1"
                                  />
                                </div>
                                <p
                                  className="text-xs pl-1"
                                  style={{ color: "var(--admin-text-faint)" }}
                                >
                                  0 = exempt; blank = global
                                </p>
                              </div>
                            )}
                          </td>
                          <td>
                            {isLocked ? (
                              prog.notes ?? "—"
                            ) : (
                              <input
                                type="text"
                                placeholder="Optional"
                                value={prog.notes ?? ""}
                                onChange={(e) =>
                                  updateProgram(prog._clientKey, {
                                    notes: e.target.value,
                                  })
                                }
                                className="admin-input !w-36 !py-1"
                              />
                            )}
                          </td>
                          {!isLocked && (
                            <td>
                              <button
                                onClick={() => removeProgram(prog._clientKey)}
                                className="text-xs transition-colors"
                                style={{ color: "var(--admin-text-faint)" }}
                                onMouseEnter={(e) =>
                                  ((e.target as HTMLElement).style.color = "#DC2626")
                                }
                                onMouseLeave={(e) =>
                                  ((e.target as HTMLElement).style.color =
                                    "var(--admin-text-faint)")
                                }
                              >
                                ×
                              </button>
                            </td>
                          )}
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div
                className="rounded-xl p-6 text-center"
                style={{ border: "1px dashed var(--admin-border)" }}
              >
                <p className="text-sm" style={{ color: "var(--admin-text-faint)" }}>
                  No special program rates configured yet. Add programs below.
                </p>
              </div>
            )}

            {/* Add new program */}
            {!isLocked && (
              <div
                className="rounded-xl p-5 space-y-4"
                style={{
                  background: "var(--admin-surface)",
                  border: "0.5px solid var(--admin-border)",
                }}
              >
                <p
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--admin-text-faint)" }}
                >
                  Add Special Program
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label
                      className="text-xs font-medium"
                      style={{ color: "var(--admin-text-muted)" }}
                    >
                      Program
                    </label>
                    <select
                      value={newProgram.programKey}
                      onChange={(e) => {
                        const selected = SPECIAL_PROGRAM_KEYS.find(
                          (k) => k.value === e.target.value,
                        );
                        setNewProgram((prev) => ({
                          ...prev,
                          programKey: e.target.value,
                          programLabel: selected?.label ?? e.target.value,
                        }));
                      }}
                      className="admin-select"
                    >
                      {SPECIAL_PROGRAM_KEYS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label
                      className="text-xs font-medium"
                      style={{ color: "var(--admin-text-muted)" }}
                    >
                      Semester total ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="0.00"
                      value={newProgram.semesterTotal || ""}
                      onChange={(e) =>
                        setNewProgram((prev) => ({
                          ...prev,
                          semesterTotal: Number(e.target.value),
                        }))
                      }
                      className="admin-input"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      className="text-xs font-medium"
                      style={{ color: "var(--admin-text-muted)" }}
                    >
                      Auto-pay /mo ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="N/A"
                      value={newProgram.autoPayInstallmentAmount ?? ""}
                      onChange={(e) =>
                        setNewProgram((prev) => ({
                          ...prev,
                          autoPayInstallmentAmount: e.target.value
                            ? Number(e.target.value)
                            : null,
                        }))
                      }
                      className="admin-input"
                    />
                    {newProgram.autoPayInstallmentAmount &&
                    newProgram.autoPayInstallmentCount ? (
                      <p
                        className="text-xs"
                        style={{ color: "var(--admin-text-faint)" }}
                      >
                        {newProgram.autoPayInstallmentCount}× = $
                        {(
                          newProgram.autoPayInstallmentAmount *
                          newProgram.autoPayInstallmentCount
                        ).toFixed(2)}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <label
                      className="text-xs font-medium"
                      style={{ color: "var(--admin-text-muted)" }}
                    >
                      Installments
                    </label>
                    <input
                      type="number"
                      min={1}
                      placeholder="5"
                      value={newProgram.autoPayInstallmentCount ?? ""}
                      onChange={(e) =>
                        setNewProgram((prev) => ({
                          ...prev,
                          autoPayInstallmentCount: e.target.value
                            ? Number(e.target.value)
                            : null,
                        }))
                      }
                      className="admin-input"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-3">
                    <label
                      className="text-xs font-medium"
                      style={{ color: "var(--admin-text-muted)" }}
                    >
                      Notes (optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 9-class session, no recital"
                      value={newProgram.notes ?? ""}
                      onChange={(e) =>
                        setNewProgram((prev) => ({ ...prev, notes: e.target.value }))
                      }
                      className="admin-input"
                    />
                  </div>
                </div>
                <button onClick={addProgram} className="admin-btn-primary admin-btn-sm">
                  + Add program
                </button>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Tab: Fee Config                                                      */}
        {/* ------------------------------------------------------------------ */}
        {activeSubStep === "fees" && (
          <fieldset disabled={isLocked} className="space-y-4">
            {/* Core Fees */}
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: "0.5px solid var(--admin-border)" }}
            >
              <div
                className="px-5 py-3"
                style={{
                  background: "var(--admin-surface-sub)",
                  borderBottom: "0.5px solid var(--admin-border)",
                }}
              >
                <p
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--admin-text-faint)" }}
                >
                  Core Fees
                </p>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label
                    className="block text-sm font-medium"
                    style={{ color: "var(--admin-text)" }}
                  >
                    Registration fee per child ($)
                  </label>
                  <div className="relative">
                    <span
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none"
                      style={{ color: "var(--admin-text-faint)" }}
                    >
                      $
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={feeConfig.registration_fee_per_child || ""}
                      onChange={(e) =>
                        updateFeeConfig(
                          "registration_fee_per_child",
                          Number(e.target.value),
                        )
                      }
                      disabled={isLocked}
                      className="admin-input !pl-7"
                    />
                  </div>
                  <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
                    One-time fee per dancer per semester (default $40).
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label
                    className="block text-sm font-medium"
                    style={{ color: "var(--admin-text)" }}
                  >
                    Family discount — once per family ($)
                  </label>
                  <div className="relative">
                    <span
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none"
                      style={{ color: "var(--admin-text-faint)" }}
                    >
                      $
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={feeConfig.family_discount_amount || ""}
                      onChange={(e) =>
                        updateFeeConfig(
                          "family_discount_amount",
                          Number(e.target.value),
                        )
                      }
                      disabled={isLocked}
                      className="admin-input !pl-7"
                    />
                  </div>
                  <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
                    Flat discount applied once per family per semester (default $50).
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label
                    className="block text-sm font-medium"
                    style={{ color: "var(--admin-text)" }}
                  >
                    Auto-pay admin fee per month ($)
                  </label>
                  <div className="relative">
                    <span
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none"
                      style={{ color: "var(--admin-text-faint)" }}
                    >
                      $
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={feeConfig.auto_pay_admin_fee_monthly || ""}
                      onChange={(e) =>
                        updateFeeConfig(
                          "auto_pay_admin_fee_monthly",
                          Number(e.target.value),
                        )
                      }
                      disabled={isLocked}
                      className="admin-input !pl-7"
                    />
                  </div>
                  <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
                    Added per installment for auto-pay plans (default $5/month).
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label
                    className="block text-sm font-medium"
                    style={{ color: "var(--admin-text)" }}
                  >
                    Auto-pay installment count
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={feeConfig.auto_pay_installment_count || ""}
                    onChange={(e) =>
                      updateFeeConfig(
                        "auto_pay_installment_count",
                        Number(e.target.value),
                      )
                    }
                    disabled={isLocked}
                    className="admin-input"
                  />
                  <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
                    Number of monthly payments for auto-pay plan (default 5).
                  </p>
                </div>
              </div>

              {/* Fee-exempt class types */}
              <div
                className="px-5 py-3"
                style={{
                  background: "var(--admin-surface-sub)",
                  borderTop: "0.5px solid var(--admin-border)",
                  borderBottom: "0.5px solid var(--admin-border)",
                }}
              >
                <p
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--admin-text-faint)" }}
                >
                  Fee-exempt class types
                </p>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: "var(--admin-text-faint)" }}
                >
                  Classes with these disciplines are exempt from costume fees and the registration fee.
                </p>
              </div>
              <div className="p-5 flex flex-wrap gap-2">
                {EXEMPT_KEY_OPTIONS.map((opt) => {
                  const checked = (feeConfig.costume_fee_exempt_keys ?? []).includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={isLocked}
                      onClick={() => {
                        const current = feeConfig.costume_fee_exempt_keys ?? [];
                        const next = checked
                          ? current.filter((k) => k !== opt.value)
                          : [...current, opt.value];
                        updateFeeConfig("costume_fee_exempt_keys", next);
                      }}
                      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-all disabled:opacity-50"
                      style={{
                        background: checked ? "#FDF2F1" : "var(--admin-surface-sub)",
                        border: checked
                          ? "1.5px solid var(--admin-sidebar-active)"
                          : "1px solid var(--admin-border)",
                        color: checked
                          ? "var(--admin-sidebar-active)"
                          : "var(--admin-text-muted)",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {/* Registration-fee-exempt classes (meeting-plan #22) */}
              <div
                className="px-5 py-3"
                style={{
                  background: "var(--admin-surface-sub)",
                  borderTop: "0.5px solid var(--admin-border)",
                  borderBottom: "0.5px solid var(--admin-border)",
                }}
              >
                <p
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--admin-text-faint)" }}
                >
                  Registration-fee-exempt classes
                </p>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: "var(--admin-text-faint)" }}
                >
                  Turn off the registration fee for a specific offering (a runoff,
                  movie night, Art in Motion, etc.). Costume and video fees are
                  unaffected.
                </p>
              </div>
              <div className="p-5">
                {semesterClasses.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
                    No classes added yet. Add classes in the Sessions step to choose
                    exemptions here.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {semesterClasses.map((cls, i) => {
                      const checked = regFeeExemptIdxs.has(i);
                      return (
                        <button
                          key={cls.id ?? `idx-${i}`}
                          type="button"
                          disabled={isLocked}
                          onClick={() => toggleRegFeeExempt(i)}
                          className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-all disabled:opacity-50"
                          style={{
                            background: checked ? "#FDF2F1" : "var(--admin-surface-sub)",
                            border: checked
                              ? "1.5px solid var(--admin-sidebar-active)"
                              : "1px solid var(--admin-border)",
                            color: checked
                              ? "var(--admin-sidebar-active)"
                              : "var(--admin-text-muted)",
                          }}
                        >
                          {cls.displayName || cls.name || "Untitled class"}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Junior Division Fees — only meaningful when the semester
                actually has standard rate-band classes. */}
            {hasStandardClass && (
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: "0.5px solid var(--admin-border)" }}
            >
              <div
                className="px-5 py-3"
                style={{
                  background: "var(--admin-surface-sub)",
                  borderBottom: "0.5px solid var(--admin-border)",
                }}
              >
                <p
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--admin-text-faint)" }}
                >
                  Junior Division Fees
                </p>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: "var(--admin-text-faint)" }}
                >
                  Applied to standard junior classes (non-exempt types above).
                </p>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label
                    className="block text-sm font-medium"
                    style={{ color: "var(--admin-text)" }}
                  >
                    Recital costume fee per class ($)
                  </label>
                  <div className="relative">
                    <span
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none"
                      style={{ color: "var(--admin-text-faint)" }}
                    >
                      $
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={feeConfig.junior_costume_fee_per_class}
                      onChange={(e) =>
                        updateFeeConfig(
                          "junior_costume_fee_per_class",
                          Number(e.target.value),
                        )
                      }
                      disabled={isLocked}
                      className="admin-input !pl-7"
                    />
                  </div>
                  <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
                    Per-class costume fee for junior dancers; multiplied by
                    weekly class count (default $55).
                  </p>
                </div>
              </div>
            </div>
            )}

            {/* Senior Division Fees */}
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: "0.5px solid var(--admin-border)" }}
            >
              <div
                className="px-5 py-3"
                style={{
                  background: "var(--admin-surface-sub)",
                  borderBottom: "0.5px solid var(--admin-border)",
                }}
              >
                <p
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--admin-text-faint)" }}
                >
                  Senior Division Fees
                </p>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: "var(--admin-text-faint)" }}
                >
                  Applied to standard senior classes (non-exempt types above).
                </p>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label
                    className="block text-sm font-medium"
                    style={{ color: "var(--admin-text)" }}
                  >
                    Video fee per senior registrant ($)
                  </label>
                  <div className="relative">
                    <span
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none"
                      style={{ color: "var(--admin-text-faint)" }}
                    >
                      $
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={feeConfig.senior_video_fee_per_registrant}
                      onChange={(e) =>
                        updateFeeConfig(
                          "senior_video_fee_per_registrant",
                          Number(e.target.value),
                        )
                      }
                      disabled={isLocked}
                      className="admin-input !pl-7"
                    />
                  </div>
                  <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
                    Flat fee charged once per senior dancer per semester (default $15).
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label
                    className="block text-sm font-medium"
                    style={{ color: "var(--admin-text)" }}
                  >
                    Recital costume fee per class ($)
                  </label>
                  <div className="relative">
                    <span
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none"
                      style={{ color: "var(--admin-text-faint)" }}
                    >
                      $
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={feeConfig.senior_costume_fee_per_class}
                      onChange={(e) =>
                        updateFeeConfig(
                          "senior_costume_fee_per_class",
                          Number(e.target.value),
                        )
                      }
                      disabled={isLocked}
                      className="admin-input !pl-7"
                    />
                  </div>
                  <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
                    Per-class costume fee for senior dancers; multiplied by weekly
                    class count (default $65).
                  </p>
                </div>
              </div>
            </div>
          </fieldset>
        )}

        {/* Navigation */}
        <div
          className="flex justify-between pt-5"
          style={{ borderTop: "0.5px solid var(--admin-border)" }}
        >
          <button onClick={onBack} className="admin-btn-outline">
            ← Back
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="admin-btn-primary inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {isSaving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Saving…
              </>
            ) : (
              "Next →"
            )}
          </button>
        </div>
    </div>
  );
}
