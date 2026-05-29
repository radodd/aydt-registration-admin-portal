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
    <form onSubmit={handleSubmit(onSubmit)} className="reg-email-wrap">
      <h1 className="reg-email-heading">Enter your email address</h1>
      <p className="reg-email-subhead">
        In preview mode, email lookup is skipped — use any email to walk through
        the flow as a parent would.
      </p>

      <div>
        <label htmlFor="email" className="reg-email-label">
          Email address
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          {...register("email")}
          className="reg-email-input"
        />
        {errors.email && (
          <p className="mt-1.5 text-sm text-red-600">{errors.email.message}</p>
        )}
        <p className="reg-email-hint">
          No sign-in link is sent and no account is created in preview.
        </p>
      </div>

      <button type="submit" disabled={isSubmitting} className="reg-email-submit">
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
