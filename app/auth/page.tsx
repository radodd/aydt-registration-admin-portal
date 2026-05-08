"use client";

import { useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { login, signUp } from "./actions";
import { z } from "zod";
import { extractMessages, formDataToObject, signUpSchema } from "../lib/validation/auth";
import "./auth.css";

function AuthForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const prefillEmail = searchParams.get("email") ?? "";
  const tabParam = searchParams.get("tab");
  const errorParam = searchParams.get("error");

  const messageParam = searchParams.get("message");
  const prefillEmailFromMessage = searchParams.get("email") ?? "";

  const [activeTab, setActiveTab] = useState<"login" | "signup">(
    tabParam === "signup" ? "signup" : "login"
  );
  const [signupErrors, setSignupErrors] = useState<Record<string, string>>({});
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [showSignupPw, setShowSignupPw] = useState(false);
  const signupRef = useRef<HTMLFormElement>(null);

  const handleSignupValidation = (e: React.FormEvent<HTMLFormElement>) => {
    if (!signupRef.current) return;
    const formData = new FormData(signupRef.current);
    const values = formDataToObject(formData);
    const validated = signUpSchema.safeParse(values);
    if (!validated.success) {
      e.preventDefault();
      const tree = z.treeifyError(validated.error);
      setSignupErrors(extractMessages(tree));
      return;
    }
    setSignupErrors({});
  };

  const EyeIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
  const EyeOffIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );

  return (
    <div className="aydt-auth-shell">
      {/* Brand panel */}
      <div className="aydt-brand-panel">
        <div className="aydt-brand-inner">
          <div className="aydt-brand-logo">
            <div className="aydt-brand-logo-mark">
              AY
            </div>
            <div className="aydt-brand-logo-text">
              American Youth Dance Theater
              <span>Registration Portal</span>
            </div>
          </div>

          <div className="aydt-brand-center">
            <h1 className="aydt-brand-headline">
              American Youth<br />Dance <em>Theater.</em>
            </h1>
            <p className="aydt-brand-tagline">Where joy and technique take center stage.</p>
          </div>

          <div className="aydt-brand-footer">© 2026 American Youth Dance Theater</div>
        </div>
      </div>

      {/* Form panel */}
      <div className="aydt-form-panel">
        <div className="aydt-form-inner">
          {/* Check email confirmation screen */}
          {messageParam === "check_email" && (
            <div>
              <h2 className="aydt-auth-heading">Check your email</h2>
              <p className="aydt-auth-subhead">
                We sent a confirmation link to{" "}
                {prefillEmailFromMessage ? <strong>{prefillEmailFromMessage}</strong> : "your email address"}.
                Click the link to activate your account.
              </p>
              <p style={{ fontSize: 14, color: "var(--color-text-muted, #6b7280)", marginTop: 12 }}>
                Didn&apos;t get it? Check your spam folder, or{" "}
                <button
                  type="button"
                  className="aydt-auth-link"
                  onClick={() => setActiveTab("signup")}
                >
                  try signing up again
                </button>
                .
              </p>
            </div>
          )}

          {/* Login screen */}
          {!messageParam && activeTab === "login" && (
            <div>
              <h2 className="aydt-auth-heading">Welcome back</h2>
              <p className="aydt-auth-subhead">Sign in to manage your family&apos;s registrations.</p>

              {errorParam === "invalid_credentials" && (
                <div className="aydt-auth-error">Invalid email or password. Please try again.</div>
              )}
              {errorParam === "email_exists" && (
                <div className="aydt-auth-error">
                  An account with this email already exists. Log in instead.
                </div>
              )}
              {errorParam === "signup_disabled" && (
                <div className="aydt-auth-error">
                  New signups are temporarily disabled. Please contact an administrator.
                </div>
              )}

              <form id="login-form">
                <input type="hidden" name="next" value={next} />

                <div className="aydt-field">
                  <label className="aydt-label" htmlFor="login-email">Email address</label>
                  <input
                    id="login-email"
                    className="aydt-input"
                    type="email"
                    name="email"
                    placeholder="you@example.com"
                    autoComplete="username"
                  />
                </div>

                <div className="aydt-field">
                  <label className="aydt-label" htmlFor="login-password">Password</label>
                  <div className="aydt-pw-wrap">
                    <input
                      id="login-password"
                      className="aydt-input"
                      name="password"
                      type={showLoginPw ? "text" : "password"}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      style={{ paddingRight: 42 }}
                    />
                    <button
                      type="button"
                      className="aydt-pw-toggle"
                      onClick={() => setShowLoginPw((v) => !v)}
                    >
                      {showLoginPw ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>

                <div className="aydt-forgot-row">
                  <a className="aydt-forgot-link" href="/auth/request-password-reset">
                    Forgot your password?
                  </a>
                </div>

                <button type="submit" className="aydt-btn-primary" formAction={login}>
                  Log in
                </button>

                <div className="aydt-auth-footer">
                  New to AYDT?{" "}
                  <button
                    type="button"
                    className="aydt-auth-link"
                    onClick={() => setActiveTab("signup")}
                  >
                    Create an account
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Signup screen */}
          {!messageParam && activeTab === "signup" && (
            <div>
              <h2 className="aydt-auth-heading">Create your account</h2>
              <p className="aydt-auth-subhead">Set up your family account to get started.</p>

              <form ref={signupRef} action={signUp} onSubmit={handleSignupValidation} noValidate>
                {next && <input type="hidden" name="next" value={next} />}

                <div className="aydt-form-row">
                  <div className="aydt-field">
                    <label className="aydt-label">First name</label>
                    <input
                      className="aydt-input"
                      type="text"
                      name="first_name"
                      placeholder="Jane"
                      autoComplete="given-name"
                    />
                    {signupErrors.first_name && (
                      <span className="aydt-field-error">{signupErrors.first_name}</span>
                    )}
                  </div>
                  <div className="aydt-field">
                    <label className="aydt-label">Last name</label>
                    <input
                      className="aydt-input"
                      type="text"
                      name="last_name"
                      placeholder="Smith"
                      autoComplete="family-name"
                    />
                    {signupErrors.last_name && (
                      <span className="aydt-field-error">{signupErrors.last_name}</span>
                    )}
                  </div>
                </div>

                <div className="aydt-field">
                  <label className="aydt-label">Email address</label>
                  <input
                    className="aydt-input"
                    type="email"
                    name="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    defaultValue={prefillEmail}
                  />
                  {signupErrors.email && (
                    <span className="aydt-field-error">{signupErrors.email}</span>
                  )}
                </div>

                <div className="aydt-field">
                  <label className="aydt-label">Password</label>
                  <div className="aydt-pw-wrap">
                    <input
                      className="aydt-input"
                      name="password"
                      type={showSignupPw ? "text" : "password"}
                      placeholder="Create a password"
                      autoComplete="new-password"
                      style={{ paddingRight: 42 }}
                    />
                    <button
                      type="button"
                      className="aydt-pw-toggle"
                      onClick={() => setShowSignupPw((v) => !v)}
                    >
                      {showSignupPw ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                  <p className="aydt-pw-hint">At least 6 characters</p>
                  {signupErrors.password && (
                    <span className="aydt-field-error">{signupErrors.password}</span>
                  )}
                </div>

                <button type="submit" className="aydt-btn-primary" style={{ marginTop: 8 }}>
                  Create account
                </button>

                <div className="aydt-auth-footer">
                  Already have an account?{" "}
                  <button
                    type="button"
                    className="aydt-auth-link"
                    onClick={() => setActiveTab("login")}
                  >
                    Log in
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}
