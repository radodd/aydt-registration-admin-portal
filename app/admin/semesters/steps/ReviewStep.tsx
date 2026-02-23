"use client";

import { HydratedDiscount, SemesterDraft } from "@/types";
import { useEffect, useState } from "react";
import { getDiscounts } from "@/queries/admin";
import RegistrationFormRenderer from "@/app/components/semester-flow/RegistrationFormRender";

type ReviewStepProps = {
  state: SemesterDraft;
  onBack: () => void;
  onPublishNow: () => void;
  onSaveDraft: () => void;
  onSchedule: (publishAt: string) => void;
};

type TabKey =
  | "details"
  | "sessions"
  | "sessionGroups"
  | "payment"
  | "discounts"
  | "registrationForm"
  | "confirmationEmail"
  | "waitlist";

const TABS: { key: TabKey; label: string }[] = [
  { key: "details", label: "Details" },
  { key: "sessions", label: "Sessions" },
  { key: "sessionGroups", label: "Session Groups" },
  { key: "payment", label: "Payment" },
  { key: "discounts", label: "Discounts" },
  { key: "registrationForm", label: "Registration Form" },
  { key: "confirmationEmail", label: "Confirmation Email" },
  { key: "waitlist", label: "Waitlist" },
];

export default function ReviewStep({
  state,
  onBack,
  onPublishNow,
  onSaveDraft,
  onSchedule,
}: ReviewStepProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("details");
  const [scheduledDate, setScheduledDate] = useState<string>("");
  const [allDiscounts, setAllDiscounts] = useState<HydratedDiscount[]>([]);

  useEffect(() => {
    let active = true;
    getDiscounts().then((data) => {
      if (active) setAllDiscounts(data ?? []);
    });
    return () => {
      active = false;
    };
  }, []);

  /*
   |--------------------------------------------------------------------------
   | Safe Normalization
   |--------------------------------------------------------------------------
   */

  const safeDetails = state.details;
  const safeSessions = state.sessions?.appliedSessions ?? [];
  const safePayment = state.paymentPlan;
  const safeSessionGroups = state.sessionGroups?.groups ?? [];

  /*
   |--------------------------------------------------------------------------
   | Discount Lookup
   |--------------------------------------------------------------------------
   */

  const appliedDiscountIds =
    state.discounts?.appliedDiscounts.map((d) => d.discountId) ?? [];

  const reviewDiscounts = allDiscounts.filter((d) =>
    appliedDiscountIds.includes(d.id),
  );

  /*
   |--------------------------------------------------------------------------
   | Tab Content
   |--------------------------------------------------------------------------
   */

  function renderTabContent() {
    switch (activeTab) {
      case "details":
        return safeDetails ? (
          <div className="border border-gray-200 rounded-xl p-4 text-sm space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500">Name</span>
              <span className="font-medium text-gray-900">
                {safeDetails.name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Attendance Tracking</span>
              <span className="font-medium text-gray-900">
                {safeDetails.trackingMode ? "Enabled" : "Disabled"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Capacity Warning Threshold</span>
              <span className="font-medium text-gray-900">
                {safeDetails.capacityWarningThreshold ?? 0}%
              </span>
            </div>
          </div>
        ) : (
          <EmptyState message="No semester details configured." />
        );

      case "sessions":
        return safeSessions.length > 0 ? (
          <div className="space-y-4">
            {safeSessions.map((s) => {
              const days = s.overriddenDaysOfWeek ?? s.daysOfWeek;
              const type = s.overriddenType ?? s.type;
              const capacity = s.overriddenCapacity ?? s.capacity;
              const hasOverrides =
                s.overriddenDaysOfWeek ||
                s.overriddenType ||
                s.overriddenCapacity ||
                s.overriddenTitle;

              return (
                <div
                  key={s.sessionId}
                  className="border border-gray-200 rounded-xl p-4 space-y-1"
                >
                  <div className="font-medium text-gray-900">
                    {s.overriddenTitle ?? s.title}
                  </div>
                  <div className="text-sm text-gray-500">
                    {s.startDate} → {s.endDate} · {days?.join(", ")}
                  </div>
                  <div className="text-sm text-gray-500">
                    Type: {type} · Capacity: {capacity}
                  </div>
                  {s.registrationCloseAt && (
                    <div className="text-xs text-gray-400">
                      Registration closes:{" "}
                      {new Date(s.registrationCloseAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                  )}
                  {hasOverrides && (
                    <div className="text-xs font-medium text-indigo-600">
                      Overrides applied
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState message="No sessions added." />
        );

      case "sessionGroups":
        return safeSessionGroups.length > 0 ? (
          <div className="space-y-4">
            {safeSessionGroups.map((group) => (
              <div
                key={group.id}
                className="border border-gray-200 rounded-xl p-4 space-y-1"
              >
                <div className="font-medium text-gray-900">{group.name}</div>
                <div className="text-sm text-gray-500">
                  Sessions: {group.sessionIds.length}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="No session groups configured." />
        );

      case "payment":
        return safePayment ? (
          <div className="border border-gray-200 rounded-xl p-4 text-sm space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Type</span>
              <span className="font-medium bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full text-xs capitalize">
                {safePayment.type.replaceAll("_", " ")}
              </span>
            </div>
            {safePayment.depositAmount != null && (
              <div className="flex justify-between">
                <span className="text-gray-500">Deposit Amount</span>
                <span className="font-medium text-gray-900">
                  ${safePayment.depositAmount.toFixed(2)}
                </span>
              </div>
            )}
            {safePayment.depositPercent != null && (
              <div className="flex justify-between">
                <span className="text-gray-500">Deposit Percent</span>
                <span className="font-medium text-gray-900">
                  {safePayment.depositPercent}%
                </span>
              </div>
            )}
            {safePayment.installmentCount && (
              <div className="flex justify-between">
                <span className="text-gray-500">Installments</span>
                <span className="font-medium text-gray-900">
                  {safePayment.installmentCount}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Due Date</span>
              <span className="font-medium text-gray-900">
                {safePayment.dueDate}
              </span>
            </div>
          </div>
        ) : (
          <EmptyState message="No payment plan configured." />
        );

      case "discounts":
        return reviewDiscounts.length > 0 ? (
          <div className="space-y-4">
            {reviewDiscounts.map((d) => {
              const selectedSessionNames =
                d.eligible_sessions_mode === "selected"
                  ? (d.discount_rule_sessions?.map(
                      (s) => s.sessions?.title ?? "Unknown session",
                    ) ?? [])
                  : [];

              return (
                <div
                  key={d.id}
                  className="border border-gray-200 rounded-xl p-4 space-y-2"
                >
                  <div className="font-medium text-gray-900">{d.name}</div>
                  <div className="text-sm text-gray-500 capitalize">
                    Category: {d.category.replaceAll("_", " ")}
                  </div>
                  <div className="text-sm text-gray-500">
                    Applies to:{" "}
                    {d.eligible_sessions_mode === "all"
                      ? "All sessions"
                      : "Selected sessions"}
                  </div>
                  {selectedSessionNames.length > 0 && (
                    <div className="text-sm text-gray-500">
                      Sessions: {selectedSessionNames.join(", ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState message="No discounts applied." />
        );

      case "registrationForm":
        return state.registrationForm?.elements?.length ? (
          <RegistrationFormRenderer
            elements={state.registrationForm.elements}
            sessions={state.sessions?.appliedSessions ?? []}
            mode="preview"
          />
        ) : (
          <EmptyState message="No registration form configured." />
        );

      case "confirmationEmail": {
        const email = state.confirmationEmail;
        if (!email?.subject && !email?.htmlBody) {
          return <EmptyState message="No confirmation email configured." />;
        }
        return (
          <div className="space-y-4 text-sm">
            {email?.subject && (
              <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">Subject</span>
                  <span className="font-medium text-gray-900">{email.subject}</span>
                </div>
                {email.fromName && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">From Name</span>
                    <span className="font-medium text-gray-900">{email.fromName}</span>
                  </div>
                )}
                {email.fromEmail && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">From Email</span>
                    <span className="font-medium text-gray-900">{email.fromEmail}</span>
                  </div>
                )}
              </div>
            )}
            {email?.htmlBody && (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                  Email body preview
                </div>
                <div className="p-4">
                  <iframe
                    srcDoc={email.htmlBody}
                    title="Email preview"
                    className="w-full rounded border border-gray-100"
                    style={{ height: "320px" }}
                    sandbox="allow-same-origin"
                  />
                </div>
              </div>
            )}
          </div>
        );
      }

      case "waitlist": {
        const waitlist = state.waitlist;
        if (!waitlist) {
          return <EmptyState message="No waitlist configuration. Waitlist is disabled." />;
        }
        return (
          <div className="space-y-4 text-sm">
            <div className="border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span
                  className={`font-medium px-2 py-0.5 rounded-full text-xs ${
                    waitlist.enabled
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {waitlist.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              {waitlist.enabled && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Invite Expiry</span>
                    <span className="font-medium text-gray-900">
                      {waitlist.inviteExpiryHours} hours
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Stop Invites Before Close</span>
                    <span className="font-medium text-gray-900">
                      {waitlist.stopDaysBeforeClose} day
                      {waitlist.stopDaysBeforeClose !== 1 ? "s" : ""}
                    </span>
                  </div>
                </>
              )}
            </div>

            {waitlist.enabled && safeSessions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Per-Session Status
                </p>
                {safeSessions.map((s) => {
                  const sessionEnabled =
                    waitlist.sessionSettings?.[s.sessionId]?.enabled ?? true;
                  return (
                    <div
                      key={s.sessionId}
                      className="flex justify-between items-center border border-gray-200 rounded-xl px-4 py-2.5"
                    >
                      <div>
                        <span className="font-medium text-gray-900">
                          {s.overriddenTitle ?? s.title}
                        </span>
                        {s.registrationCloseAt && (
                          <span className="text-xs text-gray-400 ml-2">
                            · closes{" "}
                            {new Date(s.registrationCloseAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          sessionEnabled
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {sessionEnabled ? "On" : "Off"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {waitlist.invitationEmail?.subject && (
              <div className="border border-gray-200 rounded-xl p-4 space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Invitation Email
                </p>
                <div className="flex justify-between">
                  <span className="text-gray-500">Subject</span>
                  <span className="font-medium text-gray-900 text-right max-w-xs truncate">
                    {waitlist.invitationEmail.subject}
                  </span>
                </div>
                {waitlist.invitationEmail.fromName && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">From</span>
                    <span className="font-medium text-gray-900">
                      {waitlist.invitationEmail.fromName}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }
    }
  }

  /*
   |--------------------------------------------------------------------------
   | Render
   |--------------------------------------------------------------------------
   */

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-8">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Review & Publish
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Confirm all semester details before publishing.
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="min-h-[200px]">{renderTabContent()}</div>

        {/* Actions — always visible */}
        <div className="flex flex-col gap-4 pt-6 border-t border-gray-200">
          <div className="flex justify-between">
            <button
              onClick={onBack}
              className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              Back
            </button>

            <div className="flex gap-3">
              <button
                onClick={onSaveDraft}
                className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                Save as Draft
              </button>

              <button
                onClick={onPublishNow}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition"
              >
                Publish Now
              </button>
            </div>
          </div>

          {/* Schedule Publish */}
          <div className="flex items-center gap-3">
            <input
              type="datetime-local"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-xl text-sm"
            />

            <button
              disabled={!scheduledDate}
              onClick={() => onSchedule(scheduledDate)}
              className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
            >
              Schedule Publish
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="border border-gray-200 rounded-xl p-6 text-sm text-gray-400">
      {message}
    </div>
  );
}
