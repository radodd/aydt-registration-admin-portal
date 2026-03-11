"use client";

import { SemesterDraft } from "@/types";
import { useState } from "react";
import SemesterTabs from "../SemesterTabs";

type ReviewStepProps = {
  state: SemesterDraft;
  onBack: () => void;
  onPublishNow: () => void;
  onSaveDraft: () => void;
  onSchedule: (publishAt: string) => void;
};

export default function ReviewStep({
  state,
  onBack,
  onPublishNow,
  onSaveDraft,
  onSchedule,
}: ReviewStepProps) {
  const [scheduledDate, setScheduledDate] = useState<string>("");

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b border-gray-100">
          <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Review & Publish
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Confirm all semester details before publishing.
          </p>
        </div>

        {/* Shared tab view + publish actions */}
        <SemesterTabs
          data={state}
          publishActions={
            <div className="flex flex-col gap-4 border-t border-gray-200 pt-6">
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

              <div className="flex items-center gap-3">
                <input
                  type="datetime-local"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-xl text-sm"
                />
                <button
                  disabled={!scheduledDate}
                  onClick={() => onSchedule(new Date(scheduledDate).toISOString())}
                  className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
                >
                  Schedule Publish
                </button>
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}
