"use client";

import { ReviewStepProps } from "@/types";

export default function ReviewStep({
  state,
  onBack,
  onPublish,
}: ReviewStepProps) {
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
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Semester Details
          </h3>

          <div className="border border-gray-200 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Name</span>
              <span className="font-medium text-gray-900">
                {state.details?.name}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-500">Attendance Tracking</span>
              <span className="font-medium text-gray-900">
                {state.details?.trackingMode ? "Enabled" : "Disabled"}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-500">Capacity Warning Threshold</span>
              <span className="font-medium text-gray-900">
                {state.details?.capacityWarningThreshold}%
              </span>
            </div>
          </div>
        </section>

        {/* Sessions */}
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Sessions ({state.sessions?.appliedSessions.length})
          </h3>

          <div className="space-y-4">
            {state.sessions?.appliedSessions.map((s) => {
              const days = s.overriddenDaysOfWeek ?? s.daysOfWeek;
              const type = s.overriddenType ?? s.type;
              const capacity = s.overriddenCapacity ?? s.capacity;

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

                  {/* Override Indicator */}
                  {(s.overriddenDaysOfWeek ||
                    s.overriddenType ||
                    s.overriddenCapacity) && (
                    <div className="text-xs text-indigo-600 font-medium">
                      Overrides applied
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Payment Plan */}
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Payment Plan</h3>

          <div className="border border-gray-200 rounded-xl p-4 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500">Type</span>
              <span className="font-medium text-gray-900 capitalize">
                {state.paymentPlan?.type.replaceAll("_", " ")}
              </span>
            </div>

            {state.paymentPlan?.installmentCount && (
              <div className="flex justify-between">
                <span className="text-gray-500">Installments</span>
                <span className="font-medium text-gray-900">
                  {state.paymentPlan.installmentCount}
                </span>
              </div>
            )}

            <div className="flex justify-between">
              <span className="text-gray-500">Due Date</span>
              <span className="font-medium text-gray-900">
                {state.paymentPlan?.dueDate}
              </span>
            </div>
          </div>
        </section>

        {/* Discounts */}
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Discounts ({state.discounts?.appliedDiscounts.length})
          </h3>

          <div className="border border-gray-200 rounded-xl p-4 text-sm space-y-2">
            {state.discounts?.appliedDiscounts.length === 0 && (
              <span className="text-gray-500">No discounts applied</span>
            )}

            {state.discounts?.appliedDiscounts.map((d) => (
              <div key={d.discountId} className="flex justify-between">
                <span className="text-gray-500">Discount</span>
                <span className="font-medium text-gray-900">
                  {d.scope.replaceAll("_", " ")}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Publish Actions */}
        <div className="flex justify-between pt-6 border-t border-gray-200">
          <button
            onClick={onBack}
            className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            Back
          </button>

          <button
            onClick={onPublish}
            className="px-6 py-2.5 rounded-xl bg-indigo-600 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition"
          >
            Publish Semester
          </button>
        </div>
      </div>
    </div>
  );
}
