"use server";

import { createClient } from "@/utils/supabase/server";
import { requireInstructor } from "@/utils/requireInstructor";

export type NoteTag = "progress" | "behavior" | "goal" | "general";

const VALID_TAGS: ReadonlySet<NoteTag> = new Set([
  "progress",
  "behavior",
  "goal",
  "general",
]);

/**
 * Create a new note about a dancer. Multiple notes per (instructor, dancer)
 * are allowed — each note is its own row with its own tag and timestamp.
 */
export async function createStudentNote(
  dancerId: string,
  note: string,
  tag: NoteTag | null = null,
): Promise<{ id: string }> {
  const trimmed = note.trim();
  if (!trimmed) throw new Error("Note cannot be empty.");
  if (tag && !VALID_TAGS.has(tag)) throw new Error(`Invalid tag: ${tag}`);

  const { userId } = await requireInstructor();
  const supabase   = await createClient();

  const { data, error } = await supabase
    .from("instructor_student_notes")
    .insert({
      instructor_id: userId,
      dancer_id:     dancerId,
      note:          trimmed,
      tag,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return { id: data!.id as string };
}

/** Update one of the current instructor's existing notes. */
export async function updateStudentNote(
  noteId: string,
  note: string,
  tag: NoteTag | null = null,
): Promise<void> {
  const trimmed = note.trim();
  if (!trimmed) throw new Error("Note cannot be empty.");
  if (tag && !VALID_TAGS.has(tag)) throw new Error(`Invalid tag: ${tag}`);

  const { userId } = await requireInstructor();
  const supabase   = await createClient();

  const { error } = await supabase
    .from("instructor_student_notes")
    .update({ note: trimmed, tag })
    .eq("id",            noteId)
    .eq("instructor_id", userId); // belt-and-suspenders alongside RLS

  if (error) throw new Error(error.message);
}

/** Delete one of the current instructor's notes. */
export async function deleteStudentNote(noteId: string): Promise<void> {
  const { userId } = await requireInstructor();
  const supabase   = await createClient();

  const { error } = await supabase
    .from("instructor_student_notes")
    .delete()
    .eq("id",            noteId)
    .eq("instructor_id", userId);

  if (error) throw new Error(error.message);
}
