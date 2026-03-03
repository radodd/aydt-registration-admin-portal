"use client";

import { useState, useTransition } from "react";
import {
  publishSemesterNow,
  scheduleSemester,
  saveSemesterDraft,
} from "../actions/semesterLifecycle";
import { archiveSemester } from "../actions/archiveSemester";
import { unpublishSemester } from "../actions/unpublishSemester";
import { restoreSemester } from "../actions/restoreSemester";

type Props = {
  semesterId: string;
  status: string;
  publishAt: string | null;
};

export default function SemesterLifecycleActions({
  semesterId,
  status,
  publishAt,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [scheduledDate, setScheduledDate] = useState<string>("");
  const [actionError, setActionError] = useState<string | null>(null);

  function handlePublishNow() {
    setActionError(null);
    startTransition(async () => {
      try {
        await publishSemesterNow(semesterId);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Failed to publish.");
      }
    });
  }

  function handleSaveDraft() {
    setActionError(null);
    startTransition(async () => {
      try {
        await saveSemesterDraft(semesterId);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Failed to save draft.");
      }
    });
  }

  function handleSchedule() {
    if (!scheduledDate) return;
    setActionError(null);
    startTransition(async () => {
      try {
        await scheduleSemester(semesterId, scheduledDate);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Failed to schedule.");
      }
    });
  }

  function handleArchive() {
    setActionError(null);
    startTransition(async () => {
      try {
        await archiveSemester(semesterId);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Failed to archive.");
      }
    });
  }

  function handleUnpublish() {
    setActionError(null);
    startTransition(async () => {
      try {
        await unpublishSemester(semesterId);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Failed to unpublish.");
      }
    });
  }

  function handleRestore() {
    setActionError(null);
    startTransition(async () => {
      try {
        await restoreSemester(semesterId);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Failed to restore.");
      }
    });
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-6">
      <h2 className="text-lg font-semibold">Lifecycle Controls</h2>

      {actionError && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {/* Current Status */}
      <div className="text-sm text-gray-600">
        Current Status: <span className="font-medium">{status}</span>
      </div>

      <div className="flex flex-wrap gap-3">
        {(status === "draft" || status === "scheduled") && (
          <button
            onClick={handlePublishNow}
            disabled={pending}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Publish Now
          </button>
        )}

        {(status === "scheduled" || status === "published") && (
          <button
            onClick={handleSaveDraft}
            disabled={pending}
            className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Revert to Draft
          </button>
        )}

        {status === "published" && (
          <button
            onClick={handleUnpublish}
            disabled={pending}
            className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Unpublish
          </button>
        )}

        {status === "published" && (
          <button
            onClick={handleArchive}
            disabled={pending}
            className="px-4 py-2 rounded-xl bg-red-50 border border-red-200 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            Archive
          </button>
        )}

        {status === "archived" && (
          <button
            onClick={handleRestore}
            disabled={pending}
            className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Restore
          </button>
        )}
      </div>

      {/* Scheduling */}
      {status !== "archived" && <div className="space-y-3">
        <div className="text-sm font-medium text-gray-700">
          Schedule Publish
        </div>

        <div className="flex gap-3">
          <input
            type="datetime-local"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-xl text-sm"
          />

          <button
            onClick={handleSchedule}
            disabled={!scheduledDate || pending}
            className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
          >
            {status === "scheduled" ? "Reschedule" : "Schedule"}
          </button>
        </div>

        {publishAt && status === "scheduled" && (
          <div className="text-xs text-gray-500">
            Currently scheduled for: {publishAt}
          </div>
        )}
      </div>}
    </div>
  );
}
