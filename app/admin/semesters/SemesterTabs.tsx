"use client";

import { HydratedDiscount, SemesterDraft } from "@/types";
import { useEffect, useMemo, useState } from "react";
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
  { key: "sessions", label: "Classes & Offerings" },
  { key: "sessionGroups", label: "Class Groups" },
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
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());

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

  // Build a lookup: schedule id → "ClassName — Days" for use in Class Groups tab
  const scheduleMap = useMemo(() => {
    const map = new Map<string, string>();
    safeClasses.forEach((cls) => {
      (cls.schedules ?? []).forEach((cs) => {
        if (cs.id) {
          const days = cs.daysOfWeek
            .map((d) => d.charAt(0).toUpperCase() + d.slice(1))
            .join(", ");
          map.set(cs.id, `${cls.name} — ${days}`);
        }
      });
    });
    return map;
  }, [safeClasses]);

  function toggleClass(key: string) {
    setExpandedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toTitleCase(str: string) {
    return str
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function countIndividualSessions(schedules: NonNullable<typeof safeClasses[0]["schedules"]>): number {
    const DAY_INDEX: Record<string, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6,
    };
    let total = 0;
    for (const cs of schedules) {
      if (!cs.startDate || !cs.endDate || cs.daysOfWeek.length === 0) {
        // Fall back to number of days-of-week as a rough proxy
        total += cs.daysOfWeek.length || 1;
        continue;
      }
      const targetDays = new Set(
        cs.daysOfWeek.map((d) => DAY_INDEX[d.toLowerCase()]).filter((n) => n !== undefined),
      );
      const excluded = new Set((cs.excludedDates ?? []).map((e) => e.date));
      const end = new Date(cs.endDate);
      const cur = new Date(cs.startDate);
      while (cur <= end) {
        if (targetDays.has(cur.getDay())) {
          const iso = cur.toISOString().slice(0, 10);
          if (!excluded.has(iso)) total++;
        }
        cur.setDate(cur.getDate() + 1);
      }
    }
    return total;
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function fmtTime(t: string) {
    // "HH:mm" → "h:mm AM/PM"
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
  }

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
      /* Classes & Offerings                                                     */
      /* ---------------------------------------------------------------------- */
      case "sessions":
        return safeClasses.length > 0 ? (
          <div className="space-y-3">
            {safeClasses.map((cls) => {
              const cardKey = cls.id ?? cls.name;
              const isOpen = expandedClasses.has(cardKey);
              const sessionCount = countIndividualSessions(cls.schedules ?? []);

              return (
                <div
                  key={cardKey}
                  className="border border-gray-200 rounded-xl overflow-hidden"
                >
                  {/* Card header — always visible, clickable to toggle */}
                  <button
                    type="button"
                    onClick={() => toggleClass(cardKey)}
                    className="w-full text-left px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {/* Name + competition badge */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">
                          {cls.displayName || cls.name}
                        </span>
                        {cls.isCompetitionTrack && (
                          <Badge label="Competition Track" color="amber" />
                        )}
                      </div>

                      {/* Discipline · Division */}
                      <div className="text-sm text-gray-500">
                        {cls.discipline ? toTitleCase(cls.discipline) : ""}
                        {cls.division ? ` · ${toTitleCase(cls.division)}` : ""}
                      </div>

                      {/* Badge row */}
                      <div className="flex flex-wrap gap-1.5">
                        {cls.visibility && cls.visibility !== "public" && (
                          <Badge
                            label={cls.visibility === "hidden" ? "Hidden" : "Invite Only"}
                            color={cls.visibility === "hidden" ? "gray" : "indigo"}
                          />
                        )}
                        {cls.enrollmentType === "audition" && (
                          <Badge label="Audition Required" color="indigo" />
                        )}
                        <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full">
                          {sessionCount} session{sessionCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>

                    <ExpandIcon open={isOpen} />
                  </button>

                  {/* Expanded body */}
                  {isOpen && (
                    <div className="border-t border-gray-100 px-4 py-4 space-y-4 bg-gray-50/50">
                      {/* Description */}
                      {cls.description && (
                        <p className="text-sm text-gray-500 italic">
                          {cls.description}
                        </p>
                      )}

                      {/* Age / grade range */}
                      {(cls.minAge != null || cls.maxAge != null) && (
                        <div className="text-sm text-gray-600">
                          Ages{" "}
                          {cls.minAge != null ? cls.minAge : "—"}
                          {" – "}
                          {cls.maxAge != null ? cls.maxAge : "—"}
                        </div>
                      )}
                      {(cls.minGrade != null || cls.maxGrade != null) && (
                        <div className="text-sm text-gray-600">
                          Grades{" "}
                          {cls.minGrade != null ? cls.minGrade : "—"}
                          {" – "}
                          {cls.maxGrade != null ? cls.maxGrade : "—"}
                        </div>
                      )}

                      {/* Registration note */}
                      {cls.registrationNote && (
                        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          {cls.registrationNote}
                        </div>
                      )}

                      {/* Per-schedule blocks */}
                      {(cls.schedules ?? []).length > 0 && (
                        <div className="space-y-3">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                            Schedule Offerings
                          </p>
                          {(cls.schedules ?? []).map((cs, i) => {
                            const days = cs.daysOfWeek
                              .map((d) => d.charAt(0).toUpperCase() + d.slice(1))
                              .join(", ");

                            return (
                              <div
                                key={cs.id ?? i}
                                className="bg-white border border-gray-200 rounded-xl p-4 space-y-2 text-sm"
                              >
                                {/* Days + time */}
                                <div className="font-medium text-gray-900">
                                  {days}
                                  {cs.startTime
                                    ? ` · ${fmtTime(cs.startTime)}`
                                    : ""}
                                  {cs.endTime ? ` – ${fmtTime(cs.endTime)}` : ""}
                                </div>

                                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-gray-600">
                                  {/* Dates */}
                                  {cs.startDate && (
                                    <div>
                                      <span className="text-gray-400">
                                        Start:{" "}
                                      </span>
                                      {fmtDate(cs.startDate)}
                                    </div>
                                  )}
                                  {cs.endDate && (
                                    <div>
                                      <span className="text-gray-400">
                                        End:{" "}
                                      </span>
                                      {fmtDate(cs.endDate)}
                                    </div>
                                  )}

                                  {/* Location */}
                                  {cs.location && (
                                    <div className="col-span-2">
                                      <span className="text-gray-400">
                                        Studio:{" "}
                                      </span>
                                      {cs.location}
                                    </div>
                                  )}

                                  {/* Instructor */}
                                  {cs.instructorName && (
                                    <div className="col-span-2">
                                      <span className="text-gray-400">
                                        Instructor:{" "}
                                      </span>
                                      {cs.instructorName}
                                    </div>
                                  )}

                                  {/* Capacity */}
                                  {cs.capacity != null && (
                                    <div>
                                      <span className="text-gray-400">
                                        Capacity:{" "}
                                      </span>
                                      {cs.capacity}
                                      {cs.urgencyThreshold != null && (
                                        <span className="text-gray-400 ml-1">
                                          (warn at {cs.urgencyThreshold})
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {/* Registration open */}
                                  {cs.registrationOpenAt && (
                                    <div>
                                      <span className="text-gray-400">
                                        Opens:{" "}
                                      </span>
                                      {fmtDate(cs.registrationOpenAt)}
                                    </div>
                                  )}

                                  {/* Registration close */}
                                  {cs.registrationCloseAt && (
                                    <div>
                                      <span className="text-gray-400">
                                        Closes:{" "}
                                      </span>
                                      {fmtDate(cs.registrationCloseAt)}
                                    </div>
                                  )}
                                </div>

                                {/* Badges */}
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {cs.pricingModel && (
                                    <Badge
                                      label={
                                        cs.pricingModel === "per_session"
                                          ? "Per Session"
                                          : "Full Schedule"
                                      }
                                      color="indigo"
                                    />
                                  )}
                                  {cs.genderRestriction &&
                                    cs.genderRestriction !== "no_restriction" && (
                                      <Badge
                                        label={
                                          cs.genderRestriction === "male"
                                            ? "Male Only"
                                            : "Female Only"
                                        }
                                        color="gray"
                                      />
                                    )}
                                  {(cs.excludedDates ?? []).length > 0 && (
                                    <Badge
                                      label={`${cs.excludedDates!.length} excluded date${cs.excludedDates!.length !== 1 ? "s" : ""}`}
                                      color="gray"
                                    />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState message="No classes added." />
        );

      /* ---------------------------------------------------------------------- */
      /* Class Groups                                                            */
      /* ---------------------------------------------------------------------- */
      case "sessionGroups":
        return safeSessionGroups.length > 0 ? (
          <div className="space-y-4">
            {safeSessionGroups.map((group) => {
              const resolvedLabels = group.sessionIds
                .map((sid) => scheduleMap.get(sid))
                .filter(Boolean) as string[];
              const unresolvedCount =
                group.sessionIds.length - resolvedLabels.length;

              return (
                <div
                  key={group.id}
                  className="border border-gray-200 rounded-xl p-4 space-y-3"
                >
                  <div className="font-semibold text-gray-900">{group.name}</div>

                  {group.sessionIds.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">
                      No classes assigned to this group.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {resolvedLabels.map((label, i) => (
                        <li
                          key={i}
                          className="flex items-center gap-2 text-sm text-gray-700"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                          {label}
                        </li>
                      ))}
                      {unresolvedCount > 0 && (
                        <li className="text-xs text-gray-400 pl-3.5">
                          + {unresolvedCount} unresolved offering
                          {unresolvedCount !== 1 ? "s" : ""}
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState message="No class groups configured." />
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
                            {scheduleMap.get(sid) ?? sid}
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

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

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

type BadgeColor = "indigo" | "green" | "gray" | "amber";

function Badge({ label, color }: { label: string; color: BadgeColor }) {
  const styles: Record<BadgeColor, string> = {
    indigo: "bg-indigo-50 text-indigo-700",
    green: "bg-green-100 text-green-700",
    gray: "bg-gray-100 text-gray-600",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <span
      className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${styles[color]}`}
    >
      {label}
    </span>
  );
}

function ExpandIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
