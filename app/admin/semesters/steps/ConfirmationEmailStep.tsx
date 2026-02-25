"use client";

import { useEffect, useRef, useState } from "react";
import { SemesterDraft, SemesterAction } from "@/types";
import TipTapEditor from "@/app/components/semester-flow/TipTapEditor";
import { autosaveSemesterField } from "../actions/autosaveSemesterField";
import { sendTestEmail } from "../actions/sendTestEmail";

type Props = {
  state: SemesterDraft;
  dispatch: React.Dispatch<SemesterAction>;
  onNext: () => void;
  onBack: () => void;
  isLocked?: boolean;
};

type SubStep = "info" | "design" | "preview" | "test";

const SUB_STEPS: { key: SubStep; label: string }[] = [
  { key: "info", label: "1. Template Info" },
  { key: "design", label: "2. Design" },
  { key: "preview", label: "3. Preview" },
  { key: "test", label: "4. Test Send" },
];

const MOCK_TOKENS: Record<string, string> = {
  "{{first_name}}": "Alex",
  "{{session_title}}": "Ballet Fundamentals",
  "{{total_amount}}": "$250.00",
  "{{registration_date}}": new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }),
};

function applyTokens(html: string): string {
  let result = html;
  for (const [token, value] of Object.entries(MOCK_TOKENS)) {
    result = result.replaceAll(token, value);
  }
  return result;
}

