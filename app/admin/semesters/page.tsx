import { redirect } from "next/navigation";

// The semester list now lives on the /admin dashboard ("Semesters" card), which is
// the single source of truth. This route is kept so existing links (TopBar, MobileNav,
// NotificationBell, post-save redirects in SemesterForm) continue to resolve.
export default function SemesterListPage() {
  redirect("/admin");
}
