"use client";

import SemesterForm from "../SemesterForm";
import { useState } from "react";
import Link from "next/link";
import { mapSemesterToDraft } from "@/utils/mapSemesterToDraft";

type EditSemesterClientProps = {
  semester: any;
  registrationCount?: number;
};

export default function EditSemesterClient({
  semester,
  registrationCount = 0,
}: EditSemesterClientProps) {
  const isLocked = semester.status === "published" && registrationCount > 0;
  const [draft] = useState(() => mapSemesterToDraft(semester));

  return (
    <div>
      {/* Preview action bar */}
      <div className="flex justify-end px-6 pt-4 pb-0">
        <Link
          href={`/preview/semester/${semester.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm bg-amber-50 text-amber-700 border border-amber-200 px-4 py-2 rounded-xl hover:bg-amber-100 transition-colors font-medium"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
          Preview Semester
        </Link>
      </div>

      <SemesterForm
        mode="edit"
        basePath={`/admin/semesters/${semester.id}/edit`}
        initialState={draft}
        isLocked={isLocked}
      />
    </div>
  );
}
