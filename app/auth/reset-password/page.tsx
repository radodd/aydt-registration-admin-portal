"use client";

import { resetPassword } from "../actions";

import { FormField } from "@/app/components/form/FormField";

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <h1 className="text-2xl font-semibold mb-6 text-gray-900">
          Reset your password
        </h1>

        <form action={resetPassword} className="space-y-4">
          <div>
            <FormField
              label={"Password"}
              name={"password"}
              type={"password"}
              placeholder={"Enter your password"}
            />
            <FormField
              label={"Password"}
              name={"password"}
              type={"password"}
              placeholder={"Verify your password"}
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-900 text-white py-3 rounded-xl mt-2 hover:bg-blue-800 transition"
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
      </div>
    </div>
  );
}
