"use client";

import { useRef, useState } from "react";
import { signUp } from "./actions";
import { z } from "zod";
import {
  extractMessages,
  formDataToObject,
  signUpSchema,
} from "../lib/validation/auth";
import { FormField } from "../components/form/FormField";

export default function SignUpPage() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const ref = useRef<HTMLFormElement>(null);

  const handleClientValidation = (e: React.FormEvent<HTMLFormElement>) => {
    if (!ref.current) return;

    const form = ref.current;
    const formData = new FormData(form);

    // ✔ Convert FormData into plain object
    const values = formDataToObject(formData);

    // ✔ Validate using Zod
    const validated = signUpSchema.safeParse(values);

    if (!validated.success) {
      e.preventDefault();
      const tree = z.treeifyError(validated.error);
      const simpleErrors = extractMessages(tree);
      setErrors(simpleErrors);
      return;
    }

    // ✔ Clear errors & allow server action to run
    setErrors({});
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <h1 className="text-2xl font-semibold mb-6 text-gray-900">
          Create an account
        </h1>

        <form
          ref={ref}
          action={signUp}
          onSubmit={handleClientValidation}
          className="space-y-4"
          noValidate
        >
          <div>
            <FormField
              label="First Name"
              name="first_name"
              placeholder="Enter you first name"
              error={errors.first_name}
            />
          </div>
          <div>
            <FormField
              label="Last Name"
              name="last_name"
              placeholder="Enter you last name"
              error={errors.last_name}
            />
          </div>
          <div>
            <FormField
              label="Email"
              name="email"
              type="email"
              placeholder="Enter you email"
              error={errors.email}
            />
          </div>
          <div>
            <FormField
              label="Password"
              name="password"
              type="password"
              placeholder="Enter you Password"
              error={errors.password}
            />
          </div>

          {/* <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" className="w-4 h-4" /> I agree to all the
            <a href="#" className="underline font-medium">
              Terms & Conditions
            </a>
          </label> */}

          <button
            type="submit"
            className="w-full bg-blue-900 text-white py-3 rounded-xl mt-2 hover:bg-blue-800 transition"
            // formAction={signUp}
          >
            Sign up
          </button>
        </form>

        <div className="flex items-center gap-4 my-6">
          <div className="h-px flex-1 bg-gray-300"></div>
          <span className="text-gray-500 text-sm">Or</span>
          <div className="h-px flex-1 bg-gray-300"></div>
        </div>

        <div className="flex gap-3">
          <button className="flex-1 border border-gray-300 py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-gray-100 transition">
            <span className="text-lg">🌐</span> Google
          </button>
          <button className="flex-1 border border-gray-300 py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-gray-100 transition">
            <span className="text-lg">📘</span> Facebook
          </button>
        </div>

        <p className="text-center text-sm text-gray-600 mt-6">
          Already have an account?{" "}
          <a className="text-blue-700 font-medium" href="/auth/login">
            Log in
          </a>
        </p>
      </div>
    </div>
  );
}
