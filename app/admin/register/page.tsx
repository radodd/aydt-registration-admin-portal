import { createClient } from "@/utils/supabase/server";
import AdminRegisterFlow from "./AdminRegisterFlow";

type InitialDancer = {
  id: string;
  name: string;
  familyId: string | null;
  parentUserId: string | null;
};

type Props = {
  searchParams: Promise<{ semester?: string; dancer?: string; family?: string }>;
};

export default async function AdminRegisterPage({ searchParams }: Props) {
  const { semester: semesterId, dancer: dancerParam, family: familyParam } = await searchParams;
  const supabase = await createClient();

  // Installment setup + partial-payment overrides are super-admin powers (#7).
  let isSuperAdmin = false;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: adminUser } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    isSuperAdmin = (adminUser as { role?: string } | null)?.role === "super_admin";
  }

  let initialSemester: { id: string; name: string } | null = null;
  if (semesterId) {
    const { data } = await supabase
      .from("semesters")
      .select("id, name")
      .eq("id", semesterId)
      .single();
    if (data) {
      initialSemester = { id: (data as any).id, name: (data as any).name };
    }
  }

  let initialDancer: InitialDancer | null = null;
  if (dancerParam) {
    const { data: dancer } = await supabase
      .from("dancers")
      .select("id, first_name, last_name, family_id")
      .eq("id", dancerParam)
      .single();

    if (dancer) {
      const d = dancer as any;
      const resolvedFamilyId = d.family_id ?? familyParam ?? null;

      let parentUserId: string | null = null;
      if (resolvedFamilyId) {
        const { data: primaryParent } = await supabase
          .from("users")
          .select("id")
          .eq("family_id", resolvedFamilyId)
          .eq("is_primary_parent", true)
          .maybeSingle();
        parentUserId = (primaryParent as any)?.id ?? null;
      }

      initialDancer = {
        id: d.id,
        name: `${d.first_name} ${d.last_name}`,
        familyId: resolvedFamilyId,
        parentUserId,
      };
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6 text-[#201D18] space-y-6">
      <div>
        {initialSemester && (
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#8E2A23] bg-[#FDF0EF] border border-[#C8A09D] px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[#8E2A23] inline-block" />
              {initialSemester.name}
            </span>
          </div>
        )}
        <h1 className="text-2xl font-semibold text-[#201D18]">Register Someone</h1>
        <p className="text-sm text-[#9E9890] mt-0.5">
          {initialDancer
            ? `Registering ${initialDancer.name}`
            : initialSemester
            ? `Registering within ${initialSemester.name}`
            : "Admin registration flow"}
        </p>
      </div>

      <AdminRegisterFlow
        initialSemesterId={initialSemester?.id ?? ""}
        initialSemesterName={initialSemester?.name ?? ""}
        initialDancer={initialDancer}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
}
