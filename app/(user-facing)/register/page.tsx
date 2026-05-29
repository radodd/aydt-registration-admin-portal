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

function EmailForm({
  semesterId,
  waitlist,
}: {
  semesterId: string;
  waitlist?: boolean;
}) {
  const router = useRouter();
  const { setEmail, setParentCheck } = useRegistration();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // true while we're checking whether the user is already logged in
  const [authChecking, setAuthChecking] = useState(true);

  // Meeting-plan #5: a waitlist join reuses the full registration flow; the
  // ?waitlist=1 intent is threaded through every step so the final step writes
  // a waitlist entry instead of charging.
  const participantsPath = `/register/participants?semester=${semesterId}${
    waitlist ? "&waitlist=1" : ""
  }`;

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
        <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const signInHref = `/auth/login?next=${encodeURIComponent(participantsPath)}`;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="reg-email-wrap">
      <h1 className="reg-email-heading">Enter your email address</h1>
      <p className="reg-email-subhead">
        We&apos;ll use this to sign you in or create your account to complete
        registration.
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
          Existing AYDT families will receive a sign-in link. New families will
          be guided through account setup.
        </p>
      </div>

      {serverError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
          {serverError}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="reg-email-submit"
      >
        {isSubmitting ? "Checking…" : "Continue"}
      </button>

      <p className="reg-email-signin">
        Already have an account?{" "}
        <a href={signInHref}>Sign in directly</a>
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
  const waitlist = params.get("waitlist") === "1";

  if (!semesterId) {
    return (
      <div className="text-center py-20">
        <p className="text-neutral-500 mb-4">No semester selected.</p>
        <a href="/" className="text-primary-600 hover:underline text-sm">
          Browse semesters
        </a>
      </div>
    );
  }

  return (
    <CartRestoreGuard semesterId={semesterId}>
      <RegistrationProvider semesterId={semesterId}>
        <EmailForm semesterId={semesterId} waitlist={waitlist} />
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
