import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { PreviewBanner } from "@/app/components/public/PreviewBanner";
import { PreviewProviders } from "./PreviewProviders";

interface Props {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

/**
 * Admin-only layout for the semester preview flow.
 *
 * Guards:
 * - Must be authenticated
 * - Must have role "super_admin"
 *
 * Injects:
 * - Sticky amber PREVIEW MODE banner
 * - Top padding to clear the banner
 */
export default async function PreviewLayout({ params, children }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  /* ---------------------------------------------------------------------- */
  /* Auth guard                                                               */
  /* ---------------------------------------------------------------------- */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?next=/preview/semester/${id}`);
  }

  const { data: userRecord } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (userRecord?.role !== "super_admin") {
    redirect("/");
  }

  /* ---------------------------------------------------------------------- */
  /* Render                                                                   */
  /* ---------------------------------------------------------------------- */
  return (
    <div className="min-h-screen bg-neutral-50">
      <PreviewBanner semesterId={id} />

      {/* Push content below the fixed banner (~40px) */}
      <div className="pt-10">
        {/* Minimal nav shell for preview */}
        <header className="bg-white border-b border-neutral-200">
          <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
            <span className="text-lg font-bold text-neutral-900 tracking-tight">
              American Youth Dance Theater
            </span>
            <span className="text-xs text-mauve-text font-semibold bg-mauve/10 px-3 py-1 rounded-full border border-mauve">
              Admin Preview
            </span>
          </nav>
        </header>

        <main>
          <PreviewProviders semesterId={id}>
            {children}
          </PreviewProviders>
        </main>
      </div>
    </div>
  );
}
