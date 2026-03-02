"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, Suspense } from "react";
import {
  RegistrationProvider,
  useRegistration,
} from "@/app/providers/RegistrationProvider";
import { CartProvider } from "@/app/providers/CartProvider";
import { CartRestoreGuard } from "./CartRestoreGuard";
import { checkParentByEmail } from "./actions/checkParent";
import {
  emailStepSchema,
  type EmailStepData,
} from "@/lib/schemas/registration";

/* -------------------------------------------------------------------------- */
/* Inner form (needs RegistrationProvider in tree)                            */
/* -------------------------------------------------------------------------- */

function EmailForm({ semesterId }: { semesterId: string }) {
  const router = useRouter();
  const { setEmail, setParentCheck } = useRegistration();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmailStepData>({
    resolver: zodResolver(emailStepSchema),
  });

  async function onSubmit(data: EmailStepData) {
    setIsSubmitting(true);
    setServerError(null);
    try {
      const result = await checkParentByEmail(data.email);
      setEmail(data.email);
      setParentCheck(result.exists, result.parentId);
      console.log(result);
      if (result.exists) {
        // Existing parent — redirect to login, return after auth
        router.push(
          `/auth/login?next=/register/participants&semester=${semesterId}`,
        );
      } else {
        // New parent — continue onboarding
        router.push(`/register/participants?semester=${semesterId}`);
      }
    } catch {
      setServerError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Let&apos;s get started
        </h1>
        <p className="text-gray-500 text-sm">
          Enter your email to create an account or sign in.
        </p>
      </div>

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          Email address
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          {...register("email")}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
        />
        {errors.email && (
          <p className="mt-1.5 text-sm text-red-600">{errors.email.message}</p>
        )}
      </div>

      {serverError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {serverError}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-60"
      >
        {isSubmitting ? "Checking…" : "Continue"}
      </button>

      <p className="text-xs text-gray-400 text-center">
        Already have an account?{" "}
        <a
          href={`/auth/login?next=/register/participants&semester=${semesterId}`}
          className="text-indigo-600 hover:underline"
        >
          Sign in
        </a>
      </p>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Page — bootstraps providers then renders the email form                    */
/* -------------------------------------------------------------------------- */

function RegisterPageInner() {
  const params = useSearchParams();
  const semesterId = params.get("semester") ?? "";

  if (!semesterId) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 mb-4">No semester selected.</p>
        <a href="/" className="text-indigo-600 hover:underline text-sm">
          Browse semesters
        </a>
      </div>
    );
  }

  return (
    <CartRestoreGuard semesterId={semesterId}>
      <RegistrationProvider semesterId={semesterId}>
        <EmailForm semesterId={semesterId} />
      </RegistrationProvider>
    </CartRestoreGuard>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterPageInner />
    </Suspense>
  );
}
