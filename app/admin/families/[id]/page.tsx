import { notFound } from "next/navigation";
import { getFamilyDetail } from "@/queries/admin/getFamilyDetail";
import type { FocusTarget } from "@/types";
import { FamilyDetailClient } from "./_components/FamilyDetailClient";
import { FamilyRightPanel } from "./_components/FamilyRightPanel";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ focus?: string }>;
}

export default async function FamilyDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { focus } = await searchParams;

  const family = await getFamilyDetail(id);
  if (!family) notFound();

  // Resolve initial focus from URL param, fallback to primary parent
  const primaryParent = family.users.find((u) => u.is_primary_parent) ?? family.users[0];
  const defaultFocus: FocusTarget = primaryParent
    ? { type: "parent", id: primaryParent.id }
    : family.dancers[0]
    ? { type: "dancer", id: family.dancers[0].id }
    : { type: "parent", id: "" };

  let initialFocus: FocusTarget = defaultFocus;

  if (focus?.startsWith("parent:")) {
    const userId = focus.slice(7);
    if (family.users.some((u) => u.id === userId)) {
      initialFocus = { type: "parent", id: userId };
    }
  } else if (focus?.startsWith("dancer:")) {
    const dancerId = focus.slice(7);
    if (family.dancers.some((d) => d.id === dancerId)) {
      initialFocus = { type: "dancer", id: dancerId };
    }
  }

  return (
    <div className="flex gap-0 md:-mx-8 md:-my-8" style={{ minHeight: "calc(100vh - 56px)" }}>
      <FamilyDetailClient family={family} initialFocus={initialFocus} />
      <div className="hidden lg:block">
        <FamilyRightPanel family={family} />
      </div>
    </div>
  );
}
