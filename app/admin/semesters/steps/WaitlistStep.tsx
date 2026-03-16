"use client";

import { useEffect, useRef, useState } from "react";
import { SemesterDraft, SemesterAction, WaitlistConfig } from "@/types";
import TipTapEditor from "@/app/components/semester-flow/TipTapEditor";
import { autosaveSemesterField } from "../actions/autosaveSemesterField";
import { sendTestWaitlistEmail } from "../actions/sendTestWaitlistEmail";
import { wrapEmailLayout } from "@/utils/prepareEmailHtml";

type Props = {
  state: SemesterDraft;
  dispatch: React.Dispatch<SemesterAction>;
  onNext: () => void;
  onBack: () => void;
  isLocked?: boolean;
  semesterId?: string;
};

type SubStep = "settings" | "emailInfo" | "emailDesign" | "emailPreview" | "emailTest";

const SUB_STEPS: { key: SubStep; label: string }[] = [
  { key: "settings", label: "1. Settings" },
  { key: "emailInfo", label: "2. Email Info" },
  { key: "emailDesign", label: "3. Email Design" },
  { key: "emailPreview", label: "4. Preview" },
  { key: "emailTest", label: "5. Test Send" },
];

const MOCK_TOKENS: Record<string, string> = {
  "{{participant_name}}": "Alex Johnson",
  "{{parent_name}}": "Sarah Johnson",
  "{{session_name}}": "Ballet Fundamentals",
  "{{hold_until_datetime}}": "February 24, 2026 at 3:00 PM",
  "{{timezone}}": "Eastern Time",
  "{{accept_link}}": "#",
};

function applyTokens(html: string): string {
  let result = html;
  for (const [token, value] of Object.entries(MOCK_TOKENS)) {
    result = result.replaceAll(token, value);
  }
  return result;
}

const DEFAULT_WAITLIST: WaitlistConfig = {
  enabled: false,
  sessionSettings: {},
  inviteExpiryHours: 48,
  stopDaysBeforeClose: 3,
  invitationEmail: {
    subject: "",
    fromName: "",
    fromEmail: "",
    htmlBody: "",
  },
};

