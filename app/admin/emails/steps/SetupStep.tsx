"use client";

import { useState } from "react";
import { EmailDraft, EmailWizardAction } from "@/types";

type Props = {
  state: EmailDraft;
  dispatch: React.Dispatch<EmailWizardAction>;
  onNext: () => void;
};

export default function SetupStep({ state, dispatch, onNext }: Props) {
  const setup = state.setup;

  const [subject, setSubject] = useState(setup?.subject ?? "");
  const [senderName, setSenderName] = useState(setup?.senderName ?? "");
  const [senderEmail, setSenderEmail] = useState(setup?.senderEmail ?? "");
  const [replyToEmail, setReplyToEmail] = useState(setup?.replyToEmail ?? "");
  const [includeSignature, setIncludeSignature] = useState(
    setup?.includeSignature ?? false,
  );

  function syncToReducer(
    updates: Partial<NonNullable<EmailDraft["setup"]>> = {},
  ) {
    dispatch({
      type: "SET_SETUP",
      payload: {
        subject,
        senderName,
        senderEmail,
        replyToEmail: replyToEmail || undefined,
        includeSignature,
        ...updates,
      },
    });
  }

  function handleNext() {
    syncToReducer();
    onNext();
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Email Setup</h2>
        <p className="text-sm text-gray-500 mt-1">
          Configure the sender details and subject line.
        </p>
      </div>

      <div className="space-y-6 max-w-xl">
        {/* Subject */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            Subject <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              syncToReducer({ subject: e.target.value });
            }}
            placeholder="Important update from AYDT"
            className="w-full border border-gray-300 text-slate-500 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          <p className="text-xs text-gray-400">
            Variables:{" "}
            <code className="bg-gray-100 px-1 rounded">
              {"{{parent_name}}"}
            </code>{" "}
            <code className="bg-gray-100 px-1 rounded">
              {"{{semester_name}}"}
            </code>
          </p>
        </div>

        {/* Sender name */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            From Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={senderName}
            onChange={(e) => {
              setSenderName(e.target.value);
              syncToReducer({ senderName: e.target.value });
            }}
            placeholder="AYDT Admin"
            className="w-full border border-gray-300 text-slate-500 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        {/* Sender email */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            From Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={senderEmail}
            onChange={(e) => {
              setSenderEmail(e.target.value);
              syncToReducer({ senderEmail: e.target.value });
            }}
            placeholder="noreply@aydt.com"
            className="w-full border border-gray-300 text-slate-500 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        {/* Reply-to */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            Reply-To Email{" "}
            <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="email"
            value={replyToEmail}
            onChange={(e) => {
              setReplyToEmail(e.target.value);
              syncToReducer({ replyToEmail: e.target.value || undefined });
            }}
            placeholder="admin@aydt.com"
            className="w-full border border-gray-300 text-slate-500 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        {/* Signature toggle */}
        <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
          <div>
            <p className="text-sm font-medium text-gray-700">
              Include admin signature
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Appends your display name and signature HTML to every email.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={includeSignature}
            onClick={() => {
              const next = !includeSignature;
              setIncludeSignature(next);
              syncToReducer({ includeSignature: next });
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
              includeSignature ? "bg-indigo-600" : "bg-gray-200"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                includeSignature ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="flex justify-end pt-6 border-t border-gray-200">
        <button
          onClick={handleNext}
          disabled={
            !subject.trim() || !senderName.trim() || !senderEmail.trim()
          }
          className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
