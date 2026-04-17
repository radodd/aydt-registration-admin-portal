"use server";

import { createClient } from "@/utils/supabase/server";
import { requireInstructor } from "@/utils/requireInstructor";

/**
 * Create or update the current instructor's private note for a dancer.
 * One note per (instructor, dancer) — if one already exists it is updated in-place.
 */
export async function upsertStudentNote(
  dancerId: string,
  note: string,
): Promise<void> {
  const { userId } = await requireInstructor();
  const supabase   = await createClient();

  // Check for an existing note from this instructor for this dancer.
  const { data: existing } = await supabase
    .from("instructor_student_notes")
    .select("id")
    .eq("instructor_id", userId)
    .eq("dancer_id",     dancerId)
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("instructor_student_notes")
      .update({ note })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("instructor_student_notes")
      .insert({ instructor_id: userId, dancer_id: dancerId, note });
    if (error) throw new Error(error.message);
  }
}

/** Delete one of the current instructor's notes. */
export async function deleteStudentNote(noteId: string): Promise<void> {
  const { userId } = await requireInstructor();
  const supabase   = await createClient();

  const { error } = await supabase
    .from("instructor_student_notes")
    .delete()
    .eq("id",            noteId)
    .eq("instructor_id", userId); // guard: can only delete own notes

  if (error) throw new Error(error.message);
}
