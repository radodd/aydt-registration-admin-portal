import { EmailStatus } from "@/types";

const CONFIG: Record<
  EmailStatus,
  { label: string; className: string }
> = {
  draft: {
    label: "Draft",
    className: "bg-neutral-100 text-neutral-600 border-neutral-200",
  },
  scheduled: {
    label: "Scheduled",
    className: "bg-lavender/20 text-lavender-text border-lavender",
  },
  sending: {
    label: "Sending…",
    className: "bg-primary-100 text-primary-700 border-primary-200",
  },
  sent: {
    label: "Sent",
    className: "bg-mint/20 text-mint-text border-mint",
  },
  failed: {
    label: "Failed",
    className: "bg-pale-rose/30 text-pale-rose-text border-pale-rose",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-neutral-50 text-neutral-500 border-neutral-200",
  },
};

export function EmailStatusBadge({ status }: { status: EmailStatus }) {
  const { label, className } = CONFIG[status] ?? CONFIG.draft;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${className}`}
    >
      {label}
    </span>
  );
}
