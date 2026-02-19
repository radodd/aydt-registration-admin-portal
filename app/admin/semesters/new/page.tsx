"use client";

import SemesterForm from "../SemesterForm";

export default function NewSemesterPage() {
  // async function handleCreate(state: SemesterDraft) {
  //   console.group("🚀 NewSemesterPage.handleCreate");
  //   console.log("Incoming draft state:", state);

  //   if (!state.id) {
  //     console.error("❌ Missing semester ID before publish");
  //     console.groupEnd();
  //     throw new Error("Cannot publish semester without ID");
  //   }

  //   try {
  //     await persistSemesterDraft(state);

  //     await publishSemesterNow(state.id);

  //     router.push("/admin/semesters");
  //   } catch (err) {
  //     console.error("❌ Publish failed:", err);
  //     throw err;
  //   } finally {
  //     console.groupEnd();
  //   }
  // }

  return (
    <SemesterForm
      mode="create"
      basePath="/admin/semesters/new"
      // onFinalSubmit={handleCreate}
    />
  );
}
