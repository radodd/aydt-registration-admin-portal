"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SemesterDraft } from "@/types";

import { publishSemester } from "../actions/publishSemester";

import SemesterForm from "../SemesterForm";

/* -------------------------------------------------------------------------- */
/* Page Component                                                             */
/* -------------------------------------------------------------------------- */

export default function NewSemesterPage() {
  const router = useRouter();

  async function handleCreate(state: SemesterDraft) {
    await publishSemester(state);
    router.push("/admin/semesters");
  }

  /* ---------------------------------------------------------------------- */

  return (
    <SemesterForm
      mode="create"
      basePath="/admin/semesters/new"
      onFinalSubmit={handleCreate}
    />
  );
}
