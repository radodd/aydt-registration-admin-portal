"use client";
import { CartProvider, useCart } from "@/app/providers/CartProvider";
import { RegistrationProvider } from "@/app/providers/RegistrationProvider";
import { useSearchParams, usePathname } from "next/navigation";

// 6-step flow: Sessions → Review Cart → Dancer Info → Reg. Info → Payment → Confirm
// Steps 0–1 are always "done" by the time the user enters /register/*.
const STEPS = [
  { key: "sessions",  label: "Sessions" },
  { key: "cart",      label: "Review\nCart" },
  { key: "dancers",   label: "Dancer\nInfo" },
  { key: "reginfo",   label: "Reg.\nInfo" },
  { key: "payment",   label: "Payment" },
  { key: "confirm",   label: "Confirm" },
];

function CartTimerBar() {
  const { secondsRemaining, itemCount } = useCart();
  if (itemCount === 0) return null;

  const m = Math.floor(secondsRemaining / 60);
  const s = secondsRemaining % 60;
  const display = `${m}:${String(s).padStart(2, "0")}`;
  const urgent = secondsRemaining <= 120;

  return (
    <div className={`reg-timer-bar${urgent ? " urgent" : ""}`}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke={urgent ? "#991B1B" : "#92400E"}
        strokeWidth="2.2"
        style={{ flexShrink: 0 }}
      >
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 15.5 13.5" />
      </svg>
      <span className="reg-timer-text">Cart reserved for</span>
      <span className="reg-timer-count">{display}</span>
    </div>
  );
}

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const semesterId = params.get("semester") ?? "";

  // The confirmation page is a terminal screen, not a step in the flow. It
  // stands on its own — no step indicator, cart timer, or cart providers
  // (the cart has already been cleared by ConfirmationCleanup). Render it bare
  // inside the surrounding user-facing shell.
  if (pathname.includes("/register/confirmation")) {
    return <>{children}</>;
  }

  // A waitlist join reuses the full flow but terminates at the waitlist-confirm
  // step instead of payment. The form step routes to /register/waitlist/confirm
  // WITHOUT the waitlist=1 query param, so detect the intent by either signal.
  const isWaitlist =
    params.get("waitlist") === "1" || pathname.includes("/register/waitlist");

  // Waitlist flow has no Payment step — drop it so the bar reads cleanly.
  const steps = isWaitlist ? STEPS.filter((s) => s.key !== "payment") : STEPS;

  // Map current URL segment to the active step index (0-based).
  // Steps 0–1 (Sessions, Review Cart) are always "done" on entry to /register/*.
  const activeStep = pathname.includes("/register/waitlist")
    ? steps.length - 1 // terminal "Confirm" step of the waitlist flow
    : pathname.includes("/register/payment")
      ? 4  // Payment (step 5)
      : pathname.includes("/register/form")
        ? 3  // Reg. Info (step 4)
        : pathname.includes("/register/participants")
          ? 2  // Dancer Info (step 3)
          : 1; // fallback

  return (
    <CartProvider semesterId={semesterId}>
      <div>
        {/* ── Step indicator — matches cart page 5-step layout ── */}
        <div className="cart-steps-bar">
          <div className="cart-steps-inner">
            <div className="reg-steps">
              {steps.map((step, i) => {
                const isDone = i < activeStep;
                const isActive = i === activeStep;
                return (
                  <div
                    key={step.key}
                    className={`reg-step${isDone ? " done" : ""}${isActive ? " active" : ""}`}
                  >
                    <div className="reg-step-circle">
                      {isDone ? (
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                          <path
                            d="M3 8l4 4 6-6"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : (
                        i + 1
                      )}
                    </div>
                    <div className="reg-step-label">
                      {step.label.split("\n").map((line, li) => (
                        <span key={li}>{li > 0 && <br />}{line}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Cart reservation timer ── */}
        <CartTimerBar />

        {/* ── Page content ── */}
        <RegistrationProvider semesterId={semesterId}>
          <div
            className={`${
              pathname.includes("/register/participants")
                ? "max-w-[1180px]"
                : "max-w-[860px]"
            } mx-auto px-6 py-10`}
          >
            {children}
          </div>
        </RegistrationProvider>
      </div>
    </CartProvider>
  );
}
