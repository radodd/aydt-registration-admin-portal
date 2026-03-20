"use client";

import { useEffect, useRef, useState } from "react";
import { SemesterDraft, SemesterAction, WaitlistConfig } from "@/types";
import TipTapEditor from "@/app/components/semester-flow/TipTapEditor";
import { autosaveSemesterField } from "../actions/autosaveSemesterField";
import { sendTestWaitlistEmail } from "../actions/sendTestWaitlistEmail";
import { wrapEmailLayout } from "@/utils/prepareEmailHtml";
import { ChevronDown, ChevronUp, GripVertical, Info } from "lucide-react";
import type { Editor } from "@tiptap/react";

type Props = {
  state: SemesterDraft;
  dispatch: React.Dispatch<SemesterAction>;
  onNext: () => void;
  onBack: () => void;
  isLocked?: boolean;
  semesterId?: string;
};

type TabKey = "settings" | "info" | "design";

const TOKENS = [
  { key: "{{participant_name}}",   label: "Participant name" },
  { key: "{{parent_name}}",        label: "Parent's name" },
  { key: "{{session_name}}",       label: "Session name" },
  { key: "{{hold_until_datetime}}", label: "Offer expiry date & time" },
  { key: "{{timezone}}",           label: "Timezone" },
  { key: "{{accept_link}}",        label: "Accept waitlist offer link" },
];

const MOCK_TOKENS: Record<string, string> = {
  "{{participant_name}}":    "Alex Johnson",
  "{{parent_name}}":         "Sarah Johnson",
  "{{session_name}}":        "Ballet Fundamentals",
  "{{hold_until_datetime}}": "February 24, 2026 at 3:00 PM",
  "{{timezone}}":            "Eastern Time",
  "{{accept_link}}":         "#",
};

const DEFAULT_WAITLIST: WaitlistConfig = {
  enabled: false,
  sessionSettings: {},
  inviteExpiryHours: 48,
  stopDaysBeforeClose: 3,
  invitationEmail: { subject: "", fromName: "", fromEmail: "", htmlBody: "" },
};

function applyTokens(html: string): string {
  let result = html;
  for (const [token, value] of Object.entries(MOCK_TOKENS)) {
    result = result.replaceAll(token, value);
  }
  return result;
}