export default function WaitlistStep({
  state,
  dispatch,
  onNext,
  onBack,
  isLocked = false,
  semesterId,
}: Props) {
  const waitlist = state.waitlist ?? DEFAULT_WAITLIST;
  const appliedSessions = (state.sessions?.classes ?? []).flatMap((cls) =>
    (cls.schedules ?? []).map((cs) => ({
      sessionId: cs.id ?? "",
      title: `${cls.name} — ${cs.daysOfWeek.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(", ")}`,
      registrationCloseAt: cs.registrationCloseAt,
    })),
  );

  /* -------------------------------------------------------------------------- */
  /* Local state                                                                 */
  /* -------------------------------------------------------------------------- */

  const [activeSubStep, setActiveSubStep] = useState<SubStep>("settings");

  // Settings
  const [enabled, setEnabled] = useState(waitlist.enabled);
  const [sessionSettings, setSessionSettings] = useState(waitlist.sessionSettings ?? {});
  const [inviteExpiryHours, setInviteExpiryHours] = useState(
    String(waitlist.inviteExpiryHours ?? 48),
  );
  const [stopDaysBeforeClose, setStopDaysBeforeClose] = useState(
    String(waitlist.stopDaysBeforeClose ?? 3),
  );

  // Email fields
  const [subject, setSubject] = useState(waitlist.invitationEmail?.subject ?? "");
  const [fromName, setFromName] = useState(waitlist.invitationEmail?.fromName ?? "");
  const [fromEmail, setFromEmail] = useState(waitlist.invitationEmail?.fromEmail ?? "");
  const [htmlBody, setHtmlBody] = useState(waitlist.invitationEmail?.htmlBody ?? "");

  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [testEmail, setTestEmail] = useState("");
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [testError, setTestError] = useState<string | null>(null);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* -------------------------------------------------------------------------- */
  /* Build current waitlist config                                               */
  /* -------------------------------------------------------------------------- */

  function buildConfig(overrides?: Partial<WaitlistConfig>): WaitlistConfig {
    return {
      enabled,
      sessionSettings,
      inviteExpiryHours: Number(inviteExpiryHours) || 48,
      stopDaysBeforeClose: Number(stopDaysBeforeClose) || 3,
      invitationEmail: { subject, fromName, fromEmail, htmlBody },
      ...overrides,
    };
  }

  function syncToReducer(overrides?: Partial<WaitlistConfig>) {
    dispatch({ type: "SET_WAITLIST", payload: buildConfig(overrides) });
  }

  /* -------------------------------------------------------------------------- */
  /* Debounced autosave (email design only)                                     */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    if (activeSubStep !== "emailDesign" || !semesterId || isLocked) return;

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);

    autosaveTimer.current = setTimeout(async () => {
      try {
        await autosaveSemesterField(semesterId, "waitlist_settings", buildConfig());
        setSavedAt(new Date().toLocaleTimeString());
        setTimeout(() => setSavedAt(null), 3000);
      } catch {
        // silent — full persist on step transition
      }
    }, 8000);

    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [htmlBody, subject, fromName, fromEmail, activeSubStep]);

  /* -------------------------------------------------------------------------- */
  /* Handlers                                                                   */
  /* -------------------------------------------------------------------------- */

  function handleEnabledToggle(value: boolean) {
    setEnabled(value);
    syncToReducer({ enabled: value });
  }

  function handleSessionToggle(sessionId: string, value: boolean) {
    const updated = { ...sessionSettings, [sessionId]: { enabled: value } };
    setSessionSettings(updated);
    syncToReducer({ sessionSettings: updated });
  }

  function handleExpiryChange(value: string) {
    setInviteExpiryHours(value);
    syncToReducer({ inviteExpiryHours: Number(value) || 48 });
  }

  function handleStopDaysChange(value: string) {
    setStopDaysBeforeClose(value);
    syncToReducer({ stopDaysBeforeClose: Number(value) || 3 });
  }

  function handleBodyChange(html: string) {
    setHtmlBody(html);
    syncToReducer({ invitationEmail: { subject, fromName, fromEmail, htmlBody: html } });
  }

  function handleEmailInfoChange<K extends "subject" | "fromName" | "fromEmail">(
    key: K,
    value: string,
  ) {
    if (key === "subject") setSubject(value);
    if (key === "fromName") setFromName(value);
    if (key === "fromEmail") setFromEmail(value);
    syncToReducer({
      invitationEmail: {
        subject: key === "subject" ? value : subject,
        fromName: key === "fromName" ? value : fromName,
        fromEmail: key === "fromEmail" ? value : fromEmail,
        htmlBody,
      },
    });
  }

  async function handleTestSend() {
    if (!semesterId || !testEmail) return;
    setTestStatus("sending");
    setTestError(null);

    try {
      await autosaveSemesterField(semesterId, "waitlist_settings", buildConfig());
    } catch {
      // best-effort
    }

    const result = await sendTestWaitlistEmail(semesterId, testEmail);
    if (result.success) {
      setTestStatus("sent");
    } else {
      setTestStatus("error");
      setTestError(result.error ?? "Send failed");
    }
  }

  /* -------------------------------------------------------------------------- */
  /* Render                                                                     */
  /* -------------------------------------------------------------------------- */

  return (
    <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-8 space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-neutral-900">Waitlist</h2>
        <p className="text-sm text-neutral-500 mt-1">
          Configure automatic waitlist management and invitation emails for each session.
        </p>
      </div>

      {/* Locked banner */}
      {isLocked && (
        <div className="rounded-xl bg-mauve/10 border border-mauve px-4 py-3 text-sm text-mauve-text">
          This semester has active registrations. Waitlist settings are locked.
        </div>
      )}

      {/* Sub-step tabs */}
      <div className="border-b border-neutral-200">
        <div className="flex gap-1 overflow-x-auto">
          {SUB_STEPS.map((s) => (
            <button
              key={s.key}
              onClick={() => setActiveSubStep(s.key)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeSubStep === s.key
                  ? "border-primary-600 text-primary-600"
                  : "border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-step content */}
      <div className="min-h-[200px]">

        {/* — Settings — */}
        {activeSubStep === "settings" && (
          <div className="space-y-8">
            {/* Enable toggle */}
            <div className="flex items-center justify-between max-w-xl">
              <div>
                <p className="text-sm font-medium text-neutral-900">Enable Waitlist</p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Automatically place registrants on a waitlist when a session is full.
                </p>
              </div>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => handleEnabledToggle(!enabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                  enabled ? "bg-primary-600" : "bg-neutral-200"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {enabled && (
              <>
                {/* Invite expiry */}
                <div className="max-w-xs space-y-2">
                  <label className="text-sm font-medium text-neutral-700">
                    Invitation expires after
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      value={inviteExpiryHours}
                      onChange={(e) => handleExpiryChange(e.target.value)}
                      disabled={isLocked}
                      className="w-24 border border-neutral-300 rounded-xl px-3 py-2 text-sm text-slate-700 focus:ring-2 focus:ring-primary-600 focus:outline-none disabled:bg-neutral-50 disabled:text-neutral-400"
                    />
                    <span className="text-sm text-neutral-600">hours</span>
                  </div>
                </div>

                {/* Stop days before close */}
                <div className="max-w-xs space-y-2">
                  <label className="text-sm font-medium text-neutral-700">
                    Stop sending invites
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      value={stopDaysBeforeClose}
                      onChange={(e) => handleStopDaysChange(e.target.value)}
                      disabled={isLocked}
                      className="w-24 border border-neutral-300 rounded-xl px-3 py-2 text-sm text-slate-700 focus:ring-2 focus:ring-primary-600 focus:outline-none disabled:bg-neutral-50 disabled:text-neutral-400"
                    />
                    <span className="text-sm text-neutral-600">days before registration close</span>
                  </div>
                </div>

                {/* Per-session toggles */}
                <div className="space-y-3">
                  <p className="text-sm font-medium text-neutral-700">Per-Session Waitlist</p>
                  {appliedSessions.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-neutral-200 p-4 text-sm text-neutral-400">
                      No sessions applied. Add sessions in the Sessions step first.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {appliedSessions.map((session) => {
                        const sessionEnabled =
                          sessionSettings[session.sessionId]?.enabled ?? true;
                        const title = session.title;
                        const closeAt = session.registrationCloseAt;

                        return (
                          <div
                            key={session.sessionId}
                            className="flex items-center justify-between border border-neutral-200 rounded-xl px-4 py-3"
                          >
                            <div>
                              <p className="text-sm font-medium text-neutral-900">{title}</p>
                              {closeAt && (
                                <p className="text-xs text-neutral-400 mt-0.5">
                                  Registration closes:{" "}
                                  {new Date(closeAt).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                  })}
                                </p>
                              )}
                              {!closeAt && (
                                <p className="text-xs text-mauve-text mt-0.5">
                                  No registration close date set
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              disabled={isLocked}
                              onClick={() =>
                                handleSessionToggle(session.sessionId, !sessionEnabled)
                              }
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                                sessionEnabled ? "bg-primary-600" : "bg-neutral-200"
                              }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                  sessionEnabled ? "translate-x-6" : "translate-x-1"
                                }`}
                              />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* — Email Info — */}
        {activeSubStep === "emailInfo" && (
          <div className="space-y-6 max-w-xl">
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700">Subject *</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => handleEmailInfoChange("subject", e.target.value)}
                disabled={isLocked}
                placeholder="You're off the waitlist — claim your spot!"
                className="w-full border border-neutral-300 rounded-xl px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 focus:outline-none disabled:bg-neutral-50 disabled:text-neutral-400"
              />
              <p className="text-xs text-neutral-400">
                Tokens:{" "}
                {[
                  "{{participant_name}}",
                  "{{parent_name}}",
                  "{{session_name}}",
                  "{{hold_until_datetime}}",
                  "{{timezone}}",
                  "{{accept_link}}",
                ].map((t) => (
                  <code key={t} className="bg-neutral-100 px-1 rounded text-xs mr-1">
                    {t}
                  </code>
                ))}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700">From Name</label>
              <input
                type="text"
                value={fromName}
                onChange={(e) => handleEmailInfoChange("fromName", e.target.value)}
                disabled={isLocked}
                placeholder="AYDT Registration"
                className="w-full border border-neutral-300 rounded-xl px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 focus:outline-none disabled:bg-neutral-50 disabled:text-neutral-400"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700">From Email</label>
              <input
                type="email"
                value={fromEmail}
                onChange={(e) => handleEmailInfoChange("fromEmail", e.target.value)}
                disabled={isLocked}
                placeholder="noreply@aydt.com"
                className="w-full border border-neutral-300 rounded-xl px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 focus:outline-none disabled:bg-neutral-50 disabled:text-neutral-400"
              />
            </div>
          </div>
        )}

        {/* — Email Design — */}
        {activeSubStep === "emailDesign" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-neutral-500">
                Design the waitlist invitation email. Use tokens like{" "}
                <code className="bg-neutral-100 px-1 rounded text-xs">{"{{participant_name}}"}</code>,{" "}
                <code className="bg-neutral-100 px-1 rounded text-xs">{"{{session_name}}"}</code>,{" "}
                <code className="bg-neutral-100 px-1 rounded text-xs">{"{{hold_until_datetime}}"}</code>,{" "}
                <code className="bg-neutral-100 px-1 rounded text-xs">{"{{accept_link}}"}</code>.
              </p>
              {savedAt && (
                <span className="text-xs text-green-600 font-medium shrink-0 ml-4">
                  Saved {savedAt}
                </span>
              )}
            </div>
            <TipTapEditor
              value={htmlBody}
              onChange={handleBodyChange}
              placeholder="Hi {{participant_name}}, a spot opened up in {{session_name}}! Click the link below to accept..."
              minHeight="280px"
            />
          </div>
        )}

        {/* — Preview — */}
        {activeSubStep === "emailPreview" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPreviewMode("desktop")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition ${
                  previewMode === "desktop"
                    ? "border-primary-600 bg-primary-50 text-primary-700"
                    : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                Desktop
              </button>
              <button
                onClick={() => setPreviewMode("mobile")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition ${
                  previewMode === "mobile"
                    ? "border-primary-600 bg-primary-50 text-primary-700"
                    : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                Mobile
              </button>
            </div>

            {htmlBody ? (
              <div className="border border-neutral-200 rounded-xl overflow-hidden bg-neutral-50 p-4 flex justify-center">
                <iframe
                  srcDoc={wrapEmailLayout(applyTokens(htmlBody))}
                  title="Waitlist email preview"
                  className="rounded-lg border border-neutral-200"
                  style={{
                    width: previewMode === "desktop" ? "720px" : "375px",
                    height: "480px",
                  }}
                  sandbox="allow-same-origin"
                />
              </div>
            ) : (
              <div className="border border-neutral-200 rounded-xl p-8 text-sm text-neutral-400 text-center">
                No email body yet. Add content in the Email Design tab.
              </div>
            )}

            <p className="text-xs text-neutral-400">
              Tokens are replaced with mock data for preview.
            </p>
          </div>
        )}

        {/* — Test Send — */}
        {activeSubStep === "emailTest" && (
          <div className="space-y-6 max-w-md">
            <p className="text-sm text-neutral-500">
              Send a test waitlist invitation with mock token data. The subject will be prefixed
              with{" "}
              <span className="font-mono text-xs bg-neutral-100 px-1 rounded">[TEST]</span>.
            </p>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700">Test Email Address</label>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => {
                  setTestEmail(e.target.value);
                  setTestStatus("idle");
                }}
                placeholder="you@example.com"
                className="w-full border border-neutral-300 rounded-xl px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 focus:outline-none"
              />
            </div>

            <button
              onClick={handleTestSend}
              disabled={!testEmail || testStatus === "sending" || !semesterId}
              className="px-5 py-2 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testStatus === "sending" ? "Sending..." : "Send Test Email"}
            </button>

            {testStatus === "sent" && (
              <div className="text-sm text-mint-text bg-mint/10 border border-mint rounded-xl px-4 py-3">
                Test email sent successfully.
              </div>
            )}

            {testStatus === "error" && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                {testError ?? "Failed to send. Check your Resend configuration."}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer navigation */}
      <div className="flex justify-between pt-6 border-t border-neutral-200">
        <button
          onClick={onBack}
          className="px-5 py-2 rounded-xl border border-neutral-300 text-neutral-700 hover:bg-neutral-50 transition"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="px-5 py-2 rounded-xl bg-primary-600 text-white hover:bg-primary-700 transition"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
