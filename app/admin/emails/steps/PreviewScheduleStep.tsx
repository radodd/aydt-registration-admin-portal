"use client";

import { useState } from "react";
import { EmailDraft, EmailWizardAction } from "@/types";
import { scheduleEmail } from "../actions/scheduleEmail";
import { sendEmailNow } from "../actions/sendEmailNow";
import { useRouter } from "next/navigation";
import IPhoneFrame from "@/app/components/email/IPhoneFrame";
import { applyMockTokens } from "@/utils/resolveEmailVariables";

type Props = {
  state: EmailDraft;
  dispatch: React.Dispatch<EmailWizardAction>;
  onBack: () => void;
  emailId: string;
  isSuperAdmin: boolean;
  adminSignatureHtml?: string | null;
};

type SendMode = "now" | "scheduled";
type ActionStatus = "idle" | "loading" | "success" | "error";

export default function PreviewScheduleStep({
  state,
  onBack,
  emailId,
  isSuperAdmin,
  adminSignatureHtml = null,
}: Props) {
  const router = useRouter();
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">(
    "desktop",
  );
  const [sendMode, setSendMode] = useState<SendMode>("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [actionStatus, setActionStatus] = useState<ActionStatus>("idle");
  const [actionError, setActionError] = useState<string | null>(null);

  const htmlBody = state.design?.bodyHtml ?? "";
  const recipientCount = state.recipients?.resolvedCount ?? 0;
  const subject = state.setup?.subject ?? "(no subject)";
  const includeSignature = state.setup?.includeSignature ?? false;

  function injectSignature(html: string, signatureHtml: string): string {
    const sig = `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;">${signatureHtml}</div>`;
    const closeBody = html.lastIndexOf("</body>");
    if (closeBody !== -1) return html.slice(0, closeBody) + sig + html.slice(closeBody);
    return html + sig;
  }

  const resolvedBody = applyMockTokens(htmlBody);
  const previewHtml =
    includeSignature && adminSignatureHtml
      ? injectSignature(resolvedBody, adminSignatureHtml)
      : resolvedBody;

  async function handleSend() {
    setActionStatus("loading");
    setActionError(null);
    try {
      if (sendMode === "now") {
        await sendEmailNow(emailId, state);
      } else {
        if (!scheduledAt) {
          setActionError("Please select a scheduled date and time.");
          setActionStatus("idle");
          return;
        }
        await scheduleEmail(emailId, new Date(scheduledAt).toISOString(), state);
      }
      setActionStatus("success");
      setTimeout(() => router.push("/admin/emails"), 1500);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed");
      setActionStatus("error");
    }
  }

  // Minimum datetime: now + 5 minutes
  const minDatetime = new Date(Date.now() + 5 * 60 * 1000)
    .toISOString()
    .slice(0, 16);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">
          Preview &amp; Schedule
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Review your email and choose when to send it.
        </p>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            Subject
          </p>
          <p className="text-sm text-gray-900 mt-1 font-medium truncate">
            {subject}
          </p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            From
          </p>
          <p className="text-sm text-gray-900 mt-1 font-medium truncate">
            {state.setup?.senderName
              ? `${state.setup.senderName} <${state.setup.senderEmail}>`
              : state.setup?.senderEmail ?? "—"}
          </p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            Recipients
          </p>
          <p className="text-sm text-gray-900 mt-1 font-semibold">
            {recipientCount.toLocaleString()}
          </p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            Groups
          </p>
          <p className="text-sm text-gray-900 mt-1 font-medium">
            {(state.recipients?.selections?.length ?? 0) +
              (state.recipients?.manualAdditions?.length ?? 0)}{" "}
            selected
          </p>
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700">Email Preview</p>
          <div className="flex gap-2">
            <button
              onClick={() => setPreviewMode("desktop")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                previewMode === "desktop"
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              Desktop
            </button>
            <button
              onClick={() => setPreviewMode("mobile")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                previewMode === "mobile"
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              Mobile
            </button>
          </div>
        </div>

        {htmlBody ? (
          <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-100 p-6 flex justify-center">
            {previewMode === "desktop" ? (
              <iframe
                srcDoc={previewHtml}
                title="Email preview"
                className="rounded-lg border border-gray-200 bg-white"
                style={{ width: "600px", height: "520px" }}
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
            No email body. Go back to the Design step to add content.
          </div>
        )}
      </div>

      {/* Send / Schedule section */}
      {isSuperAdmin ? (
        <div className="space-y-5 border-t border-gray-200 pt-6">
          <p className="text-sm font-medium text-gray-700">Send options</p>

          <div className="flex gap-4 flex-wrap">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="sendMode"
                value="now"
                checked={sendMode === "now"}
                onChange={() => setSendMode("now")}
                className="accent-indigo-600"
              />
              <span className="text-sm text-gray-700">Send now</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="sendMode"
                value="scheduled"
                checked={sendMode === "scheduled"}
                onChange={() => setSendMode("scheduled")}
                className="accent-indigo-600"
              />
              <span className="text-sm text-gray-700">Schedule for later</span>
            </label>
          </div>

          {sendMode === "scheduled" && (
            <div className="space-y-2 max-w-xs">
              <label className="text-sm font-medium text-gray-700">
                Send date &amp; time
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                min={minDatetime}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <p className="text-xs text-gray-400">
                Times are in your local timezone.
              </p>
            </div>
          )}

          {actionError && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {actionError}
            </div>
          )}

          {actionStatus === "success" && (
            <div className="px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
              {sendMode === "now"
                ? "Email is being sent. Redirecting…"
                : "Email scheduled successfully. Redirecting…"}
            </div>
          )}

          {recipientCount === 0 && (
            <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
              No recipients selected. Go back to the Recipients step to add
              some.
            </div>
          )}
        </div>
      ) : (
        <div className="border-t border-gray-200 pt-6">
          <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600">
            Only Super Admins can send or schedule emails. Save your draft and
            ask a Super Admin to review and send.
          </div>
        </div>
      )}

      <div className="flex justify-between pt-2 border-t border-gray-200">
        <button
          onClick={onBack}
          disabled={actionStatus === "loading" || actionStatus === "success"}
          className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition disabled:opacity-40"
        >
          Back
        </button>

        {isSuperAdmin && (
          <button
            onClick={handleSend}
            disabled={
              actionStatus === "loading" ||
              actionStatus === "success" ||
              recipientCount === 0 ||
              (sendMode === "scheduled" && !scheduledAt)
            }
            className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {actionStatus === "loading"
              ? "Processing…"
              : sendMode === "now"
                ? "Send Now"
                : "Schedule Email"}
          </button>
        )}
      </div>
    </div>
  );
}