function buildPreviewHtml(html: string): string {
  return wrapEmailLayout(applyTokens(html)).replace(
    "</head>",
    `<style>
      body { overflow-x: hidden !important; }
      td, th, p, li, div, span, a {
        word-break: break-word !important;
        overflow-wrap: anywhere !important;
      }
    </style></head>`,
  );
}

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

  const [activeTab, setActiveTab] = useState<TabKey>("settings");
  const [tokenBarExpanded, setTokenBarExpanded] = useState(false);

  // Settings
  const [enabled, setEnabled] = useState(waitlist.enabled);
  const [sessionSettings, setSessionSettings] = useState(waitlist.sessionSettings ?? {});
  const [inviteExpiryHours, setInviteExpiryHours] = useState(String(waitlist.inviteExpiryHours ?? 48));
  const [stopDaysBeforeClose, setStopDaysBeforeClose] = useState(String(waitlist.stopDaysBeforeClose ?? 3));

  // Email fields
  const [subject, setSubject] = useState(waitlist.invitationEmail?.subject ?? "");
  const [fromName, setFromName] = useState(waitlist.invitationEmail?.fromName ?? "");
  const [fromEmail, setFromEmail] = useState(waitlist.invitationEmail?.fromEmail ?? "");
  const [htmlBody, setHtmlBody] = useState(waitlist.invitationEmail?.htmlBody ?? "");
  const [includeSignature, setIncludeSignature] = useState(waitlist.invitationEmail?.includeSignature ?? false);

  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"mobile" | "desktop">("mobile");
  const [draggingToken, setDraggingToken] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [testError, setTestError] = useState<string | null>(null);

  const editorRef = useRef<Editor | null>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* -------------------------------------------------------------------------- */
  /* Build config + sync                                                        */
  /* -------------------------------------------------------------------------- */

  function buildConfig(overrides?: Partial<WaitlistConfig>): WaitlistConfig {
    return {
      enabled,
      sessionSettings,
      inviteExpiryHours: Number(inviteExpiryHours) || 48,
      stopDaysBeforeClose: Number(stopDaysBeforeClose) || 3,
      invitationEmail: { subject, fromName, fromEmail, htmlBody, includeSignature },
      ...overrides,
    };
  }

  function syncToReducer(overrides?: Partial<WaitlistConfig>) {
    dispatch({ type: "SET_WAITLIST", payload: buildConfig(overrides) });
  }

  /* -------------------------------------------------------------------------- */
  /* Debounced autosave                                                         */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    if (activeTab !== "design" || !semesterId || isLocked) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      try {
        await autosaveSemesterField(semesterId, "waitlist_settings", buildConfig());
        setSavedAt(new Date().toLocaleTimeString());
        setTimeout(() => setSavedAt(null), 3000);
      } catch { /* silent */ }
    }, 8000);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [htmlBody, subject, fromName, fromEmail, activeTab]);

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

  function handleEmailInfoChange<K extends "subject" | "fromName" | "fromEmail">(key: K, value: string) {
    if (key === "subject") setSubject(value);
    if (key === "fromName") setFromName(value);
    if (key === "fromEmail") setFromEmail(value);
    syncToReducer({
      invitationEmail: {
        subject:   key === "subject"   ? value : subject,
        fromName:  key === "fromName"  ? value : fromName,
        fromEmail: key === "fromEmail" ? value : fromEmail,
        htmlBody,
      },
    });
  }

  function handleInsertToken(token: string) {
    if (activeTab === "design" && editorRef.current) {
      editorRef.current.chain().focus().insertContent(token).run();
    } else if (activeTab === "info") {
      const input = subjectRef.current;
      if (!input) return;
      const start = input.selectionStart ?? subject.length;
      const end = input.selectionEnd ?? start;
      const newValue = subject.slice(0, start) + token + subject.slice(end);
      handleEmailInfoChange("subject", newValue);
      const newPos = start + token.length;
      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(newPos, newPos);
      });
    }
  }

  function handleDragStart(e: React.DragEvent, token: string) {
    e.dataTransfer.setData("text/plain", token);
    e.dataTransfer.effectAllowed = "copy";
    setDraggingToken(token);
  }

  function handleDragEnd() {
    setDraggingToken(null);
  }

  async function handleTestSend() {
    if (!semesterId || !testEmail) return;
    setTestStatus("sending");
    setTestError(null);
    try {
      await autosaveSemesterField(semesterId, "waitlist_settings", buildConfig());
    } catch { /* best-effort */ }
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
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--admin-page-bg)" }}>

      {/* ── Locked banner ─────────────────────────────────────────────── */}
      {isLocked && (
        <div className="shrink-0 mx-6 mt-3 rounded-xl bg-mauve/10 border border-mauve px-4 py-3 text-sm text-mauve-text">
          This semester has active registrations. Waitlist settings are locked.
        </div>
      )}

      {/* ── Tab bar + tokens toggle ───────────────────────────────────── */}
      <div className="shrink-0 bg-white border-b border-neutral-200 px-4 flex items-center justify-between relative">
        <div className="flex gap-1">
          {(["settings", "info", "design"] as TabKey[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px ${
                activeTab === tab
                  ? "border-primary-600 text-primary-600"
                  : "border-transparent text-neutral-500 hover:text-neutral-700"
              }`}
            >
              {tab === "settings" ? "Settings" : tab === "info" ? "Template info" : "Design"}
            </button>
          ))}
        </div>

        {/* Tokens dropdown — only relevant on info/design tabs */}
        {activeTab !== "settings" && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setTokenBarExpanded((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-neutral-50"
              style={{ color: tokenBarExpanded ? "#5B21B6" : "var(--admin-text-faint)" }}
            >
              <span
                className="font-mono text-[10px] font-bold rounded px-1 py-0.5"
                style={{ background: "#EDE9FE", color: "#5B21B6" }}
              >
                {"{ }"}
              </span>
              Tokens
              {tokenBarExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>

            {tokenBarExpanded && (
              <div
                className="absolute right-0 top-full mt-1 z-50 bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden"
                style={{ width: 440 }}
              >
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-700">
                  <Info size={12} className="shrink-0 text-blue-500" />
                  Drag a token into the subject line or email body.
                </div>
                <div className="grid grid-cols-2">
                  {TOKENS.map((token, i) => (
                    <div
                      key={token.key}
                      draggable
                      onDragStart={(e) => handleDragStart(e, token.key)}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center gap-2 px-3 py-2 transition-colors select-none
                        ${i % 2 !== 1 ? "border-r border-neutral-100" : ""}
                        ${i >= 2 ? "border-t border-neutral-100" : ""}
                        ${draggingToken === token.key ? "bg-violet-50 opacity-60" : "hover:bg-neutral-50 cursor-grab active:cursor-grabbing"}`}
                    >
                      <GripVertical size={12} className="text-neutral-300 shrink-0" />
                      <span
                        className="font-mono text-[10px] font-medium rounded px-1.5 py-0.5 shrink-0 whitespace-nowrap"
                        style={{ background: "#EDE9FE", color: "#5B21B6" }}
                      >
                        {token.key}
                      </span>
                      <div className="relative flex items-center group/info">
                        <Info size={11} className="text-neutral-400 group-hover/info:text-neutral-600 transition-colors cursor-default shrink-0" />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none opacity-0 group-hover/info:opacity-100 transition-opacity">
                          <div className="bg-neutral-900 text-white text-[11px] rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg">
                            {token.label}
                          </div>
                          <div className="w-2 h-2 bg-neutral-900 rotate-45 mx-auto -mt-1" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Content ───────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">

        {/* ── Settings tab ──────────────────────────────────────────── */}
        {activeTab === "settings" && (
          <div className="h-full overflow-y-auto p-6 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] flex flex-col items-center">
            <div className="w-full max-w-lg space-y-6">

              {/* Enable waitlist */}
              <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-6">
                <div className="flex items-center justify-between">
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
              </div>

              {enabled && (
                <>
                  {/* Timing settings */}
                  <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-6 space-y-5">
                    <p className="text-sm font-semibold text-neutral-700">Timing</p>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-neutral-700">Invitation expires after</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          value={inviteExpiryHours}
                          onChange={(e) => handleExpiryChange(e.target.value)}
                          disabled={isLocked}
                          className="w-24 border border-neutral-300 rounded-xl px-3 py-2 text-sm text-slate-700 focus:ring-2 focus:ring-primary-600 focus:outline-none disabled:bg-neutral-50 disabled:text-neutral-400"
                        />
                        <span className="text-sm text-neutral-500">hours</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-neutral-700">Stop sending invites</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          value={stopDaysBeforeClose}
                          onChange={(e) => handleStopDaysChange(e.target.value)}
                          disabled={isLocked}
                          className="w-24 border border-neutral-300 rounded-xl px-3 py-2 text-sm text-slate-700 focus:ring-2 focus:ring-primary-600 focus:outline-none disabled:bg-neutral-50 disabled:text-neutral-400"
                        />
                        <span className="text-sm text-neutral-500">days before registration closes</span>
                      </div>
                    </div>
                  </div>

                  {/* Per-session toggles */}
                  <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-6 space-y-4">
                    <p className="text-sm font-semibold text-neutral-700">Per-session waitlist</p>
                    {appliedSessions.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-neutral-200 p-4 text-sm text-neutral-400">
                        No sessions yet. Add sessions in the Classes &amp; Offerings step first.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {appliedSessions.map((session) => {
                          const sessionEnabled = sessionSettings[session.sessionId]?.enabled ?? true;
                          return (
                            <div
                              key={session.sessionId}
                              className="flex items-center justify-between border border-neutral-200 rounded-xl px-4 py-3"
                            >
                              <div>
                                <p className="text-sm font-medium text-neutral-900">{session.title}</p>
                                {session.registrationCloseAt ? (
                                  <p className="text-xs text-neutral-400 mt-0.5">
                                    Closes:{" "}
                                    {new Date(session.registrationCloseAt).toLocaleDateString("en-US", {
                                      month: "short", day: "numeric", year: "numeric",
                                      hour: "numeric", minute: "2-digit",
                                    })}
                                  </p>
                                ) : (
                                  <p className="text-xs text-mauve-text mt-0.5">No close date set</p>
                                )}
                              </div>
                              <button
                                type="button"
                                disabled={isLocked}
                                onClick={() => handleSessionToggle(session.sessionId, !sessionEnabled)}
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
          </div>
        )}

        {/* ── Template info tab ─────────────────────────────────────── */}
        {activeTab === "info" && (
          <div className="h-full overflow-y-auto p-6 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] flex flex-col items-center">
            <div className="w-full max-w-lg bg-white border border-neutral-200 rounded-2xl shadow-sm p-6 space-y-6">

              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700">Subject *</label>
                <input
                  ref={subjectRef}
                  type="text"
                  value={subject}
                  onChange={(e) => handleEmailInfoChange("subject", e.target.value)}
                  disabled={isLocked}
                  placeholder="You're off the waitlist — claim your spot!"
                  className="w-full border border-neutral-300 rounded-xl px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 focus:outline-none disabled:bg-neutral-50 disabled:text-neutral-400"
                />
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

              <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
                <div>
                  <p className="text-sm font-medium text-neutral-700">Include admin signature</p>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Appends your display name and signature to every waitlist invitation.
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={includeSignature}
                  disabled={isLocked}
                  onClick={() => {
                    const next = !includeSignature;
                    setIncludeSignature(next);
                    syncToReducer({ invitationEmail: { subject, fromName, fromEmail, htmlBody, includeSignature: next } });
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                    includeSignature ? "bg-primary-600" : "bg-neutral-200"
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
          </div>
        )}

        {/* ── Design tab ────────────────────────────────────────────── */}
        {activeTab === "design" && (
          <div className="flex h-full">

            {/* Editor column */}
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden border-r border-neutral-200">
              {savedAt && (
                <div
                  className="shrink-0 flex items-center justify-end px-4 py-1.5 border-b border-neutral-100"
                  style={{ background: "var(--admin-surface)" }}
                >
                  <span className="text-xs text-green-600 font-medium">Saved {savedAt}</span>
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-4 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
                <TipTapEditor
                  value={htmlBody}
                  onChange={handleBodyChange}
                  placeholder="Hi {{participant_name}}, a spot opened up in {{session_name}}! Click the link below to accept…"
                  minHeight="480px"
                  editorRef={editorRef}
                />
              </div>
            </div>

            {/* Preview column */}
            <div
              className="w-[380px] shrink-0 flex flex-col overflow-hidden"
              style={{ background: "var(--admin-page-bg)" }}
            >
              <div
                className="shrink-0 flex items-center justify-center px-4 py-2 border-b border-neutral-200"
                style={{ background: "var(--admin-surface)" }}
              >
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPreviewMode("mobile")}
                    className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                      previewMode === "mobile" ? "text-neutral-800 font-medium" : "text-neutral-400 hover:text-neutral-600"
                    }`}
                  >
                    Mobile
                  </button>
                  <span className="text-neutral-200 text-xs">/</span>
                  <button
                    onClick={() => setPreviewMode("desktop")}
                    className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                      previewMode === "desktop" ? "text-neutral-800 font-medium" : "text-neutral-400 hover:text-neutral-600"
                    }`}
                  >
                    Desktop
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto flex items-start justify-center p-5 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
                {htmlBody ? (
                  previewMode === "mobile" ? (
                    /* Phone mockup */
                    <div
                      className="shrink-0 relative"
                      style={{
                        width: 220, height: 440,
                        background: "#1a1a1a",
                        borderRadius: 34,
                        padding: "10px 6px",
                        boxShadow: "0 20px 50px rgba(0,0,0,0.35), inset 0 0 0 1.5px #3a3a3a",
                      }}
                    >
                      <div
                        className="absolute left-1/2 -translate-x-1/2"
                        style={{ top: 16, width: 54, height: 7, background: "#000", borderRadius: 4, zIndex: 2 }}
                      />
                      <div className="w-full h-full overflow-hidden" style={{ borderRadius: 26, background: "#fff" }}>
                        <div
                          className="flex items-center gap-1.5 px-2 py-1.5 border-b border-neutral-100"
                          style={{ background: "#f5f5f5" }}
                        >
                          <div className="flex gap-0.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                            <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                          </div>
                          <span className="flex-1 text-center truncate font-medium" style={{ fontSize: 7, color: "#555" }}>
                            Mail — AYDT Waitlist
                          </span>
                        </div>
                        <div style={{ width: 208, height: 402, overflow: "hidden", position: "relative" }}>
                          <iframe
                            scrolling="no"
                            srcDoc={buildPreviewHtml(htmlBody)}
                            title="Mobile waitlist email preview"
                            sandbox="allow-same-origin"
                            style={{
                              position: "absolute", top: 0, left: 0,
                              width: 600, height: 1160,
                              border: "none",
                              transform: "scale(0.3467)",
                              transformOrigin: "top left",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Desktop mockup */
                    <div
                      className="w-full overflow-hidden"
                      style={{
                        background: "#fff",
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                      }}
                    >
                      <div
                        className="flex items-center gap-1.5 px-3 py-2 border-b border-neutral-200"
                        style={{ background: "#f9f9f9" }}
                      >
                        <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                        <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                        <span className="flex-1 text-center font-medium truncate" style={{ fontSize: 10, color: "#888" }}>
                          {subject ? applyTokens(subject) : "AYDT Waitlist"}
                        </span>
                      </div>
                      <div className="px-3 py-2 border-b border-neutral-100" style={{ background: "#fafafa" }}>
                        <p className="font-semibold truncate" style={{ fontSize: 11, color: "#111" }}>
                          {subject ? applyTokens(subject) : "You're off the waitlist — claim your spot!"}
                        </p>
                        <p style={{ fontSize: 9, color: "#888" }} className="mt-0.5">
                          From: {fromName || "AYDT Registration"} &lt;{fromEmail || "noreply@aydt.com"}&gt;
                        </p>
                      </div>
                      <div style={{ height: 316, overflow: "hidden", position: "relative" }}>
                        <iframe
                          scrolling="no"
                          srcDoc={buildPreviewHtml(htmlBody)}
                          title="Desktop waitlist email preview"
                          sandbox="allow-same-origin"
                          style={{
                            position: "absolute", top: 0, left: 0,
                            width: 600, height: 580,
                            border: "none",
                            transform: "scale(0.5733)",
                            transformOrigin: "top left",
                          }}
                        />
                      </div>
                    </div>
                  )
                ) : (
                  <div className="text-center py-12">
                    <p className="text-sm text-neutral-400">No email body yet.</p>
                    <p className="text-xs text-neutral-300 mt-1">Add content in the editor to see a preview.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Persistent test send footer ───────────────────────────── */}
      <div
        className="shrink-0 flex items-center gap-3 px-6 py-3 border-t border-neutral-200"
        style={{ background: "var(--admin-surface)" }}
      >
        <span className="text-xs font-medium text-neutral-500 shrink-0">Test send</span>
        <span className="text-xs text-neutral-400 shrink-0">
          Uses mock data · Subject prefixed with{" "}
          <span className="font-mono bg-neutral-100 px-1 rounded">[TEST]</span>
        </span>
        <div className="flex-1" />
        {testStatus === "sent" && (
          <span className="text-xs font-medium text-green-600 shrink-0">Sent successfully</span>
        )}
        {testStatus === "error" && (
          <span className="text-xs font-medium text-red-600 shrink-0">
            {testError ?? "Send failed"}
          </span>
        )}
        <input
          type="email"
          value={testEmail}
          onChange={(e) => { setTestEmail(e.target.value); setTestStatus("idle"); }}
          placeholder="you@example.com"
          className="w-52 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 focus:outline-none"
        />
        <button
          onClick={handleTestSend}
          disabled={!testEmail || testStatus === "sending" || !semesterId}
          className="px-4 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {testStatus === "sending" ? "Sending…" : "Send test"}
        </button>
      </div>
    </div>
  );
}
