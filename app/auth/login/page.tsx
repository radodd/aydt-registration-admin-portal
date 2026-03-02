"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { login } from "../actions";
import { FormField } from "@/app/components/form/FormField";

function LogInForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const errorParam = searchParams.get("error");

  useEffect(() => {
    if (errorParam === "email_exists") {
      alert(
        "An account with this email already exists. Please log in instead."
      );
    }
  }, [errorParam]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <h1 className="text-2xl font-semibold mb-6 text-gray-900">
          Log into your account
        </h1>

        <form className="space-y-4">
          {/* Pass next through the form so the server action can redirect correctly */}
          <input type="hidden" name="next" value={next} />

          <div>
            <FormField
              label={"Email"}
              name={"email"}
              type={"email"}
              placeholder={"Enter your email"}
            />
          </div>

          <div>
            <FormField
              label={"Password"}
              name={"password"}
              type={"password"}
              placeholder={"Enter your password"}
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-900 text-white py-3 rounded-xl mt-2 hover:bg-blue-800 transition"
            formAction={login}
          >
            Log in
          </button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-6">
          New to AYDT&apos;s Portal?{" "}
          <a className="text-blue-700 font-medium" href="/auth">
            Sign up
          </a>
        </p>
        <p className="text-center text-sm text-gray-600 mt-6">
          Forgot your password?{" "}
          <a
            className="text-blue-700 font-medium"
            href="/auth/request-password-reset"
          >
            Reset password
          </a>
        </p>
      </div>
    </div>
  );
}

export default function LogInPage() {
  return (
    <Suspense>
      <LogInForm />
    </Suspense>
  );
}
