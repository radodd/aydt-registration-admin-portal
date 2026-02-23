"use client";

import {
  DiscountCategory,
  DiscountRules,
  HydratedDiscount,
  SemesterDraft,
} from "@/types";
import { useEffect, useState } from "react";
import { getDiscounts } from "@/queries/admin";
import RegistrationFormRenderer from "@/app/components/semester-flow/RegistrationFormRender";

type ReviewStepProps = {
  state: SemesterDraft;
  mode: "create" | "edit";
  onBack: () => void;
  onPublishNow: () => void;
  onSaveDraft: () => void;
  onSchedule: (publishAt: string) => void;
};

export default function ReviewStep({
  state,
  mode,
  onBack,
  onPublishNow,
  onSaveDraft,
  onSchedule,
}: ReviewStepProps) {
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

  console.group("📋 ReviewStep State Check");
  console.log("Full state:", state);
  console.log("state.details:", state.details);
  console.groupEnd();
  /*
   |--------------------------------------------------------------------------
   | Safe Normalization
   |--------------------------------------------------------------------------
   */

  const safeDetails = state.details;
  const safeSessions = state.sessions?.appliedSessions ?? [];
  const safePayment = state.paymentPlan;
  const safeSessionGroups = state.sessionGroups?.groups ?? [];
  // const safeAppliedDiscounts = state.discounts?.appliedDiscounts ?? [];

  /*
   |--------------------------------------------------------------------------
   | Lookup Maps
   |--------------------------------------------------------------------------
   */

  const sessionMap = new Map(safeSessions.map((s) => [s.sessionId, s]));

  /*
   |--------------------------------------------------------------------------
   | Rule Formatter
   |--------------------------------------------------------------------------
   */

  function formatRule(rule: DiscountRules, category: DiscountCategory) {
    const unit = category === "multi_person" ? "people" : "sessions";

    const value =
      rule.valueType === "percent"
        ? `${rule.value}% off`
        : `$${rule.value} off`;

    return `At ${rule.threshold} ${unit} → ${value}`;
  }

  /*
|--------------------------------------------------------------------------
| DEBUG: Discounts
|--------------------------------------------------------------------------
*/

  console.log("ReviewStep allDiscounts:", allDiscounts);

  const appliedDiscountIds =
    state.discounts?.appliedDiscounts.map((d) => d.discountId) ?? [];

  const reviewDiscounts = allDiscounts.filter((d) =>
    appliedDiscountIds.includes(d.id),
  );

  /*
   |--------------------------------------------------------------------------
   | Render
   |--------------------------------------------------------------------------
   */

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-10">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Review & Publish
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Confirm all semester details before publishing.
          </p>
        </div>

        {/* Semester Details */}
        {safeDetails && (
          <section className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Semester Details
            </h3>

            <div className="border border-gray-200 rounded-xl p-4 text-sm space-y-2">
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
                <span className="text-gray-500">
                  Capacity Warning Threshold
                </span>
                <span className="font-medium text-gray-900">
                  {safeDetails.capacityWarningThreshold ?? 0}%
                </span>
              </div>
            </div>
          </section>
        )}

        {/* Sessions */}
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Sessions ({safeSessions.length})
          </h3>

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
                  className="border border-gray-200 rounded-xl p-4 space-y-2"
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

                  {hasOverrides && (
                    <div className="text-xs font-medium text-indigo-600">
                      Overrides applied
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Session Groups */}
        {safeSessionGroups.length > 0 && (
          <section className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Session Groups ({safeSessionGroups.length})
            </h3>

            <div className="space-y-4">
              {safeSessionGroups.map((group) => (
                <div
                  key={group.id}
                  className="border border-gray-200 rounded-xl p-4 space-y-2"
                >
                  <div className="font-medium text-gray-900">{group.name}</div>
                  <div className="text-sm text-gray-500">
                    Sessions: {group.sessionIds.length}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Payment Plan */}
        {safePayment && (
          <section className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Payment Plan
            </h3>

            <div className="border border-gray-200 rounded-xl p-4 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Type</span>
                <span className="font-medium text-gray-900 capitalize">
                  {safePayment.type.replaceAll("_", " ")}
                </span>
              </div>

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
          </section>
        )}

        {/* Discounts */}
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Discounts ({reviewDiscounts.length})
          </h3>

          <div className="space-y-4">
            {reviewDiscounts.length === 0 && (
              <div className="border border-gray-200 rounded-xl p-4 text-sm text-gray-500">
                No discounts applied
              </div>
            )}

            {reviewDiscounts.map((d) => {
              const selectedSessionNames =
                d.eligible_sessions_mode === "selected"
                  ? (d.discount_rule_sessions?.map(
                      (s) => s.sessions?.title ?? "Unknown session",
                    ) ?? [])
                  : [];

              return (
                <div
                  key={d?.id}
                  className="border border-gray-200 rounded-xl p-4 space-y-3"
                >
                  <div className="font-medium text-gray-900">{d?.name}</div>

                  <div className="text-sm text-gray-500 capitalize">
                    Category: {d?.category.replaceAll("_", " ")}
                  </div>

                  <div className="text-sm text-gray-500">
                    Applies to:{" "}
                    {d?.eligible_sessions_mode === "all"
                      ? "All sessions"
                      : "Selected sessions"}
                  </div>

                  {selectedSessionNames.length > 0 && (
                    <div className="text-sm text-gray-500">
                      Sessions: {selectedSessionNames.join(", ")}
                    </div>
                  )}

                  <div className="text-sm text-gray-500 space-y-1">
                    {/* {d?.rules.map((rule, index) => (
                      <div key={index}>{formatRule(rule, d.category)}</div>
                    ))} */}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          {state.registrationForm?.elements?.length && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Registration Form Preview
              </h2>

              <RegistrationFormRenderer
                elements={state.registrationForm.elements}
                sessions={state.sessions?.appliedSessions ?? []}
                mode="preview"
              />
            </div>
          )}
        </section>

        {/* Actions */}
        <div className="flex flex-col gap-4 pt-6 border-t border-gray-200">
          <div className="flex justify-between">
            <button
              onClick={onBack}
              className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              Back
            </button>

            <div className="flex gap-3">
              {/* Save Draft */}
              <button
                onClick={onSaveDraft}
                className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                Save as Draft
              </button>

              {/* Publish Immediately */}
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
