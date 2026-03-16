import { Badge, BadgeStatus } from "@/app/components/ui";

/** @deprecated Import <Badge status={...}> from @/app/components/ui directly */
export function StatusBadge({ status }: { status: string }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return <Badge status={status as BadgeStatus}>{label}</Badge>;
}
