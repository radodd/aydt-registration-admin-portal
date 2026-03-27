import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AYDT SMS Opt-In Information",
  description:
    "How AYDT collects SMS consent, verifies phone numbers, and allows subscribers to manage or cancel text message notifications.",
};

// ── Design tokens (matches portal.css / SmsOptInCard.tsx) ────────────────────
const C = {
  plum:          "#7A4A72",
  plumHover:     "#5E3458",
  wine:          "#8E2A23",
  pageBg:        "#FDFBF9",
  surface:       "#FFFFFF",
  surfaceWarm:   "#FAF7F4",
  border:        "#E8DFD8",
  borderSubtle:  "#F0EBE6",
  textPrimary:   "#1A1714",
  textMuted:     "#786E65",
  mintBg:        "#D4F0E8",
  mintText:      "#0A5A50",
  shadowCard:    "0 1px 4px rgba(26,23,20,0.07), 0 1px 2px rgba(26,23,20,0.04)",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StepLabel({ n, label }: { n: number; label: string }) {
  return (
    <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 22, height: 22, borderRadius: "50%",
        background: C.plum, color: "#fff",
        fontSize: 11, fontWeight: 700, flexShrink: 0,
      }}>{n}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {label}
      </span>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: C.shadowCard,
      marginBottom: 24,
    }}>
      {children}
    </div>
  );
}

function CardHeader({ title, subtitle, badge }: { title: string; subtitle: string; badge?: string }) {
  return (
    <div style={{
      padding: "14px 20px",
      background: C.surfaceWarm,
      borderBottom: `1px solid ${C.borderSubtle}`,
      display: "flex", alignItems: "center", justifyContent: "space-between",
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary }}>{title}</div>
        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 1 }}>{subtitle}</div>
      </div>
      {badge && (
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "2px 8px", borderRadius: 99,
          fontSize: 10, fontWeight: 700,
          background: C.mintBg, color: C.mintText,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", opacity: 0.75 }} />
          {badge}
        </span>
      )}
    </div>
  );
}

function CardBody({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 20 }}>{children}</div>;
}

function FakeInput({ label, placeholder, monospace }: { label: string; placeholder: string; monospace?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.textPrimary, marginBottom: 4 }}>{label}</div>
      <div style={{
        width: "100%", padding: "8px 12px", boxSizing: "border-box",
        border: `1.5px solid ${C.border}`, borderRadius: 7,
        fontSize: 13, color: C.textMuted,
        background: C.surface,
        fontFamily: monospace ? "monospace" : "inherit",
        letterSpacing: monospace ? "0.2em" : undefined,
      }}>
        {placeholder}
      </div>
    </div>
  );
}

function FakeButton({ label, disabled }: { label: string; disabled?: boolean }) {
  return (
    <div style={{
      width: "100%", padding: "9px 0", borderRadius: 7, boxSizing: "border-box",
      background: C.plum, color: "#fff",
      fontSize: 13, fontWeight: 600, textAlign: "center",
      opacity: disabled ? 0.55 : 1,
    }}>
      {label}
    </div>
  );
}

