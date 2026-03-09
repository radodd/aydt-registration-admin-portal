import { notFound } from "next/navigation";
import { validateInviteToken } from "@/app/actions/competition/validateInviteToken";
import { recordInviteOpen } from "@/app/actions/competition/recordInviteOpen";
import AuditionBookingClient from "./AuditionBookingClient";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function AuditionBookingPage({ params }: Props) {
  const { token } = await params;

  const result = await validateInviteToken(token);

  if (!result.valid) {
    if (result.reason === "not_found") notFound();

    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-2xl font-semibold text-gray-900">
            {result.reason === "expired"
              ? "Invitation Expired"
              : result.reason === "exhausted"
                ? "Invitation Fully Used"
                : "Invitation Revoked"}
          </h1>
          <p className="text-gray-500 text-sm">
            {result.reason === "expired"
              ? "This invitation link has expired. Please contact the studio for a new invite."
              : result.reason === "exhausted"
                ? "This invitation link has already been used the maximum number of times."
                : "This invitation has been revoked. Please contact the studio if you believe this is an error."}
          </p>
        </div>
      </main>
    );
  }

  // Record the open event — fire-and-forget (don't block render)
  void recordInviteOpen(result.invite.id);

  return (
    <AuditionBookingClient
      token={token}
      invite={result.invite}
      danceClass={result.danceClass}
      auditionSessions={result.auditionSessions}
    />
  );
}
