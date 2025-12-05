"use client";

import { login, signOut, signUp } from "../actions";

export default function LogInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <h1 className="text-2xl font-semibold mb-6 text-gray-900">
          Create an account
        </h1>

        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              placeholder="Enter your mail"
              className="w-full p-3 rounded-xl bg-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              placeholder="Enter your password"
              className="w-full p-3 rounded-xl bg-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
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
          New to AYDT's Portal?{" "}
          <a className="text-blue-700 font-medium" href="/auth">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}