function ToggleRow({ label, desc, on = true }: { label: string; desc: string; on?: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 14,
      padding: "14px 0",
      borderBottom: `1px solid ${C.borderSubtle}`,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}>{label}</div>
        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2, lineHeight: 1.5 }}>{desc}</div>
      </div>
      {/* Toggle pill */}
      <div style={{ position: "relative", width: 38, height: 22, flexShrink: 0, marginTop: 1 }}>
        <div style={{
          position: "absolute", inset: 0, borderRadius: 11,
          background: on ? C.plum : C.border,
        }} />
        <div style={{
          position: "absolute", top: 3, left: on ? 19 : 3,
          width: 16, height: 16, borderRadius: "50%",
          background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
        }} />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SmsOptInPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: C.pageBg,
      fontFamily: "system-ui, -apple-system, sans-serif",
      padding: "48px 20px 80px",
    }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>

        {/* Page header */}
        <div style={{ marginBottom: 36, textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.textPrimary, marginBottom: 6 }}>
            AYDT SMS Notifications
          </div>
          <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6, margin: 0 }}>
            AYDT (Academy of Youth Dance and Theater) sends SMS alerts only to
            parents and guardians who explicitly opt in and verify their phone
            number. The screens below show exactly how consent is collected,
            how preferences are managed, and how subscribers can opt out.
          </p>
        </div>

        {/* ── Step 1: Opt-In Form ─────────────────────────────────────────── */}
        <StepLabel n={1} label="Opt-In — Profile › Text Message Alerts" />
        <Card>
          <CardHeader
            title="Text Message Alerts"
            subtitle="Receive urgent alerts via SMS"
          />
          <CardBody>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <FakeInput label="Mobile phone number" placeholder="(212) 555-1234" />

              {/* Consent checkbox */}
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{
                  width: 14, height: 14, flexShrink: 0, marginTop: 2,
                  border: `2px solid ${C.plum}`, borderRadius: 3,
                  background: C.plum,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                    <path d="M1 3.5L3.5 6L8 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
                  I agree to receive SMS notifications from AYDT about registration
                  updates, waitlist invitations, and payment reminders. Message and
                  data rates may apply. Reply STOP to opt out.
                </span>
              </label>

              <FakeButton label="Send Verification Code" />
            </div>
          </CardBody>
        </Card>

        {/* ── Step 2: Phone Verification ──────────────────────────────────── */}
        <StepLabel n={2} label="Phone Verification" />
        <Card>
          <CardHeader
            title="Text Message Alerts"
            subtitle="Verify your mobile number"
          />
          <CardBody>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>
                A 6-digit code was sent to{" "}
                <strong style={{ color: C.textPrimary }}>(212) 555-1234</strong>.
                Enter it below to confirm your number.
              </p>
              <FakeInput label="Verification code" placeholder="• • • • • •" monospace />
              <FakeButton label="Verify" disabled />
              <div style={{ fontSize: 12, color: C.textMuted, textAlign: "center" }}>
                Resend code
              </div>
            </div>
          </CardBody>
        </Card>

        {/* ── Step 3: Manage Preferences ──────────────────────────────────── */}
        <StepLabel n={3} label="Manage Notification Preferences" />
        <Card>
          <CardHeader
            title="Text Message Alerts"
            subtitle="SMS is active"
            badge="SMS Active"
          />
          <CardBody>
            <ToggleRow
              label="Class cancellations & schedule changes"
              desc="Immediate SMS if a class is cancelled or moved."
              on
            />
            <ToggleRow
              label="Waitlist openings"
              desc="Get notified the moment a spot opens in a waitlisted class."
              on
            />
            <ToggleRow
              label="Payment reminders"
              desc="Reminder 5 days before each installment due date."
              on={false}
            />
          </CardBody>
        </Card>

        {/* ── Step 4: Opt-Out ─────────────────────────────────────────────── */}
        <StepLabel n={4} label="Opt-Out" />
        <Card>
          <CardHeader
            title="Text Message Alerts"
            subtitle="SMS is active"
            badge="SMS Active"
          />
          <CardBody>
            <p style={{ fontSize: 13, color: C.textMuted, margin: "0 0 16px", lineHeight: 1.6 }}>
              Subscribers can opt out at any time using either method below.
              Once opted out, no further SMS messages will be sent.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* In-app opt-out button */}
              <div style={{
                padding: "12px 16px",
                background: C.surfaceWarm,
                border: `1px solid ${C.borderSubtle}`,
                borderRadius: 8,
                fontSize: 12, color: C.textMuted, lineHeight: 1.5,
              }}>
                <strong style={{ color: C.textPrimary, display: "block", marginBottom: 4 }}>
                  In-app opt-out
                </strong>
                The "Opt out of all SMS" button in the profile sets{" "}
                <code style={{ fontSize: 11, background: C.borderSubtle, padding: "1px 4px", borderRadius: 3 }}>
                  sms_opt_in = false
                </code>{" "}
                immediately.
              </div>
              {/* Reply STOP */}
              <div style={{
                padding: "12px 16px",
                background: C.surfaceWarm,
                border: `1px solid ${C.borderSubtle}`,
                borderRadius: 8,
                fontSize: 12, color: C.textMuted, lineHeight: 1.5,
              }}>
                <strong style={{ color: C.textPrimary, display: "block", marginBottom: 4 }}>
                  Reply STOP
                </strong>
                Replying STOP to any AYDT message opts the subscriber out at
                the carrier level via Twilio. No further messages are sent.
              </div>
            </div>
          </CardBody>
          {/* Footer — opt-out button */}
          <div style={{
            padding: "12px 20px",
            borderTop: `1px solid ${C.borderSubtle}`,
            background: C.surfaceWarm,
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.wine }}>
              Opt out of all SMS
            </span>
          </div>
        </Card>

        {/* ── Disclosure footer ────────────────────────────────────────────── */}
        <div style={{
          marginTop: 8,
          padding: "16px 20px",
          background: C.surfaceWarm,
          border: `1px solid ${C.borderSubtle}`,
          borderRadius: 10,
          fontSize: 11, color: C.textMuted, lineHeight: 1.7,
        }}>
          <strong style={{ color: C.textPrimary, display: "block", marginBottom: 4 }}>
            Program disclosure
          </strong>
          <strong>Program name:</strong> AYDT Registration Alerts<br />
          <strong>Message types:</strong> Class cancellations, waitlist notifications, payment reminders<br />
          <strong>Message frequency:</strong> Varies based on enrollment activity<br />
          <strong>Carriers:</strong> Msg &amp; data rates may apply. Compatible with all major US carriers.<br />
          <strong>Opt-out:</strong> Reply STOP to any message, or use the opt-out button in your profile<br />
          <strong>Help:</strong> Reply HELP or contact <a href="mailto:info@aydt.nyc" style={{ color: C.plum }}>info@aydt.nyc</a>
        </div>

      </div>
    </div>
  );
}
