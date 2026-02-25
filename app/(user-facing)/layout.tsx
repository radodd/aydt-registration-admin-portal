import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { AuthProvider } from "@/app/providers/AuthProvider";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let firstName: string | null = null;
  if (user) {
    const { data } = await supabase
      .from("users")
      .select("first_name")
      .eq("id", user.id)
      .single();
    firstName = data?.first_name ?? null;
  }

  return (
    <AuthProvider>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* ---------------------------------------------------------------- */}
        {/* Navigation                                                        */}
        {/* ---------------------------------------------------------------- */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
          <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
            {/* Brand */}
            <Link
              href="/"
              className="text-lg font-bold text-gray-900 tracking-tight hover:text-indigo-600 transition-colors"
            >
              American Youth Dance Theater
            </Link>

            {/* Nav links */}
            <div className="hidden sm:flex items-center gap-6">
              <Link
                href="/"
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                Semesters
              </Link>
              {user && (
                <>
                  {/* <Link
                    href="/family"
                    className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    My Family
                  </Link> */}
                  <Link
                    href="/profile"
                    className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    Profile
                  </Link>
                </>
              )}
            </div>

            {/* Auth CTA */}
            <div className="flex items-center gap-3">
              {user ? (
                <div className="flex items-center gap-3">
                  <span className="hidden sm:block text-sm text-gray-500">
                    Hi, {firstName ?? "there"}
                  </span>
                  <Link
                    href="/profile"
                    className="text-sm bg-gray-100 text-gray-700 px-4 py-2 rounded-xl hover:bg-gray-200 transition-colors font-medium"
                  >
                    Account
                  </Link>
                </div>
              ) : (
                <Link
                  href="/auth/login"
                  className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors font-medium"
                >
                  Sign In
                </Link>
              )}
            </div>
          </nav>
        </header>

        {/* ---------------------------------------------------------------- */}
        {/* Page content                                                      */}
        {/* ---------------------------------------------------------------- */}
        <main className="flex-1">{children}</main>

        {/* ---------------------------------------------------------------- */}
        {/* Footer                                                            */}
        {/* ---------------------------------------------------------------- */}
        <footer className="bg-white border-t border-gray-200 py-8 mt-auto">
          <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-500">
              © {new Date().getFullYear()} American Youth Dance Theater. All
              rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <Link
                href="/auth/login"
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                Admin Login
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </AuthProvider>
  );
}
