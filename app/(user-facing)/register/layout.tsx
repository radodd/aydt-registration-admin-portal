"use client";
import { CartProvider, useCart } from "@/app/providers/CartProvider";
import { RegistrationProvider } from "@/app/providers/RegistrationProvider";
import { useSearchParams, usePathname } from "next/navigation";

const STEPS = [
  { key: "email", label: "Account" },
  { key: "participants", label: "Dancers" },
  { key: "form", label: "Information" },
  { key: "payment", label: "Payment" },
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
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke={urgent ? "#991B1B" : "#92400E"}
        strokeWidth="2.2"
      >
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 15.5 13.5" />
      </svg>
      <span className="reg-timer-text">Your cart is reserved for</span>
      <span className="reg-timer-count">{display}</span>
      <span className="reg-timer-text">— complete checkout to secure your spot.</span>
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

  const activeStep = pathname.includes("/register/payment")
    ? 3
    : pathname.includes("/register/form")
      ? 2
      : pathname.includes("/register/participants")
        ? 1
        : 0;

  return (
    <CartProvider semesterId={semesterId}>
      <div>
        {/* Step indicator bar */}
        <div className="cart-steps-bar">
          <div className="cart-steps-inner">
            <div className="reg-steps">
              {STEPS.map((step, i) => {
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
                    <div className="reg-step-label">{step.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Cart reservation timer */}
        <CartTimerBar />

        {/* Page content */}
        <RegistrationProvider semesterId={semesterId}>
          <div className="max-w-[860px] mx-auto px-6 py-10">{children}</div>
        </RegistrationProvider>
      </div>
    </CartProvider>
  );
}
