"use client";

import { HydratedDiscount, SemesterDraft } from "@/types";
import { useEffect, useState } from "react";
import { getDiscounts } from "@/queries/admin";
import RegistrationFormRenderer from "@/app/components/semester-flow/RegistrationFormRender";

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

type SemesterTabsProps = {
  data: SemesterDraft;
  /** Optional slot rendered after the tab content area — used by ReviewStep for publish actions. */
  publishActions?: React.ReactNode;
};

export default function SemesterTabs({ data, publishActions }: SemesterTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("details");
  const [allDiscounts, setAllDiscounts] = useState<HydratedDiscount[]>([]);

  useEffect(() => {
    let active = true;
    getDiscounts().then((result) => {
      if (active) setAllDiscounts(result ?? []);
    });
    return () => { active = false; };
  }, []);

  const safeDetails = data.details;
  const safeClasses = data.sessions?.classes ?? [];
  const safePayment = data.paymentPlan;
  const safeSessionGroups = data.sessionGroups?.groups ?? [];

  const appliedDiscountIds =
    data.discounts?.appliedDiscounts.map((d) => d.discountId) ?? [];
  const appliedDiscounts = allDiscounts.filter((d) =>
    appliedDiscountIds.includes(d.id),
  );

  function renderTabContent() {
    switch (activeTab) {
      /* ---------------------------------------------------------------------- */
      /* Details                                                                 */
      /* ---------------------------------------------------------------------- */
      case "details":
        return safeDetails ? (
          <div className="border border-gray-200 rounded-xl p-4 text-sm space-y-3">
            <Row label="Name" value={safeDetails.name} />
            <Row
              label="Attendance Tracking"
              value={safeDetails.trackingMode ? "Enabled" : "Disabled"}
            />
            <Row
              label="Capacity Warning Threshold"
              value={`${safeDetails.capacityWarningThreshold ?? 0}%`}
            />
            {safeDetails.publishAt && (
              <Row
                label="Scheduled Publish"
                value={new Date(safeDetails.publishAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              />
            )}
          </div>
        ) : (
          <EmptyState message="No semester details configured." />
        );

      /* ---------------------------------------------------------------------- */
      /* Sessions                                                                */
      /* ---------------------------------------------------------------------- */
      case "sessions":
        return safeClasses.length > 0 ? (
          <div className="space-y-4">
            {safeClasses.map((cls) => (
              <div
                key={cls.id ?? cls.name}
                className="border border-gray-200 rounded-xl p-4 space-y-2"
              >
                <div className="font-medium text-gray-900">{cls.name}</div>
                <div className="text-sm text-gray-500 capitalize">
                  {cls.discipline.replace(/_/g, " ")} · {cls.division}
                  {cls.level ? ` · ${cls.level}` : ""}
                </div>
                <div className="space-y-1 pt-1">
                  {(cls.schedules ?? []).map((cs, i) => (
                    <div key={cs.id ?? i} className="text-sm text-gray-500">
                      {cs.daysOfWeek
                        .map((d) => d.charAt(0).toUpperCase() + d.slice(1))
                        .join(", ")}
                      {cs.startTime ? ` · ${cs.startTime}` : ""}
                      {cs.endTime ? ` – ${cs.endTime}` : ""}
                      {cs.capacity != null ? ` · Cap: ${cs.capacity}` : ""}
                      {cs.registrationCloseAt && (
                        <span className="text-xs text-gray-400 ml-1">
                          · closes{" "}
                          {new Date(cs.registrationCloseAt).toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric", year: "numeric" },
                          )}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="No classes added." />
        );

      /* ---------------------------------------------------------------------- */
      /* Session Groups                                                          */
      /* ---------------------------------------------------------------------- */
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
                  {group.sessionIds.length} session
                  {group.sessionIds.length !== 1 ? "s" : ""}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="No session groups configured." />
        );

      /* ---------------------------------------------------------------------- */
      /* Payment                                                                 */
      /* ---------------------------------------------------------------------- */
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
              <Row
                label="Deposit Amount"
                value={`$${safePayment.depositAmount.toFixed(2)}`}
              />
            )}
            {safePayment.depositPercent != null && (
              <Row
                label="Deposit Percent"
                value={`${safePayment.depositPercent}%`}
              />
            )}
            {safePayment.installmentCount && (
              <Row
                label="Installments"
                value={String(safePayment.installmentCount)}
              />
            )}
            <Row label="Due Date" value={safePayment.dueDate} />
          </div>
        ) : (
          <EmptyState message="No payment plan configured." />
        );

      /* ---------------------------------------------------------------------- */
      /* Discounts                                                               */
      /* ---------------------------------------------------------------------- */
      case "discounts":
        return appliedDiscounts.length > 0 ? (
          <div className="space-y-5">
            {appliedDiscounts.map((d) => {
              const selectedSessionIds =
                d.eligible_sessions_mode === "selected"
                  ? (d.discount_rule_sessions?.map((s) => s.session_id) ?? [])
                  : [];

              return (
                <div
                  key={d.id}
                  className="border border-gray-200 rounded-2xl p-5 space-y-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-base font-semibold text-gray-900">
                        {d.name}
                      </div>
                      <div className="text-sm text-gray-500 capitalize">
                        {d.category.replaceAll("_", " ")}
                      </div>
                    </div>
                    <span className="text-xs px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 font-medium">
                      {d.eligible_sessions_mode === "all"
                        ? "All sessions"
                        : "Selected sessions"}
                    </span>
                  </div>

                  {(d.discount_rules?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-gray-700">
                        Rules
                      </div>
                      <div className="space-y-1 text-sm text-gray-600">
                        {d.discount_rules!.map((rule, i) => {
                          const unit =
                            rule.threshold_unit === "person"
                              ? "people"
                              : "sessions";
                          const value =
                            rule.value_type === "percent"
                              ? `${rule.value}% off`
                              : `$${rule.value} off`;
                          return (
                            <div key={i}>
                              {rule.threshold}+ {unit} → {value}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {selectedSessionIds.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-gray-700">
                        Applies To
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedSessionIds.map((sid, i) => (
                          <span
                            key={i}
                            className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-700"
                          >
                            {sid}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {d.recipient_scope && (
                    <div className="text-sm text-gray-500 capitalize">
                      Recipient: {d.recipient_scope.replaceAll("_", " ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState message="No discounts applied." />
        );

      /* ---------------------------------------------------------------------- */
      /* Registration Form                                                       */
      /* ---------------------------------------------------------------------- */
      case "registrationForm":
        return data.registrationForm?.elements?.length ? (
          <RegistrationFormRenderer
            elements={data.registrationForm.elements}
            sessions={(data.sessions?.classes ?? []).flatMap((cls) =>
              (cls.schedules ?? []).map((cs) => ({ sessionId: cs.id ?? "" })),
            )}
            mode="preview"
          />
        ) : (
          <EmptyState message="No registration form configured." />
        );

      /* ---------------------------------------------------------------------- */
      /* Confirmation Email                                                      */
      /* ---------------------------------------------------------------------- */
      case "confirmationEmail": {
        const email = data.confirmationEmail;
        if (!email?.subject && !email?.htmlBody) {
          return <EmptyState message="No confirmation email configured." />;
        }
        return (
          <div className="space-y-4 text-sm">
            {email?.subject && (
              <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                <Row label="Subject" value={email.subject} />
                {email.fromName && <Row label="From Name" value={email.fromName} />}
                {email.fromEmail && <Row label="From Email" value={email.fromEmail} />}
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

      /* ---------------------------------------------------------------------- */
      /* Waitlist                                                                */
      /* ---------------------------------------------------------------------- */
      case "waitlist": {
        const waitlist = data.waitlist;
        if (!waitlist) {
          return (
            <EmptyState message="No waitlist configuration. Waitlist is disabled." />
          );
        }
        return (
          <div className="space-y-4 text-sm">
            <div className="border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
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
                  <Row
                    label="Invite Expiry"
                    value={`${waitlist.inviteExpiryHours} hours`}
                  />
                  <Row
                    label="Stop Invites Before Close"
                    value={`${waitlist.stopDaysBeforeClose} day${
                      waitlist.stopDaysBeforeClose !== 1 ? "s" : ""
                    }`}
                  />
                </>
              )}
            </div>

            {waitlist.enabled &&
              safeClasses.flatMap((c) => c.schedules ?? []).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Per-Schedule Status
                  </p>
                  {safeClasses.flatMap((cls) =>
                    (cls.schedules ?? []).map((cs, i) => {
                      const csId =
                        cs.id ??
                        `${cls.name}-${cs.daysOfWeek.join("-")}-${i}`;
                      const label = `${cls.name} — ${cs.daysOfWeek
                        .map(
                          (d) => d.charAt(0).toUpperCase() + d.slice(1),
                        )
                        .join(", ")}`;
                      const sessionEnabled =
                        waitlist.sessionSettings?.[csId]?.enabled ?? true;
                      return (
                        <div
                          key={csId}
                          className="flex justify-between items-center border border-gray-200 rounded-xl px-4 py-2.5"
                        >
                          <div>
                            <span className="font-medium text-gray-900">
                              {label}
                            </span>
                            {cs.registrationCloseAt && (
                              <span className="text-xs text-gray-400 ml-2">
                                · closes{" "}
                                {new Date(
                                  cs.registrationCloseAt,
                                ).toLocaleDateString("en-US", {
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
                    }),
                  )}
                </div>
              )}

            {waitlist.invitationEmail?.subject && (
              <div className="border border-gray-200 rounded-xl p-4 space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Invitation Email
                </p>
                <Row label="Subject" value={waitlist.invitationEmail.subject} />
                {waitlist.invitationEmail.fromName && (
                  <Row label="From" value={waitlist.invitationEmail.fromName} />
                )}
              </div>
            )}
          </div>
        );
      }
    }
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="border-b border-gray-200 px-6">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
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

      {/* Tab content */}
      <div className="p-6 min-h-[200px]">{renderTabContent()}</div>

      {/* Optional publish / action slot (ReviewStep passes buttons here) */}
      {publishActions && <div className="px-6 pb-6">{publishActions}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
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
