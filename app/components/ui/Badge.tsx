import { HTMLAttributes } from "react";

type BadgeStatus =
  | "draft"
  | "published"
  | "archived"
  | "scheduled"
  | "waitlist"
  | "pending"
  | "success"
  | "warning"
  | "info"
  | "neutral"
  | "error";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status?: BadgeStatus;
}

const statusClasses: Record<BadgeStatus, string> = {
  published:  "badge-success",
  success:    "badge-success",
  scheduled:  "badge-info",
  info:       "badge-info",
  waitlist:   "badge-warning",
  warning:    "badge-warning",
  draft:      "badge-neutral",
  neutral:    "badge-neutral",
  archived:   "badge-error",
  error:      "badge-error",
  pending:    "badge-primary",
};

function Badge({ status, className = "", children, ...props }: BadgeProps) {
  const colorClass = status ? statusClasses[status] : "badge-neutral";

  return (
    <span
      className={["badge", colorClass, className].filter(Boolean).join(" ")}
      {...props}
    >
      {children}
    </span>
  );
}

export { Badge };
export type { BadgeProps, BadgeStatus };
