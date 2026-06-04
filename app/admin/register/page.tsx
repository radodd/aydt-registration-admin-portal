import { createClient } from "@/utils/supabase/server";
import AdminRegisterFlow from "./AdminRegisterFlow";
import type { NewDancerInput } from "./actions/createAdminRegistration";

type InitialDancer = {
  id: string;
  name: string;
  familyId: string | null;
  parentUserId: string | null;
};

type Props = {
  searchParams: Promise<{
    semester?: string;
    dancer?: string;
    family?: string;
    /** Meeting-plan #25: pre-load this waitlist entry (dancer + class + form). */
    fromWaitlist?: string;
  }>;
};

export default async function AdminRegisterPage({ searchParams }: Props) {
  const {
    semester: semesterId,
    dancer: dancerParam,
    family: familyParam,
    fromWaitlist,
  } = await searchParams;
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

  // Meeting-plan #25: pre-load a waitlist entry into the flow. Resolves the same
  // targets as the inline Path-B action (registerWaitlistEntryInPortal) but feeds
  // the registration UI rather than creating the order directly — so the admin
  // reviews/adjusts before submitting. Works for brand-new dancers (no dancer
  // row) which the ?dancer= param can't carry.
  let initialNewDancer: { input: NewDancerInput; name: string } | null = null;
  let initialScheduleIds: string[] = [];
  let initialSessionIds: string[] = [];
  let initialTierIdByClass: Record<string, string> = {};
  let initialFormData: Record<string, unknown> = {};
  let waitlistEntryId: string | null = null;

  if (fromWaitlist) {
    const { data: entry } = await supabase
      .from("waitlist_entries")
      .select(
        "id, status, dancer_id, family_id, parent_user_id, class_id, section_id, meeting_id, class_tier_id, form_data, contact_name, dancers(first_name, last_name), classes(name, semester_id, semesters(name))",
      )
      .eq("id", fromWaitlist)
      .maybeSingle();

    if (entry) {
      waitlistEntryId = entry.id as string;

      // Semester (from the class).
      const classRel = entry.classes as
        | { semester_id?: string; semesters?: { name?: string } | { name?: string }[] }
        | { semester_id?: string; semesters?: { name?: string } | { name?: string }[] }[]
        | null;
      const cls = Array.isArray(classRel) ? classRel[0] : classRel;
      const semRel = Array.isArray(cls?.semesters) ? cls?.semesters[0] : cls?.semesters;
      if (cls?.semester_id) {
        initialSemester = { id: cls.semester_id, name: semRel?.name ?? "" };
      }

      // Enrollment target: standard/tiered → section (scheduleId); drop-in → meeting.
      if (entry.section_id) {
        initialScheduleIds = [entry.section_id as string];
        if (entry.class_tier_id && entry.class_id) {
          initialTierIdByClass = {
            [entry.class_id as string]: entry.class_tier_id as string,
          };
        }
      } else if (entry.meeting_id) {
        initialSessionIds = [entry.meeting_id as string];
      }

      // Form answers (strip the brand-new-dancer capture; it becomes newDancer).
      const formData = { ...(entry.form_data as Record<string, unknown> | null) };
      const newDancerRaw = (formData as { _newDancer?: Record<string, unknown> })._newDancer;
      delete (formData as { _newDancer?: unknown })._newDancer;
      initialFormData = formData;

      // Dancer: existing row, else brand-new captured in form_data._newDancer.
      const entryFamilyId = (entry.family_id as string | null) ?? null;
      const entryParentUserId = (entry.parent_user_id as string | null) ?? null;
      if (entry.dancer_id) {
        const dRel = entry.dancers as { first_name?: string; last_name?: string } | { first_name?: string; last_name?: string }[] | null;
        const d = Array.isArray(dRel) ? dRel[0] : dRel;
        const name = `${d?.first_name ?? ""} ${d?.last_name ?? ""}`.trim() ||
          entry.contact_name || "Waitlisted dancer";
        initialDancer = {
          id: entry.dancer_id as string,
          name,
          familyId: entryFamilyId,
          parentUserId: entryParentUserId,
        };
      } else if (newDancerRaw) {
        const nd = newDancerRaw as {
          firstName?: string;
          lastName?: string;
          dateOfBirth?: string;
          gender?: string;
        };
        const name = `${nd.firstName ?? ""} ${nd.lastName ?? ""}`.trim() ||
          entry.contact_name || "Waitlisted dancer";
        initialNewDancer = {
          input: {
            firstName: nd.firstName ?? "",
            lastName: nd.lastName ?? "",
            birthDate: nd.dateOfBirth ?? "",
            gender: nd.gender ?? "",
            grade: "",
            familyId: entryFamilyId,
          },
          name,
        };
      }
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
            : initialNewDancer
            ? `Registering ${initialNewDancer.name}`
            : initialSemester
            ? `Registering within ${initialSemester.name}`
            : "Admin registration flow"}
          {waitlistEntryId ? " (from waitlist)" : ""}
        </p>
      </div>

      <AdminRegisterFlow
        initialSemesterId={initialSemester?.id ?? ""}
        initialSemesterName={initialSemester?.name ?? ""}
        initialDancer={initialDancer}
        initialNewDancer={initialNewDancer}
        initialScheduleIds={initialScheduleIds}
        initialSessionIds={initialSessionIds}
        initialTierIdByClass={initialTierIdByClass}
        initialFormData={initialFormData}
        waitlistEntryId={waitlistEntryId}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
}
