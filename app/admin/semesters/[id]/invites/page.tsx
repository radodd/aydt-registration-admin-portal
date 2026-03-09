import { createAdminClient } from "@/utils/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import InviteManagerClient from "./InviteManagerClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function InvitesPage({ params }: Props) {
  const { id: semesterId } = await params;
  const supabase = createAdminClient();

  // Load all competition track classes for this semester.
  // Using is_competition_track=true is more precise than visibility-based filtering —
  // it excludes hidden standard classes and correctly includes all competition tracks.
  const { data: classes, error } = await supabase
    .from("classes")
    .select("id, name, discipline, division, visibility, enrollment_type, is_competition_track, invite_email")
    .eq("semester_id", semesterId)
    .eq("is_active", true)
    .eq("is_competition_track", true)
    .order("name");

  if (error) notFound();

  const { data: semester } = await supabase
    .from("semesters")
    .select("id, name")
    .eq("id", semesterId)
    .single();

  if (!semester) notFound();

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link
          href={`/admin/semesters/${semesterId}`}
          className="hover:text-gray-700 transition-colors"
        >
          {semester.name}
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">Competition Invites</span>
      </div>

      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Competition Invites
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage audition sessions and invitations for restricted competition
          classes.
        </p>
      </div>

      {classes && classes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
          <p className="text-sm text-gray-500">
            No competition track classes found in this semester.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Add a <strong>Competition Track</strong> in the Sessions step to manage invites and audition slots here.
          </p>
          <Link
            href={`/admin/semesters/${semesterId}/edit?step=sessions`}
            className="mt-3 inline-block text-xs text-indigo-600 hover:text-indigo-800 underline"
          >
            Go to Sessions step →
          </Link>
        </div>
      ) : (
        <InviteManagerClient
          semesterId={semesterId}
          classes={classes ?? []}
        />
      )}
    </div>
  );
}
