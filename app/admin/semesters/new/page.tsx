"use client";

import { useRouter } from "next/navigation";
import { SemesterDraft } from "@/types";

import { publishSemester } from "../actions/publishSemester";

import SemesterForm from "../SemesterForm";

/* -------------------------------------------------------------------------- */
/* Page Component                                                             */
/* -------------------------------------------------------------------------- */

export default function NewSemesterPage() {
  const router = useRouter();

  async function handleCreate(state: SemesterDraft) {
    if (!state.id) {
      throw new Error("Cannot publish semester without ID");
    }
    await publishSemester(state.id);
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
