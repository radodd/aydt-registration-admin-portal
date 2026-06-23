import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise and must be awaited — reading `.next`
  // off the un-awaited object silently yields undefined and drops `?next=`.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next } = await searchParams;
  const nextParam = typeof next === "string" && next ? `?next=${encodeURIComponent(next)}` : "";
  redirect(`/auth${nextParam}`);
}
