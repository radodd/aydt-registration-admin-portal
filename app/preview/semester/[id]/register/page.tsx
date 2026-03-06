"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useRegistration } from "@/app/providers/RegistrationProvider";
import { emailStepSchema, type EmailStepData } from "@/lib/schemas/registration";

function PreviewEmailForm({ semesterId }: { semesterId: string }) {
  const router = useRouter();
  const { setEmail, setParentCheck } = useRegistration();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<EmailStepData>({
    resolver: zodResolver(emailStepSchema),
    defaultValues: { email: "preview@example.com" },
  });

  function onSubmit(data: EmailStepData) {
    setIsSubmitting(true);
    setEmail(data.email);
    setParentCheck(false, null);
    router.push(`/preview/semester/${semesterId}/register/participants`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          [Preview] Account step
        </h1>
        <p className="text-gray-500 text-sm">
          In preview mode, email lookup is skipped. You can use any email.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Email address
        </label>
        <input
          type="email"
          {...register("email")}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        {errors.email && (
          <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-colors text-sm disabled:opacity-60"
      >
        {isSubmitting ? "…" : "Continue"}
      </button>
    </form>
  );
}

export default function PreviewRegisterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <PreviewEmailForm semesterId={id} />
    </div>
  );
}
