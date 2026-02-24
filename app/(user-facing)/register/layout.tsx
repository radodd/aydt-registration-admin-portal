import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Registration — AYDT",
};

const STEPS = [
  { key: "email", label: "Account" },
  { key: "participants", label: "Participants" },
  { key: "form", label: "Information" },
  { key: "payment", label: "Payment" },
];

/**
 * Shell layout for the registration flow.
 * The stepper UI is client-driven (driven by RegistrationProvider state),
 * so we render the step labels here as a static visual scaffold and let
 * each page fill in the active state via CSS.
 */
export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Step indicator bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <ol className="flex items-center gap-0">
            {STEPS.map((step, i) => (
              <li key={step.key} className="flex items-center flex-1">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-500 text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-sm text-gray-500 hidden sm:block">
                    {step.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="flex-1 h-px bg-gray-200 mx-3" />
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Page content */}
      <div className="max-w-2xl mx-auto px-6 py-10">{children}</div>
    </div>
  );
}
