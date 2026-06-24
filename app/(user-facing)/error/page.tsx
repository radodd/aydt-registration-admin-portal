"use client";

import Link from "next/link";

export default function ErrorPage() {
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "48px 24px",
        gap: 16,
        fontFamily: "var(--pub-font-primary)",
      }}
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--pub-text-muted)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>

      <h1
        style={{
          margin: 0,
          fontSize: 24,
          fontWeight: 600,
          color: "var(--pub-text-primary)",
        }}
      >
        Something went wrong
      </h1>

      <p
        style={{
          margin: 0,
          maxWidth: 420,
          fontSize: 15,
          lineHeight: 1.5,
          color: "var(--pub-text-muted)",
        }}
      >
        We hit an unexpected error. Please try again, or head back to the home
        page.
      </p>

      <Link href="/" className="btn-cta-plum" style={{ marginTop: 8 }}>
        Back to home
      </Link>
    </div>
  );
}
