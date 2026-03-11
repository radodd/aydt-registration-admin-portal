"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useEffect, Suspense } from "react";
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
import { createClient } from "@/utils/supabase/client";

/* -------------------------------------------------------------------------- */
/* Inner form (needs RegistrationProvider in tree)                            */
/* -------------------------------------------------------------------------- */

function EmailForm({ semesterId }: { semesterId: string }) {
  const router = useRouter();
  const { setEmail, setParentCheck } = useRegistration();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // true while we're checking whether the user is already logged in
  const [authChecking, setAuthChecking] = useState(true);

  const participantsPath = `/register/participants?semester=${semesterId}`;

  // --- Auth bypass: skip email step for already-authenticated users ---
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        // Seed provider state so downstream steps have the authenticated user's info
        setEmail(user.email ?? "");
        setParentCheck(true, user.id);
        router.replace(participantsPath);
      } else {
        setAuthChecking(false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // Encode the full destination so the semester param survives the redirect
      const next = encodeURIComponent(participantsPath);
      if (result.exists) {
        // Existing parent — send to login, return to registration after auth
        router.push(`/auth/login?next=${next}`);
      } else {
        // New parent — create account first, then return to registration
        router.push(`/auth?next=${next}&email=${encodeURIComponent(data.email)}`);
      }
    } catch {
      setServerError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Show nothing while we determine auth state (avoids flashing the email form)
  if (authChecking) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const signInHref = `/auth/login?next=${encodeURIComponent(participantsPath)}`;

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
        <a href={signInHref} className="text-indigo-600 hover:underline">
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
