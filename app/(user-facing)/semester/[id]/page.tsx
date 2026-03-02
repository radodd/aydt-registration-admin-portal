import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSemesterForDisplay } from "@/app/actions/getSemesterForDisplay";
import { SemesterDataProvider } from "@/app/providers/SemesterDataProvider";
import { CartProvider } from "@/app/providers/CartProvider";
import { SessionGrid } from "@/app/components/public/SessionGrid";
import { CartDrawer } from "@/app/components/public/CartDrawer";
import { CartExpiryTimer } from "@/app/components/public/CartExpiryTimer";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const semester = await getSemesterForDisplay(id, "live");
    return { title: `${semester.name} — AYDT Registration` };
  } catch (e) {
    console.log("error", e);
    return { title: "Semester — AYDT Registration" };
  }
}

export default async function SemesterDetailPage({ params }: Props) {
  const { id } = await params;
  console.log(id);
  let semester;
  try {
    semester = await getSemesterForDisplay(id, "live");
  } catch {
    notFound();
    console.log("not found");
  }

  console.log("SEMESTER IN USER SIDE", semester.daysOfWeek);
  console.log("FIRST SESSION", JSON.stringify(semester.sessions[0], null, 2));

  const paymentType = semester.paymentPlan?.type;

  return (
    <SemesterDataProvider semester={semester} mode="live">
      <CartProvider semesterId={semester.id}>
        <div className="max-w-6xl mx-auto px-6 py-10">
          {/* ---------------------------------------------------------------- */}
          {/* Hero                                                              */}
          {/* ---------------------------------------------------------------- */}
          <div className="mb-10">
            <p className="text-sm text-indigo-600 font-medium mb-2">
              {semester.startDate && semester.endDate
                ? `${fmtDate(semester.startDate)} – ${fmtDate(semester.endDate)}`
                : "Enrollment open"}
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
              {semester.name}
            </h1>
            {semester.description && (
              <p className="text-gray-600 text-lg leading-relaxed max-w-2xl">
                {semester.description}
              </p>
            )}

            {/* Payment plan badge */}
            {paymentType && (
              <div className="mt-4">
                <span className="inline-block text-xs font-medium bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-full">
                  {paymentPlanLabel(paymentType)}
                </span>
              </div>
            )}
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* Cart expiry (only shown when cart has items)                     */}
          {/* ---------------------------------------------------------------- */}
          <div className="mb-4">
            <CartExpiryTimer />
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* Session grid                                                      */}
          {/* ---------------------------------------------------------------- */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Available Sessions
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              Select sessions and choose your preferred days. Add to cart to
              continue.
            </p>

            {semester.sessions.length === 0 ? (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-10 text-center">
                <p className="text-gray-500">
                  No sessions are available for this semester yet.
                </p>
              </div>
            ) : (
              <SessionGrid
                sessions={semester.sessions}
                groups={semester.sessionGroups}
              />
            )}
          </div>
        </div>

        {/* Floating cart drawer */}
        <CartDrawer />
      </CartProvider>
    </SemesterDataProvider>
  );
}

/* -------------------------------------------------------------------------- */
/* Utility                                                                     */
/* -------------------------------------------------------------------------- */

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function paymentPlanLabel(
  type: "pay_in_full" | "deposit_flat" | "deposit_percent" | "installments",
): string {
  switch (type) {
    case "pay_in_full":
      return "Pay in full";
    case "deposit_flat":
    case "deposit_percent":
      return "Deposit + balance";
    case "installments":
      return "Installment plan available";
  }
}
