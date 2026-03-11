import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSemesterForDisplay } from "@/app/actions/getSemesterForDisplay";
import { SemesterPageContent } from "./SemesterPageContent";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const semester = await getSemesterForDisplay(id, "live");
    return { title: `${semester.name} — AYDT Registration` };
  } catch {
    return { title: "Semester — AYDT Registration" };
  }
}

export default async function SemesterDetailPage({ params }: Props) {
  const { id } = await params;

  let semester;
  try {
    semester = await getSemesterForDisplay(id, "live");
  } catch {
    notFound();
  }

  // notFound() throws internally, so semester is always defined here.
  // The non-null assertion silences TypeScript's flow analysis gap.
  const s = semester!;

  // Compute open/closed on the server so both server and client render the same
  // initial tree — avoids hydration mismatch from Date.now() drift.
  const initialIsOpen =
    !s.registrationOpenAt || new Date(s.registrationOpenAt) <= new Date();

  console.log("[SemesterPage] server render", {
    id: s.id,
    status: s.status,
    registrationOpenAt: s.registrationOpenAt,
    serverNow: new Date().toISOString(),
    initialIsOpen,
  });

  return (
    <SemesterPageContent
      semester={s}
      paymentType={s.paymentPlan?.type}
      initialIsOpen={initialIsOpen}
    />
  );
}
