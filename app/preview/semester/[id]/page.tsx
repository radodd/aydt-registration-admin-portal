import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSemesterForDisplay } from "@/app/actions/getSemesterForDisplay";
import { SemesterDataProvider } from "@/app/providers/SemesterDataProvider";
import { CartProvider } from "@/app/providers/CartProvider";
import { SessionGrid } from "@/app/components/public/SessionGrid";
import { CartDrawer } from "@/app/components/public/CartDrawer";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const semester = await getSemesterForDisplay(id, "preview");
    return { title: `[Preview] ${semester.name} — AYDT` };
  } catch {
    return { title: "Preview — AYDT" };
  }
}

export default async function PreviewSemesterPage({ params }: Props) {
  const { id } = await params;

  let semester;
  try {
    // "preview" mode: fetches any status (draft, scheduled, published)
    semester = await getSemesterForDisplay(id, "preview");
  } catch {
    notFound();
  }

  return (
    /* CartProvider in preview mode keeps cart in-memory only */
    <SemesterDataProvider semester={semester} mode="preview">
      <CartProvider semesterId={semester.id} preview>
        <div className="max-w-6xl mx-auto px-6 py-10">
          {/* Hero */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-3">
              <p className="text-sm text-indigo-600 font-medium">
                {semester.startDate && semester.endDate
                  ? `${fmtDate(semester.startDate)} – ${fmtDate(semester.endDate)}`
                  : "Dates TBD"}
              </p>
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-medium capitalize">
                {semester.status}
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
              {semester.name}
            </h1>
            {semester.description && (
              <p className="text-gray-600 text-lg leading-relaxed max-w-2xl">
                {semester.description}
              </p>
            )}
          </div>

          {/* Session grid (same component as live) */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Available Sessions
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              This is a preview — sessions shown below reflect the current draft
              state.
            </p>

            {semester.sessions.length === 0 ? (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-10 text-center">
                <p className="text-gray-500">
                  No sessions have been added to this semester yet.
                </p>
              </div>
            ) : (
              <SessionGrid
                sessions={semester.sessions}
                groups={semester.sessionGroups}
              />
            )}
          </div>
        </div>

        {/* Cart drawer (in-memory preview cart) */}
        <CartDrawer />
      </CartProvider>
    </SemesterDataProvider>
  );
}

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
