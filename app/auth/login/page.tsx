import { redirect } from "next/navigation";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const next = searchParams.next;
  const nextParam = typeof next === "string" && next ? `?next=${encodeURIComponent(next)}` : "";
  redirect(`/auth${nextParam}`);
}
