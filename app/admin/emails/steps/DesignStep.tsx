"use client";

import { useEffect, useRef, useState } from "react";
import { EmailDraft, EmailWizardAction } from "@/types";
import TipTapEditor from "@/app/components/semester-flow/TipTapEditor";
import IPhoneFrame from "@/app/components/email/IPhoneFrame";
import { updateEmailDraft } from "../actions/updateEmailDraft";
import { sendTestBroadcastEmail } from "../actions/sendTestBroadcastEmail";
import { sendTestAsFamily } from "../actions/sendTestAsFamily";
import { applyMockTokens } from "@/utils/resolveEmailVariables";

type Props = {
  state: EmailDraft;
  dispatch: React.Dispatch<EmailWizardAction>;
  onNext: () => void;
  onBack: () => void;
  emailId: string;
};

type SubTab = "design" | "preview" | "test";

const VARIABLES = [
  { token: "{{parent_name}}", description: "Parent's full name" },
  { token: "{{student_name}}", description: "Student's full name" },
  { token: "{{dancer_class_list}}", description: "All dancers and their classes" },
  { token: "{{semester_name}}", description: "Semester name" },
  { token: "{{session_name}}", description: "Session title" },
];

export default function DesignStep({
  state,
  dispatch,
  onNext,
  onBack,
  emailId,
}: Props) {
  const [activeTab, setActiveTab] = useState<SubTab>("design");
  const [htmlBody, setHtmlBody] = useState(state.design?.bodyHtml ?? "");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">(
    "desktop",
  );
  const [testMode, setTestMode] = useState<"mock" | "family">("mock");
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [testStatus, setTestStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [testError, setTestError] = useState<string | null>(null);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced autosave
  useEffect(() => {
    if (activeTab !== "design") return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);

    autosaveTimer.current = setTimeout(async () => {
      try {
        await updateEmailDraft(emailId, {
          ...state,
          design: {
            bodyHtml: htmlBody,
            bodyJson: state.design?.bodyJson ?? {},
          },
        });
        setSavedAt(new Date().toLocaleTimeString());
        setTimeout(() => setSavedAt(null), 3000);
      } catch {
        // silent — full persist on step navigation
      }
    }, 5000);

    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [htmlBody]);

  function handleBodyChange(html: string) {
    setHtmlBody(html);
    dispatch({
      type: "SET_DESIGN",
      payload: { bodyHtml: html, bodyJson: state.design?.bodyJson ?? {} },
    });
  }

  async function handleTestSend() {
    if (!testEmail) return;
    setTestStatus("sending");
    setTestError(null);
    const result =
      testMode === "family" && selectedFamilyId
        ? await sendTestAsFamily(emailId, selectedFamilyId, testEmail)
        : await sendTestBroadcastEmail(emailId, testEmail);
    if (result.success) {
      setTestStatus("sent");
    } else {
      setTestStatus("error");
      setTestError(result.error ?? "Send failed");
    }
  }

  const tabs: { key: SubTab; label: string }[] = [
    { key: "design", label: "1. Design" },
    { key: "preview", label: "2. Preview" },
    { key: "test", label: "3. Test Send" },
  ];

  const previewHtml = applyMockTokens(htmlBody);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Email Body</h2>
        <p className="text-sm text-gray-500 mt-1">
          Design your email content using the editor below.
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === t.key
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-[280px]">
        {/* Design tab */}
        {activeTab === "design" && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-6">
              {/* Variable reference */}
              <div className="shrink-0 bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2 min-w-52">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Available variables
                </p>
                {VARIABLES.map((v) => (
                  <div key={v.token}>
                    <code className="text-xs bg-white border border-gray-200 rounded px-1.5 py-0.5 text-indigo-700 font-mono">
                      {v.token}
                    </code>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {v.description}
                    </p>
                  </div>
                ))}
              </div>

              {/* Autosave indicator */}
              <div className="flex-1 flex justify-end">
                {savedAt && (
                  <span className="text-xs text-green-600 font-medium">
                    Saved {savedAt}
                  </span>
                )}
              </div>
            </div>

            <TipTapEditor
              value={htmlBody}
              onChange={handleBodyChange}
              placeholder="Hi {{parent_name}}, we wanted to reach out about {{semester_name}}..."
              minHeight="300px"
            />
          </div>
        )}

        {/* Preview tab */}
        {activeTab === "preview" && (
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
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-100 p-6 flex justify-center">
                {previewMode === "desktop" ? (
                  <iframe
                    srcDoc={previewHtml}
                    title="Email preview"
                    className="rounded-lg border border-gray-200 bg-white"
                    style={{ width: "600px", height: "500px" }}
                    sandbox="allow-same-origin"
                  />
                ) : (
                  <IPhoneFrame>
                    <iframe
                      srcDoc={previewHtml}
                      title="Mobile email preview"
                      className="w-full h-full border-0"
                      style={{ width: "369px", height: "600px" }}
                      sandbox="allow-same-origin"
                    />
                  </IPhoneFrame>
                )}
              </div>
            ) : (
              <div className="border border-gray-200 rounded-xl p-10 text-sm text-gray-400 text-center">
                No email body yet. Add content in the Design tab.
              </div>
            )}

            <p className="text-xs text-gray-400">
              Variables replaced with mock data for preview.
            </p>
          </div>
        )}

        {/* Test Send tab */}
        {activeTab === "test" && (
          <div className="space-y-6 max-w-md">
            <p className="text-sm text-gray-500">
              Send a test email to verify rendering. Subject is prefixed with{" "}
              <span className="font-mono text-xs bg-gray-100 px-1 rounded">
                [TEST]
              </span>
              .
            </p>

            {/* Mode toggle */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Test data
              </label>
              <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 w-fit">
                <button
                  onClick={() => setTestMode("mock")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    testMode === "mock"
                      ? "bg-white border border-gray-200 shadow-sm text-gray-900"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Mock data
                </button>
                <button
                  onClick={() => setTestMode("family")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    testMode === "family"
                      ? "bg-white border border-gray-200 shadow-sm text-gray-900"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Real family
                </button>
              </div>
            </div>

            {/* Family picker */}
            {testMode === "family" &&
              (state.recipients?.resolvedFamilies?.length ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Family
                  </label>
                  <select
                    value={selectedFamilyId ?? ""}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedFamilyId(id || null);
                      const fam = state.recipients?.resolvedFamilies?.find(
                        (f) => f.familyId === id,
                      );
                      if (fam) setTestEmail(fam.primaryEmail);
                      setTestStatus("idle");
                    }}
                    className="w-full border border-gray-300 text-slate-600 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="">Select a family…</option>
                    {state.recipients.resolvedFamilies.map((f) => (
                      <option key={f.familyId} value={f.familyId}>
                        {f.primaryParentFirstName} {f.primaryParentLastName}
                        {f.dancers.length > 0
                          ? ` (${f.dancers.length} dancer${f.dancers.length !== 1 ? "s" : ""})`
                          : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  Add recipients in step 2 first to test with a real family.
                </p>
              ))}

            {/* Email address */}
            {(testMode === "mock" ||
              (testMode === "family" && selectedFamilyId)) && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Send to
                </label>
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => {
                    setTestEmail(e.target.value);
                    setTestStatus("idle");
                  }}
                  placeholder="you@example.com"
                  className="w-full border border-gray-300 text-slate-600 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            )}

            <button
              onClick={handleTestSend}
              disabled={
                !testEmail ||
                testStatus === "sending" ||
                (testMode === "family" && !selectedFamilyId)
              }
              className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testStatus === "sending" ? "Sending…" : "Send Test Email"}
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

      <div className="flex justify-between pt-6 border-t border-gray-200">
        <button
          onClick={onBack}
          className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
