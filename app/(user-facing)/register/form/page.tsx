"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import {
  RegistrationProvider,
  useRegistration,
} from "@/app/providers/RegistrationProvider";
import { useAuth } from "@/app/providers/AuthProvider";
import { CartRestoreGuard } from "../CartRestoreGuard";
import { getSemesterForDisplay } from "@/app/actions/getSemesterForDisplay";
import { buildDynamicFormSchema } from "@/lib/schemas/registration";
import { createClient } from "@/utils/supabase/client";
import { formatPhone } from "@/utils/formatPhone";
import AddressBlockField from "@/app/components/semester-flow/AddressBlockField";
import { EMPTY_ADDRESS } from "@/lib/address";
import {
  isAcknowledged,
  makeAcknowledgment,
  DEFAULT_ACKNOWLEDGMENT_LABEL,
} from "@/lib/waiver";
import type { FamilyContact, RegistrationFormElement, ProfileFieldKey } from "@/types";
import type { PublicSemester } from "@/types/public";
import { saveReferralSource } from "../actions/saveReferralSource";

const REFERRAL_OPTIONS = [
  "Word of mouth (friend or family)",
  "Social media (Instagram, Facebook, TikTok)",
  "Online search (Google, etc.)",
  "Flyer or printed ad",
  "School or community center",
  "Returning student / family",
  "Other",
];

/* -------------------------------------------------------------------------- */
/* Field renderer — portal design system                                       */
/* -------------------------------------------------------------------------- */