export default function ConfirmationEmailStep({
  state,
  dispatch,
  onNext,
  onBack,
  isLocked = false,
}: Props) {
  const email = state.confirmationEmail;
  const semesterId = state.id;

  const [activeSubStep, setActiveSubStep] = useState<SubStep>("info");
  const [subject, setSubject] = useState(email?.subject ?? "");
  const [fromName, setFromName] = useState(email?.fromName ?? "");
  const [fromEmail, setFromEmail] = useState(email?.fromEmail ?? "");
  const [htmlBody, setHtmlBody] = useState(email?.htmlBody ?? "");

  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">(
    "desktop",
  );
  const [testEmail, setTestEmail] = useState("");
  const [testStatus, setTestStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [testError, setTestError] = useState<string | null>(null);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* -------------------------------------------------------------------------- */
  /* Sync local state → reducer                                                 */
  /* -------------------------------------------------------------------------- */

  function syncToReducer(
    updates: Partial<NonNullable<SemesterDraft["confirmationEmail"]>>,
  ) {
    dispatch({
      type: "SET_CONFIRMATION_EMAIL",
      payload: {
        subject,
        fromName,
        fromEmail,
        htmlBody,
        ...updates,
      },
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Debounced autosave (design step only)                                     */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    if (activeSubStep !== "design" || !semesterId || isLocked) return;

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);

    autosaveTimer.current = setTimeout(async () => {
      try {
        await autosaveSemesterField(semesterId, "confirmation_email", {
          subject,
          fromName,
          fromEmail,
          htmlBody,
        });
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
  }, [htmlBody, subject, fromName, fromEmail]);

  /* -------------------------------------------------------------------------- */
  /* Handlers                                                                   */
  /* -------------------------------------------------------------------------- */

  function handleBodyChange(html: string) {
    setHtmlBody(html);
    syncToReducer({ htmlBody: html });
  }

  function handleInfoChange<K extends "subject" | "fromName" | "fromEmail">(
    key: K,
    value: string,
  ) {
    if (key === "subject") setSubject(value);
    if (key === "fromName") setFromName(value);
    if (key === "fromEmail") setFromEmail(value);
    syncToReducer({ [key]: value });
  }

  async function handleTestSend() {
    if (!semesterId || !testEmail) return;
    console.log("SENDING EMAIL");
    setTestStatus("sending");
    setTestError(null);

    // Persist latest state before sending
    try {
      await autosaveSemesterField(semesterId, "confirmation_email", {
        subject,
        fromName,
        fromEmail,
        htmlBody,
      });
    } catch {
      // best-effort
    }

    const result = await sendTestEmail(semesterId, testEmail);
    if (result.success) {
      console.log("result", result);
      setTestStatus("sent");
    } else {
      setTestStatus("error");
      setTestError(result.error ?? "Send failed");
      console.log("ERROR", result.error);
    }
  }

  /* -------------------------------------------------------------------------- */
  /* Render                                                                     */
  /* -------------------------------------------------------------------------- */

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900">
          Confirmation Email
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Configure the email sent to registrants after sign-up.
        </p>
      </div>

      {/* Locked banner */}
      {isLocked && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          This semester has active registrations. The confirmation email is
          locked.
        </div>
      )}

      {/* Sub-step tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-1">
          {SUB_STEPS.map((s) => (
            <button
              key={s.key}
              onClick={() => setActiveSubStep(s.key)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeSubStep === s.key
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-step content */}
      <div className="min-h-[200px]">
        {/* — Info — */}
        {activeSubStep === "info" && (
          <div className="space-y-6 max-w-xl">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Subject *
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => handleInfoChange("subject", e.target.value)}
                disabled={isLocked}
                placeholder="Your registration is confirmed!"
                className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
              />
              <p className="text-xs text-gray-400">
                Tokens: {"{{first_name}}"}, {"{{session_title}}"},{" "}
                {"{{registration_date}}"}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                From Name
              </label>
              <input
                type="text"
                value={fromName}
                onChange={(e) => handleInfoChange("fromName", e.target.value)}
                disabled={isLocked}
                placeholder="AYDT Registration"
                className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                From Email
              </label>
              <input
                type="email"
                value={fromEmail}
                onChange={(e) => handleInfoChange("fromEmail", e.target.value)}
                disabled={isLocked}
                placeholder="noreply@aydt.com"
                className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
          </div>
        )}

        {/* — Design — */}
        {activeSubStep === "design" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-500">
                Build your email body. Use tokens like{" "}
                <code className="bg-gray-100 px-1 rounded text-xs">
                  {"{{first_name}}"}
                </code>
                ,{" "}
                <code className="bg-gray-100 px-1 rounded text-xs">
                  {"{{session_title}}"}
                </code>
                ,{" "}
                <code className="bg-gray-100 px-1 rounded text-xs">
                  {"{{total_amount}}"}
                </code>
                ,{" "}
                <code className="bg-gray-100 px-1 rounded text-xs">
                  {"{{registration_date}}"}
                </code>
                .
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
              placeholder="Hi {{first_name}}, your registration for {{session_title}} is confirmed..."
              minHeight="280px"
            />
          </div>
        )}

        {/* — Preview — */}
        {activeSubStep === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPreviewMode("desktop")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition ${
                  previewMode === "desktop"
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                Desktop
              </button>
              <button
                onClick={() => setPreviewMode("mobile")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition ${
                  previewMode === "mobile"
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                Mobile
              </button>
            </div>

            {htmlBody ? (
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50 p-4 flex justify-center">
                <iframe
                  srcDoc={applyTokens(htmlBody)}
                  title="Email preview"
                  className="rounded-lg border border-gray-200 bg-white"
                  style={{
                    width: previewMode === "desktop" ? "600px" : "375px",
                    height: "480px",
                  }}
                  sandbox="allow-same-origin"
                />
              </div>
            ) : (
              <div className="border border-gray-200 rounded-xl p-8 text-sm text-gray-400 text-center">
                No email body yet. Add content in the Design tab.
              </div>
            )}

            <p className="text-xs text-gray-400">
              Tokens are replaced with mock data for preview.
            </p>
          </div>
        )}

        {/* — Test Send — */}
        {activeSubStep === "test" && (
          <div className="space-y-6 max-w-md">
            <p className="text-sm text-gray-500">
              Send a test email with mock token data to verify rendering. The
              subject will be prefixed with{" "}
              <span className="font-mono text-xs bg-gray-100 px-1 rounded">
                [TEST]
              </span>
              .
            </p>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Test Email Address
              </label>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => {
                  setTestEmail(e.target.value);
                  setTestStatus("idle");
                }}
                placeholder="you@example.com"
                className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <button
              onClick={handleTestSend}
              disabled={!testEmail || testStatus === "sending" || !semesterId}
              className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testStatus === "sending" ? "Sending..." : "Send Test Email"}
            </button>

            {testStatus === "sent" && (
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                Test email sent successfully.
              </div>
            )}

            {testStatus === "error" && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                {testError ??
                  "Failed to send. Check your Resend configuration."}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer navigation */}
      <div className="flex justify-between pt-6 border-t border-gray-200">
        <button
          onClick={onBack}
          className="px-5 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="px-5 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
