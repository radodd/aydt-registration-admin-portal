import { redirect } from "next/navigation";
import { acceptWaitlistInvite } from "../../actions/acceptWaitlistInvite";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ cancelled?: string }>;
};

/**
 * Meeting-plan #5, Path A landing page. Validates the admin-sent token, mints a
 * pending order + enrollment, and redirects the family straight to Elavon hosted
 * checkout. No free/zero-dollar seat is ever created — the seat is only real
 * once the EPG webhook confirms payment.
 */
export default async function WaitlistAcceptPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { cancelled } = await searchParams;

  if (cancelled) {
    return (
      <StatusPage
        tone="neutral"
        title="Payment cancelled"
        message="You can use the same link again to complete your payment, or contact AYDT if you need a new one."
      />
    );
  }

  const result = await acceptWaitlistInvite(token);

  if (result.ok) {
    redirect(result.paymentSessionUrl);
  }

  const tone = result.reason === "needs_admin" ? "neutral" : "error";
  const title =
    result.reason === "needs_admin"
      ? "We'll be in touch"
      : result.reason === "expired"
        ? "Invitation expired"
        : result.reason === "not_invited"
          ? "Invite unavailable"
          : "Something went wrong";

  return <StatusPage tone={tone} title={title} message={result.message} />;
}

function StatusPage({
  tone,
  title,
  message,
}: {
  tone: "error" | "neutral";
  title: string;
  message: string;
}) {
  const iconBg = tone === "error" ? "bg-red-100" : "bg-mauve/10";
  const iconColor = tone === "error" ? "text-red-500" : "text-mauve-text";
  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-neutral-200 rounded-2xl shadow-sm p-8 space-y-4">
        <div className={`flex items-center justify-center w-12 h-12 rounded-full ${iconBg}`}>
          <svg
            className={`w-6 h-6 ${iconColor}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {tone === "error" ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            )}
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
        <p className="text-sm text-neutral-500">{message}</p>
        <p className="text-xs text-neutral-400">
          Questions? Contact us at{" "}
          <a href="mailto:info@aydt.com" className="underline">
            info@aydt.com
          </a>
        </p>
      </div>
    </div>
  );
}
