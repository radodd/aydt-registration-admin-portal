import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { InstructorTopBar } from "./_components/InstructorTopBar";
import { InstructorMobileNav } from "./_components/InstructorMobileNav";

export default async function InstructorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) redirect("/auth");

  const { data: profile } = await supabase
    .from("users")
    .select("first_name, last_name, role")
    .eq("id", authUser.id)
    .single();

  // if (!profile || profile.role !== "instructor") redirect("/");

  const displayName = `${profile?.first_name} ${profile?.last_name}`;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--admin-page-bg)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-sans)",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <InstructorTopBar displayName={displayName} />

      {/*
        paddingBottom: leaves room for bottom tab nav on mobile (64px bar + 20px safe area).
        On md+ the bottom nav is hidden so we remove the padding.
      */}
      <main
        className="flex-1 px-4 py-5 md:px-8 md:py-8 pb-24 md:pb-8 overflow-x-hidden"
        style={{ maxWidth: "720px", margin: "0 auto", width: "100%" }}
      >
        {children}
      </main>

      <InstructorMobileNav />
    </div>
  );
}
