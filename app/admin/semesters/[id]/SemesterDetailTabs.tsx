"use client";

import { useState } from "react";
import RegistrationFormRenderer from "@/app/components/semester-flow/RegistrationFormRender";
import { SemesterSession } from "@/types";

type TabKey =
  | "details"
  | "sessions"
  | "payment"
  | "registrationForm"
  | "discounts";

const TABS: { key: TabKey; label: string }[] = [
  { key: "details", label: "Details" },
  { key: "sessions", label: "Sessions" },
  { key: "payment", label: "Payment" },
  { key: "registrationForm", label: "Registration Form" },
  { key: "discounts", label: "Discounts" },
];

type Props = {
  semester: any;
};

export default function SemesterDetailTabs({ semester }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("details");

  const semesterSessions: SemesterSession[] = (semester.sessions ?? []).map(
    (s: any) => ({
      sessionId: s.id,
      title: s.title,
      type: s.type,
      capacity: s.capacity,
      startDate: s.start_date,
      endDate: s.end_date,
      daysOfWeek: s.days_of_week ?? [],
    }),
  );

  function renderContent() {
    switch (activeTab) {
      case "details":
        return (
          <div className="text-sm space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500">Tracking Mode</span>
              <span className="font-medium text-gray-900">
                {semester.tracking_mode ? "Enabled" : "Disabled"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Capacity Warning Threshold</span>
              <span className="font-medium text-gray-900">
                {semester.capacity_warning_threshold ?? 0}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Publish At</span>
              <span className="font-medium text-gray-900">
                {semester.publish_at ?? "Not scheduled"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <span className="font-medium text-gray-900 capitalize">
                {semester.status}
              </span>
            </div>
          </div>
        );

      case "sessions":
        return semester.sessions?.length > 0 ? (
          <div className="space-y-4">
            {semester.sessions.map((session: any) => {
              const group =
                session.session_group_sessions?.session_group ?? null;

              return (
                <div
                  key={session.id}
                  className="border border-gray-200 rounded-xl p-4 space-y-2"
                >
                  <div className="font-medium text-gray-900">
                    {session.title}
                  </div>

                  {group ? (
                    <span className="inline-block text-xs font-medium bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full">
                      {group.name}
                    </span>
                  ) : (
                    <span className="inline-block text-xs font-medium bg-gray-100 text-gray-600 px-3 py-1 rounded-full">
                      Unassigned
                    </span>
                  )}

                  <div className="text-sm text-gray-500">
                    {session.start_date} → {session.end_date}
                  </div>
                  {session.days_of_week && (
                    <div className="text-sm text-gray-500">
                      Days: {session.days_of_week.join(", ")}
                    </div>
                  )}
                  <div className="text-sm text-gray-500">
                    Capacity: {session.capacity} · Type: {session.type}
                  </div>
                  <div className="text-sm text-gray-500">
                    Status: {session.is_active ? "Active" : "Inactive"}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState message="No sessions configured." />
        );

      case "payment":
        return semester.semester_payment_plans ? (
          <div className="text-sm space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500">Type</span>
              <span className="font-medium text-gray-900 capitalize">
                {semester.semester_payment_plans.type?.replaceAll("_", " ")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Due Date</span>
              <span className="font-medium text-gray-900">
                {semester.semester_payment_plans.due_date}
              </span>
            </div>
            {semester.semester_payment_plans.deposit_amount && (
              <div className="flex justify-between">
                <span className="text-gray-500">Deposit Amount</span>
                <span className="font-medium text-gray-900">
                  ${semester.semester_payment_plans.deposit_amount}
                </span>
              </div>
            )}
            {semester.semester_payment_plans.deposit_percent && (
              <div className="flex justify-between">
                <span className="text-gray-500">Deposit Percentage</span>
                <span className="font-medium text-gray-900">
                  {semester.semester_payment_plans.deposit_percent}%
                </span>
              </div>
            )}
            {semester.semester_payment_plans.installment_count && (
              <div className="flex justify-between">
                <span className="text-gray-500">Installment Count</span>
                <span className="font-medium text-gray-900">
                  {semester.semester_payment_plans.installment_count}
                </span>
              </div>
            )}
          </div>
        ) : (
          <EmptyState message="No payment plan configured." />
        );

      case "registrationForm":
        return semester.registration_form?.elements?.length ? (
          <RegistrationFormRenderer
            elements={semester.registration_form.elements}
            sessions={semesterSessions}
            mode="preview"
          />
        ) : (
          <EmptyState message="No registration form configured." />
        );

      case "discounts":
        return semester.semester_discounts?.length > 0 ? (
          <div className="space-y-5">
            {semester.semester_discounts.map((sd: any) => {
              const discount = sd.discount;

              const restrictedSessions =
                discount.eligible_sessions_mode === "selected"
                  ? (discount.discount_rule_sessions?.map(
                      (s: any) => s.sessions?.title ?? "Unknown session",
                    ) ?? [])
                  : [];

              return (
                <div
                  key={`${sd.semester_id}-${sd.discount_id}`}
                  className="border border-gray-200 rounded-2xl p-5 space-y-4 hover:border-gray-300 transition"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-base font-semibold text-gray-900">
                        {discount.name}
                      </div>
                      <div className="text-sm text-gray-500 capitalize">
                        {discount.category.replaceAll("_", " ")}
                      </div>
                    </div>
                    <span className="text-xs px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 font-medium capitalize">
                      {discount.eligible_sessions_mode === "all"
                        ? "All sessions"
                        : "Selected sessions"}
                    </span>
                  </div>

                  {discount.discount_rules?.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-gray-700">
                        Discount Rules
                      </div>
                      <div className="space-y-1 text-sm text-gray-600">
                        {discount.discount_rules.map(
                          (rule: any, index: number) => {
                            const unit =
                              rule.threshold_unit === "person"
                                ? "people"
                                : "sessions";
                            const value =
                              rule.value_type === "percent"
                                ? `${rule.value}% off`
                                : `$${rule.value} off`;
                            return (
                              <div key={index}>
                                {rule.threshold}+ {unit} → {value}
                              </div>
                            );
                          },
                        )}
                      </div>
                    </div>
                  )}

                  {restrictedSessions.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-gray-700">
                        Applies To
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {restrictedSessions.map((title: string, i: number) => (
                          <span
                            key={i}
                            className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-700"
                          >
                            {title}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {discount.recipient_scope && (
                    <div className="text-sm text-gray-500 capitalize">
                      Recipient:{" "}
                      {discount.recipient_scope.replaceAll("_", " ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState message="No discounts applied to this semester." />
        );
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
      {/* Tab Bar */}
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

      {/* Tab Content */}
      <div className="p-6 min-h-[200px]">{renderContent()}</div>
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
