"use client";

import { SemesterDraft } from "@/types";
import { useRouter } from "next/navigation";
import SemesterForm from "../SemesterForm";
import { publishSemester } from "../actions/publishSemester";

// import { useRouter } from "next/navigation";
// import { SemesterDraft } from "@/types";

// import { publishSemester } from "../actions/publishSemester";

// import SemesterForm from "../SemesterForm";

// /* -------------------------------------------------------------------------- */
// /* Page Component                                                             */
// /* -------------------------------------------------------------------------- */

// export default function NewSemesterPage() {
//   const router = useRouter();

//   async function handleCreate(state: SemesterDraft) {
//     if (!state.id) {
//       throw new Error("Cannot publish semester without ID");
//     }
//     await publishSemester(state.id);
//     router.push("/admin/semesters");
//   }

//   /* ---------------------------------------------------------------------- */

//   return (
//     <SemesterForm
//       mode="create"
//       basePath="/admin/semesters/new"
//       onFinalSubmit={handleCreate}
//     />
//   );
// }

export default function NewSemesterPage() {
  const router = useRouter();

  async function handleCreate(state: SemesterDraft) {
    console.group("🚀 NewSemesterPage.handleCreate");
    console.log("Incoming draft state:", state);

    if (!state.id) {
      console.error("❌ Missing semester ID before publish");
      console.groupEnd();
      throw new Error("Cannot publish semester without ID");
    }

    try {
      console.log("Publishing semester with ID:", state.id);

      await publishSemester(state.id);

      console.log("✅ Publish successful");
      console.log("Redirecting to /admin/semesters");

      router.push("/admin/semesters");
    } catch (err) {
      console.error("❌ Publish failed:", err);
      throw err;
    } finally {
      console.groupEnd();
    }
  }

  return (
    <SemesterForm
      mode="create"
      basePath="/admin/semesters/new"
      onFinalSubmit={handleCreate}
    />
  );
}
