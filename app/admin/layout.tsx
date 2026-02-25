"use client";

import { createClient } from "@/utils/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) {
        router.push("/auth");
        return;
      }

      const { data: user } = await supabase
        .from("users")
        .select("role")
        .eq("id", authUser.id)
        .single();

      if (user?.role !== "super_admin") {
        router.push("/");
      } else {
        setIsAdmin(true);
      }
    })();
  }, [router, supabase]);

  if (isAdmin === null) {
    return <p className="text-center mt-10">Checking permissions...</p>;
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-gray-800 text-white p-4">
        <h2 className="font-bold text-lg mb-4">Admin Dashboard</h2>
        <nav className="space-y-2">
          {/* <a href="/admin" className="block hover:underline">
            Overview
          </a> */}
          <Link href="/admin/semesters" className="block hover:underline">
            Semesters
          </Link>
          <Link href="/admin/sessions" className="block hover:underline">
            Sessions
          </Link>
          <Link href="/admin/emails" className="block hover:underline">
            Emails
          </Link>
          <Link href="/admin/media" className="block hover:underline">
            Media
          </Link>
          <Link href="/admin/dancers" className="block hover:underline">
            Dancers
          </Link>
          <Link href="/admin/families" className="block hover:underline">
            Families
          </Link>
          <Link href="/admin/users" className="block hover:underline">
            Users
          </Link>
        </nav>
      </aside>

      <main className="flex-1 bg-gray-50 p-8">{children}</main>
    </div>
  );
}
