import { createClient } from "@/utils/supabase/server";

type Props = {
  params: Promise<{ token: string }>;
};

export default async function WaitlistAcceptPage({ params }: Props) {
  const { token } = await params;
  const supabase = await createClient();

  /* -------------------------------------------------------------------------- */
  /* 1. Validate the invite token                                               */
  /* -------------------------------------------------------------------------- */

  const { data: entry, error: entryError } = await supabase
    .from("waitlist_entries")
    .select(
      `
      id,
      dancer_id,
      session_id,
      status,
      invite_token,
      invitation_expires_at,
      sessions (
        id,
        title,
        capacity,
        registration_close_at,
        semester_id,
        semesters ( waitlist_settings )
      )
    `,
    )
    .eq("invite_token", token)
    .single();

  if (entryError || !entry) {
    return <ErrorPage title="Invalid link" message="This waitlist invite link is not valid." />;
  }

  if (entry.status !== "invited") {
    if (entry.status === "accepted") {
      return (
        <ErrorPage
          title="Already accepted"
          message="This invitation has already been accepted. Your registration is being processed."
        />
      );
    }
    return (
      <ErrorPage
        title="Invite unavailable"
        message="This invitation is no longer active."
      />
    );
  }

  /* -------------------------------------------------------------------------- */
  /* 2. Check expiry                                                            */
  /* -------------------------------------------------------------------------- */

  const now = new Date();

  if (
    entry.invitation_expires_at &&
    new Date(entry.invitation_expires_at) < now
  ) {
    return (
      <ErrorPage
        title="Invitation expired"
        message="This invitation has expired. You may still be on the waitlist — another invite will be sent if a spot opens again."
      />
    );
  }

  /* -------------------------------------------------------------------------- */
  /* 3. Check session availability                                              */
  /* -------------------------------------------------------------------------- */

  const session = Array.isArray(entry.sessions) ? entry.sessions[0] : entry.sessions;

  if (!session) {
    return <ErrorPage title="Session not found" message="The session for this invite could not be found." />;
  }

  const { count: registrationCount } = await supabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("session_id", entry.session_id)
    .not("status", "in", '("declined","cancelled")');

  const capacity = session.capacity ?? 0;
  if (capacity > 0 && (registrationCount ?? 0) >= capacity) {
    return (
      <ErrorPage
        title="Session full"
        message="Unfortunately the session is now full. You remain on the waitlist and will be notified if another spot opens."
      />
    );
  }

  /* -------------------------------------------------------------------------- */
  /* 4. Check registration close date                                           */
  /* -------------------------------------------------------------------------- */

  if (session.registration_close_at && new Date(session.registration_close_at) < now) {
    return (
      <ErrorPage
        title="Registration closed"
        message="Registration for this session has closed."
      />
    );
  }

  /* -------------------------------------------------------------------------- */
  /* 5. Accept — mark waitlist entry accepted + insert pending registration    */
  /* -------------------------------------------------------------------------- */

  const holdExpiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

  // Mark waitlist entry accepted
  const { error: updateError } = await supabase
    .from("waitlist_entries")
    .update({ status: "accepted" })
    .eq("id", entry.id);

  if (updateError) {
    return (
      <ErrorPage
        title="Something went wrong"
        message="We couldn't process your acceptance. Please try again or contact support."
      />
    );
  }

  // Insert pending registration with 30-minute hold
  const { error: insertError } = await supabase.from("registrations").insert({
    dancer_id: entry.dancer_id,
    session_id: entry.session_id,
    status: "pending",
    hold_expires_at: holdExpiresAt,
    total_amount: 0,
  });

  if (insertError) {
    // Roll back the waitlist status change
    await supabase
      .from("waitlist_entries")
      .update({ status: "invited" })
      .eq("id", entry.id);

    return (
      <ErrorPage
        title="Something went wrong"
        message="We couldn't complete your registration. Please try again or contact support."
      />
    );
  }

  /* -------------------------------------------------------------------------- */
  /* 6. Success                                                                 */
  /* -------------------------------------------------------------------------- */

  const holdUntil = new Date(holdExpiresAt).toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-6">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-100">
          <svg
            className="w-6 h-6 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <div>
          <h1 className="text-xl font-semibold text-gray-900">Spot reserved!</h1>
          <p className="text-sm text-gray-500 mt-2">
            You&apos;ve accepted your waitlist invitation for{" "}
            <span className="font-medium text-gray-700">{session.title}</span>.
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Complete your registration by:</p>
          <p className="mt-1">{holdUntil}</p>
          <p className="text-xs mt-1 text-amber-600">
            Your spot will be released if payment is not completed in time.
          </p>
        </div>

        <p className="text-xs text-gray-400 text-center">
          Questions? Contact us at{" "}
          <a href="mailto:info@aydt.com" className="underline">
            info@aydt.com
          </a>
        </p>
      </div>
    </div>
  );
}

function ErrorPage({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100">
          <svg
            className="w-6 h-6 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        <p className="text-sm text-gray-500">{message}</p>
        <p className="text-xs text-gray-400">
          Questions? Contact us at{" "}
          <a href="mailto:info@aydt.com" className="underline">
            info@aydt.com
          </a>
        </p>
      </div>
    </div>
  );
}
