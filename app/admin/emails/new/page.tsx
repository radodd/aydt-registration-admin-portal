"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createEmailDraft } from "../actions/createEmailDraft";

export default function NewEmailPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createEmailDraft()
      .then(({ emailId }) => {
        router.replace(`/admin/emails/${emailId}/edit?step=setup`);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to create email");
      });
  }, [router]);

  if (error) {
    return (
      <div className="max-w-xl mx-auto mt-16 p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-64">
      <p className="text-sm text-gray-500">Creating draft…</p>
    </div>
  );
}
