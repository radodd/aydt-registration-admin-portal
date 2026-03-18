import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getFamilyDetail } from "@/queries/admin/getFamilyDetail";
import type { FocusTarget } from "@/types";
import { FamilyDetailClient } from "../../families/[id]/_components/FamilyDetailClient";
import { FamilyRightPanel } from "../../families/[id]/_components/FamilyRightPanel";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DancerDetailPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: dancer } = await supabase
    .from("dancers")
    .select("id, family_id")
    .eq("id", id)
    .single();

  if (!dancer?.family_id) notFound();

  const family = await getFamilyDetail(dancer.family_id);
  if (!family) notFound();

  // Confirm the dancer actually belongs to this family
  const dancerInFamily = family.dancers.some((d) => d.id === id);
  if (!dancerInFamily) notFound();

  const initialFocus: FocusTarget = { type: "dancer", id };

  return (
    <div className="flex gap-0 -mx-8 -my-8" style={{ minHeight: "calc(100vh - 52px)" }}>
      <FamilyDetailClient family={family} initialFocus={initialFocus} />
      <FamilyRightPanel family={family} />
    </div>
  );
}
