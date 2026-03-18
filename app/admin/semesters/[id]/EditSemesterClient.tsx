"use client";

import SemesterForm from "../SemesterForm";
import { useState } from "react";
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
    <SemesterForm
      mode="edit"
      basePath={`/admin/semesters/${semester.id}/edit`}
      initialState={draft}
      isLocked={isLocked}
      semesterStatus={semester.status}
    />
  );
}