function renderField(
  el: RegistrationFormElement,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: any,
  mode: "live" | "preview" = "live",
) {
  if (el.type === "subheader") {
    return (
      <div key={el.id} style={{ paddingTop: 8 }}>
        <div style={{
          fontFamily: "var(--pub-font-secondary)",
          fontSize: 15, fontWeight: 700,
          color: "var(--pub-text-primary)",
          marginBottom: el.subtitle ? 3 : 0,
        }}>
          {el.label}
        </div>
        {el.subtitle && (
          <div style={{ fontSize: 12, color: "var(--pub-text-muted)", lineHeight: 1.5 }}>
            {el.subtitle}
          </div>
        )}
      </div>
    );
  }

  if (el.type === "text_block") {
    if (el.htmlContent) {
      return (
        <div
          key={el.id}
          style={{ fontSize: 13, color: "var(--pub-text-muted)", lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: el.htmlContent }}
        />
      );
    }
    return (
      <p key={el.id} style={{ fontSize: 13, color: "var(--pub-text-muted)", lineHeight: 1.6 }}>
        {el.label}
      </p>
    );
  }

  // type === "question"
  const error = errors[el.id]?.message as string | undefined;

  return (
    <div key={el.id} className="reg-field">
      <label className="reg-label">
        {el.label}
        {el.required && <span style={{ color: "var(--wine)", marginLeft: 3 }}>*</span>}
      </label>

      {el.instructionalText && (
        <span className="reg-hint">{el.instructionalText}</span>
      )}

      {el.inputType === "short_answer" && (
        <input {...register(el.id)} className="reg-input" />
      )}

      {el.inputType === "long_answer" && (
        <textarea
          {...register(el.id)}
          rows={4}
          className="reg-input"
          style={{ resize: "none", height: "auto" }}
        />
      )}

      {el.inputType === "select" && (
        <select {...register(el.id)} className="reg-input">
          <option value="">— Select —</option>
          {el.options?.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )}

      {el.inputType === "checkbox" && (
        <Controller
          name={el.id}
          control={control}
          defaultValue={[]}
          render={({ field }) => (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 2 }}>
              {el.options?.map((opt) => (
                <label
                  key={opt}
                  style={{
                    display: "flex", alignItems: "center", gap: 9,
                    cursor: "pointer", fontSize: 13, color: "var(--pub-text-primary)",
                  }}
                >
                  <input
                    type="checkbox"
                    value={opt}
                    checked={(field.value as string[]).includes(opt)}
                    onChange={(e) => {
                      const current = field.value as string[];
                      field.onChange(
                        e.target.checked
                          ? [...current, opt]
                          : current.filter((v) => v !== opt),
                      );
                    }}
                    style={{ accentColor: "var(--plum)", width: 15, height: 15, cursor: "pointer" }}
                  />
                  {opt}
                </label>
              ))}
            </div>
          )}
        />
      )}

      {el.inputType === "date" && (
        <input type="date" {...register(el.id)} className="reg-input" />
      )}

      {el.inputType === "address" && (
        <>
          {/* #20: preview has no real parent account (the logged-in user is the
              admin), so the address can't be prefilled — show a labeled
              placeholder instead of the admin's stale/blank address. */}
          {mode === "preview" && (
            <span className="reg-hint">
              Preview — a parent&apos;s saved address appears here automatically
              in the real registration flow.
            </span>
          )}
          <Controller
            name={el.id}
            control={control}
            defaultValue={EMPTY_ADDRESS}
            render={({ field }) => (
              <AddressBlockField
                value={field.value}
                onChange={field.onChange}
                inputClassName="reg-input"
              />
            )}
          />
        </>
      )}

      {el.inputType === "phone_number" && (
        <Controller
          name={el.id}
          control={control}
          render={({ field }) => (
            <input
              type="tel"
              className="reg-input"
              placeholder="(555) 555-5555"
              value={field.value ?? ""}
              onChange={(e) => field.onChange(formatPhone(e.target.value))}
              onBlur={field.onBlur}
              name={field.name}
            />
          )}
        />
      )}

      {error && <span className="reg-error">{error}</span>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Form content                                                                */
/* -------------------------------------------------------------------------- */

export function FormContent({
  semesterId,
  continueUrl,
  mode = "live",
}: {
  semesterId: string;
  continueUrl: string;
  mode?: "live" | "preview";
}) {
  const router = useRouter();
  const { state, setFormData } = useRegistration();
  const { userRecord } = useAuth();

  const [semester, setSemester] = useState<PublicSemester | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const isFirstRegistration = !userRecord?.referral_source;
  const [referralSource, setReferralSource] = useState("");
  const [referralError, setReferralError] = useState(false);
  const [waiverErrors, setWaiverErrors] = useState<Record<string, boolean>>({});

  // Family contacts + dancers for profile auto-fill
  const [familyContacts, setFamilyContacts] = useState<FamilyContact[]>([]);
  const [firstDancer, setFirstDancer] = useState<{
    first_name: string | null;
    last_name: string | null;
    birth_date: string | null;
    grade: string | null;
    school: string | null;
    secondary_email: string | null;
    phone_number: string | null;
  } | null>(null);
  const [contactsLoaded, setContactsLoaded] = useState(false);

  // Prevent re-seeding after the user has started editing
  const hasSeededProfile = useRef(false);

  useEffect(() => {
    if (!semesterId) {
      setFetchError("No semester selected.");
      setLoading(false);
      return;
    }
    getSemesterForDisplay(semesterId, mode)
      .then(setSemester)
      .catch((err: unknown) => {
        setFetchError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, [semesterId, mode]);

  // Fetch family contacts + first assigned dancer's school once on mount
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setContactsLoaded(true); return; }
      const { data: userRow } = await supabase
        .from("users").select("family_id").eq("id", user.id).single();
      if (!userRow?.family_id) { setContactsLoaded(true); return; }

      const [{ data: contactRows }, { data: dancerRows }] = await Promise.all([
        supabase
          .from("family_contacts")
          .select("id, family_id, type, first_name, last_name, phone, email, relationship, is_authorized_pickup, notes, created_at, updated_at")
          .eq("family_id", userRow.family_id),
        supabase
          .from("dancers")
          .select("id, first_name, last_name, birth_date, grade, school, secondary_email, phone_number")
          .eq("family_id", userRow.family_id)
          .order("created_at", { ascending: true }),
      ]);

      setFamilyContacts((contactRows as FamilyContact[]) ?? []);

      // Prefer the first dancer assigned in this registration;
      // fall back to the first dancer on the account.
      const assignedIds = state.participants
        .map(p => p.dancerId)
        .filter((id): id is string => !!id);
      const dancers = (dancerRows ?? []) as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        birth_date: string | null;
        grade: string | null;
        school: string | null;
        secondary_email: string | null;
        phone_number: string | null;
      }[];
      const firstAssigned = assignedIds.length > 0
        ? dancers.find(d => d.id === assignedIds[0])
        : null;
      setFirstDancer(firstAssigned ?? dancers[0] ?? null);

      setContactsLoaded(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const elements = semester?.registrationForm ?? [];
  // DEV: schema unused while resolver is disabled
  // const schema = buildDynamicFormSchema(elements);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    // DEV: resolver removed so all fields are optional — remove before launch
    // resolver: zodResolver(schema),
    defaultValues: state.formData as Record<string, unknown>,
  });

  // Seed form fields from profile once both semester and contacts are ready
  useEffect(() => {
    if (!semester || elements.length === 0) return;
    if (!contactsLoaded) return;
    if (hasSeededProfile.current) return;
    hasSeededProfile.current = true;

    // #20: in preview the logged-in account is the admin's, not a real parent —
    // seeding here would surface the admin's stale/blank address. Skip seeding;
    // the address field shows a labeled placeholder instead (see renderField).
    if (mode === "preview") return;

    const emergencyContact = familyContacts.find(c => c.type === "emergency_contact") ?? null;
    const alternateParent  = familyContacts.find(c => c.type === "alternate_parent")  ?? null;
    const caregiver        = familyContacts.find(c => c.type === "caregiver")         ?? null;

    const profileMap: Partial<Record<ProfileFieldKey, string | undefined>> = {
      // Dancer / student
      dancer_first_name: firstDancer?.first_name ?? undefined,
      dancer_last_name:  firstDancer?.last_name  ?? undefined,
      dancer_birth_date: firstDancer?.birth_date ?? undefined,
      dancer_grade:      firstDancer?.grade      ?? undefined,
      dancer_school:     firstDancer?.school     ?? undefined,
      dancer_email:      firstDancer?.secondary_email ?? undefined,
      dancer_phone:      firstDancer?.phone_number   ?? undefined,
      // Primary parent
      parent_first_name:    userRecord?.first_name    ?? undefined,
      parent_last_name:     userRecord?.last_name     ?? undefined,
      parent_email:         userRecord?.email         ?? undefined,
      parent_phone:         userRecord?.phone_number  ?? undefined,
      parent_address_line1: userRecord?.address_line1 ?? undefined,
      parent_address_line2: userRecord?.address_line2 ?? undefined,
      parent_city:          userRecord?.city          ?? undefined,
      parent_state:         userRecord?.state         ?? undefined,
      parent_zipcode:       userRecord?.zipcode       ?? undefined,
      // Alternate parent
      alt_parent_first_name:  alternateParent?.first_name  ?? undefined,
      alt_parent_last_name:   alternateParent?.last_name   ?? undefined,
      alt_parent_phone:       alternateParent?.phone       ?? undefined,
      alt_parent_email:       alternateParent?.email       ?? undefined,
      alt_parent_relationship: alternateParent?.relationship ?? undefined,
      // Caregiver
      caregiver_first_name:  caregiver?.first_name  ?? undefined,
      caregiver_last_name:   caregiver?.last_name   ?? undefined,
      caregiver_phone:       caregiver?.phone       ?? undefined,
      caregiver_email:       caregiver?.email       ?? undefined,
      caregiver_relationship: caregiver?.relationship ?? undefined,
      // Emergency contact
      emergency_contact_first_name:  emergencyContact?.first_name  ?? undefined,
      emergency_contact_last_name:   emergencyContact?.last_name   ?? undefined,
      emergency_contact_phone:       emergencyContact?.phone       ?? undefined,
      emergency_contact_email:       emergencyContact?.email       ?? undefined,
      emergency_contact_relationship: emergencyContact?.relationship ?? undefined,
    };

    const profileSeeded: Record<string, unknown> = {};
    for (const el of elements) {
      if (el.inputType === "address") {
        // Address block prefills from the parent's saved address (multi-field,
        // so it bypasses the single-field `profileField` mapping above).
        const addr = {
          street: userRecord?.address_line1 ?? "",
          line2: userRecord?.address_line2 ?? "",
          city: userRecord?.city ?? "",
          state: userRecord?.state ?? "",
          zip: userRecord?.zipcode ?? "",
        };
        if (addr.street || addr.city || addr.state || addr.zip) {
          profileSeeded[el.id] = addr;
        }
      } else if (el.profileField) {
        const val = profileMap[el.profileField];
        if (val) profileSeeded[el.id] = val;
      }
    }

    if (Object.keys(profileSeeded).length > 0) {
      // state.formData takes priority — don't overwrite fields the user already touched
      reset({ ...profileSeeded, ...state.formData });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semester, contactsLoaded]);

  async function onSubmit(data: Record<string, unknown>) {
    // Required waivers must be acknowledged before continuing.
    const nextWaiverErrors: Record<string, boolean> = {};
    for (const el of elements) {
      if (el.type === "waiver" && el.required && !isAcknowledged(data[el.id])) {
        nextWaiverErrors[el.id] = true;
      }
    }
    if (Object.keys(nextWaiverErrors).length > 0) {
      setWaiverErrors(nextWaiverErrors);
      return;
    }

    if (isFirstRegistration && !referralSource) {
      setReferralError(true);
      return;
    }
    if (isFirstRegistration && referralSource) {
      await saveReferralSource(referralSource);
    }
    setFormData(data);
    router.push(continueUrl);
  }

  /* ── Waiver render (view document + required acknowledgment) ── */
  function renderWaiver(el: RegistrationFormElement) {
    return (
      <div key={el.id} className="reg-field">
        <label className="reg-label">
          {el.label}
          {el.required && <span style={{ color: "var(--wine)", marginLeft: 3 }}>*</span>}
        </label>

        <div
          style={{
            maxHeight: 220,
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            fontSize: 13,
            lineHeight: 1.6,
            color: "var(--pub-text-muted)",
            border: "1.5px solid var(--pub-border)",
            borderRadius: 8,
            padding: "12px 14px",
            background: "var(--pub-surface)",
          }}
        >
          {el.waiverBody}
        </div>

        {el.waiverFileUrl && (
          <a
            href={el.waiverFileUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block",
              marginTop: 8,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--plum)",
            }}
          >
            View / download waiver (PDF) ↗
          </a>
        )}

        <Controller
          name={el.id}
          control={control}
          defaultValue={{ acknowledged: false }}
          render={({ field }) => (
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 9,
                cursor: "pointer",
                marginTop: 10,
                fontSize: 13,
                color: "var(--pub-text-primary)",
              }}
            >
              <input
                type="checkbox"
                checked={isAcknowledged(field.value)}
                onChange={(e) => {
                  field.onChange(
                    makeAcknowledgment(e.target.checked, new Date().toISOString()),
                  );
                  if (e.target.checked) {
                    setWaiverErrors((prev) => ({ ...prev, [el.id]: false }));
                  }
                }}
                style={{
                  accentColor: "var(--plum)",
                  width: 15,
                  height: 15,
                  marginTop: 2,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              />
              {el.acknowledgmentLabel ?? DEFAULT_ACKNOWLEDGMENT_LABEL}
            </label>
          )}
        />

        {waiverErrors[el.id] && (
          <span className="reg-error">
            You must acknowledge this waiver to continue.
          </span>
        )}
      </div>
    );
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{
            height: 52, borderRadius: 10,
            background: "var(--pub-border)",
            animation: "pulse 1.5s ease-in-out infinite",
          }} />
        ))}
      </div>
    );
  }

  /* ── Error ── */
  if (fetchError) {
    return (
      <div style={{
        background: "#FEF2F2", border: "1px solid #FEE2E2",
        borderRadius: 12, padding: "24px 20px", textAlign: "center",
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#B91C1C", marginBottom: 6 }}>
          Could not load registration form
        </div>
        <div style={{ fontSize: 12, color: "var(--pub-text-muted)", marginBottom: 14 }}>
          {fetchError}
        </div>
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            fontSize: 13, fontWeight: 600, color: "var(--plum)",
            background: "none", border: "none", cursor: "pointer",
            fontFamily: "var(--pub-font-primary)",
          }}
        >
          ← Go back
        </button>
      </div>
    );
  }

  /* ── No form elements — show referral question if first registration, else skip ── */
  if (elements.length === 0 && !isFirstRegistration) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0" }}>
        <div style={{
          width: 52, height: 52, borderRadius: "50%",
          background: "var(--pub-badge-sage-bg)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px",
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--pub-badge-sage-text)" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div style={{
          fontFamily: "var(--pub-font-secondary)",
          fontSize: 18, fontWeight: 700,
          color: "var(--pub-text-primary)", marginBottom: 6,
        }}>
          No additional information required
        </div>
        <div style={{ fontSize: 13, color: "var(--pub-text-muted)", marginBottom: 24 }}>
          You&apos;re all set — continue to the payment step.
        </div>
        <button
          type="button"
          onClick={() => router.push(continueUrl)}
          className="btn-continue"
          style={{ display: "inline-flex" }}
        >
          Continue to Payment
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
      </div>
    );
  }

  /* ── Main form ── */
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <div className="reg-page-eyebrow">Step 4 of 6 — Registration Info</div>
        <h1 className="reg-page-title">Registration Information</h1>
        <p className="reg-page-desc">Please complete all required fields before continuing to payment.</p>
      </div>

      {/* How did you hear about us — first-time families only */}
      {isFirstRegistration && (
        <div className="reg-field" style={{ marginBottom: 4 }}>
          <label className="reg-label">
            How did you hear about us?
            <span style={{ color: "var(--wine)", marginLeft: 3 }}>*</span>
          </label>
          <select
            className="reg-input"
            value={referralSource}
            onChange={(e) => { setReferralSource(e.target.value); setReferralError(false); }}
            style={referralError ? { borderColor: "var(--wine)" } : undefined}
          >
            <option value="">— Select one —</option>
            {REFERRAL_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          {referralError && (
            <span className="reg-error">Please let us know how you heard about us.</span>
          )}
        </div>
      )}

      {/* Form fields */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {elements.map((el) =>
          el.type === "waiver"
            ? renderWaiver(el)
            : renderField(el, register, control, errors, mode),
        )}
      </div>

      {/* CTAs */}
      <div className="reg-cta-row" style={{ marginTop: 32 }}>
        <button
          type="button"
          onClick={() => router.back()}
          className="btn-back"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back
        </button>
        <button type="submit" className="btn-continue">
          Continue to Payment
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

function FormPageInner() {
  const params = useSearchParams();
  const semesterId = params.get("semester") ?? "";
  // Meeting-plan #5: a waitlist join ends at the waitlist-confirm step instead
  // of payment. Everything before this (dancer + form capture) is identical.
  const isWaitlist = params.get("waitlist") === "1";
  const continueUrl = isWaitlist
    ? `/register/waitlist/confirm?semester=${semesterId}`
    : `/register/payment?semester=${semesterId}`;

  return (
    <CartRestoreGuard semesterId={semesterId}>
      <FormContent semesterId={semesterId} continueUrl={continueUrl} />
    </CartRestoreGuard>
  );
}

export default function FormPage() {
  return (
    <Suspense>
      <FormPageInner />
    </Suspense>
  );
}
