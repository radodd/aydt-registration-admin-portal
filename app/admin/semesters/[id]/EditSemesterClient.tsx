"use client";

import SemesterForm from "../SemesterForm";
import { useState } from "react";
import { mapSemesterToDraft } from "@/utils/mapSemesterToDraft";

type EditSemesterClientProps = {
  semester: any;
  registrationCount?: number;
  enrolledSectionIds?: string[];
};

export default function EditSemesterClient({
  semester,
  registrationCount = 0,
  enrolledSectionIds = [],
}: EditSemesterClientProps) {
  // Semester-wide lock still gates the Payment / Discounts / Emails / etc. steps
  // (their DB tables stay semester-wide locked). The Classes step uses the
  // per-section list instead — see SessionsStep.
  const isLocked = semester.status === "published" && registrationCount > 0;
  const [draft] = useState(() => mapSemesterToDraft(semester));

  return (
    <SemesterForm
      mode="edit"
      basePath={`/admin/semesters/${semester.id}/edit`}
      initialState={draft}
      isLocked={isLocked}
      semesterStatus={semester.status}
      enrolledSectionIds={enrolledSectionIds}
    />
  );
}
