import { createClient } from "@/utils/supabase/server";
import AdminRegisterFlow from "./AdminRegisterFlow";

type Props = {
  searchParams: Promise<{ semester?: string }>;
};

export default async function AdminRegisterPage({ searchParams }: Props) {
  const { semester: semesterId } = await searchParams;

  let initialSemester: { id: string; name: string } | null = null;
  if (semesterId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("semesters")
      .select("id, name")
      .eq("id", semesterId)
      .single();
    if (data) {
      initialSemester = { id: (data as any).id, name: (data as any).name };
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6 text-slate-700 space-y-6">
      <div>
        {initialSemester && (
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
              {initialSemester.name}
            </span>
          </div>
        )}
        <h1 className="text-2xl font-semibold text-slate-800">Register Someone</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          {initialSemester
            ? `Registering within ${initialSemester.name}`
            : "Admin registration flow"}
        </p>
      </div>

      <AdminRegisterFlow
        initialSemesterId={initialSemester?.id ?? ""}
        initialSemesterName={initialSemester?.name ?? ""}
      />
    </div>
  );
}
