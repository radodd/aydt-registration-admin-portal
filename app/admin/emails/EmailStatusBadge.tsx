import { EmailStatus } from "@/types";

const CONFIG: Record<
  EmailStatus,
  { label: string; className: string }
> = {
  draft: {
    label: "Draft",
    className: "bg-gray-100 text-gray-600 border-gray-200",
  },
  scheduled: {
    label: "Scheduled",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  sending: {
    label: "Sending…",
    className: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  sent: {
    label: "Sent",
    className: "bg-green-50 text-green-700 border-green-200",
  },
  failed: {
    label: "Failed",
    className: "bg-red-50 text-red-700 border-red-200",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-gray-50 text-gray-500 border-gray-200",
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
