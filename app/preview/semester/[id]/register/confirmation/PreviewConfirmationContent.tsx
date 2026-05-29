"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { useCart } from "@/app/providers/CartProvider";
import { useRegistration } from "@/app/providers/RegistrationProvider";
import { createClient } from "@/utils/supabase/client";
import { prepareEmailHtml } from "@/utils/prepareEmailHtml";

type EmailTemplate = { subject?: string; htmlBody?: string };

function fmt$$(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * Apply the same token set the EPG webhook uses when it sends the real
 * confirmation email (see app/api/webhooks/epg/route.ts). Unknown tokens are
 * left as-is. Must stay in sync with that send path.
 */
function applyTokens(input: string, tokens: Record<string, string>): string {
  let out = input;
  for (const [token, value] of Object.entries(tokens)) {
    out = out.replaceAll(token, value);
  }
  return out;
}

export function PreviewConfirmationContent({
  semesterId,
  semesterName,
  emailTemplate,
}: {
  semesterId: string;
  semesterName: string;
  emailTemplate: EmailTemplate;
}) {
  const router = useRouter();
  const { items, clear } = useCart();
  const { state, reset } = useRegistration();
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");

  /* Resolve names for any existing-dancer assignments (new dancers carry their
   * names inline on the participant). Mirrors the live payment page lookup. */
  const [dancerNames, setDancerNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const ids = state.participants
      .filter((p) => p.dancerId && !p.newDancer)
      .map((p) => p.dancerId!);
    if (ids.length === 0) return;
    const supabase = createClient();
    supabase
      .from("dancers")
      .select("id, first_name, last_name")
      .in("id", ids)
      .then(({ data }) => {
        if (!data) return;
        setDancerNames(
          new Map(data.map((d) => [d.id, `${d.first_name} ${d.last_name}`])),
        );
      });
  }, [state.participants]);

  const resolveDancerName = (
    p: (typeof state.participants)[number],
  ): string => {
    if (p.newDancer) {
      return `${p.newDancer.firstName} ${p.newDancer.lastName}`.trim();
    }
    if (p.dancerId) return dancerNames.get(p.dancerId) ?? "Dancer";
    return "Dancer";
  };

  /* One summary line per assigned participant: dancer ↔ the cart item whose
   * session they were assigned to. */
  const lineItems = useMemo(() => {
    return state.participants
      .filter((p) => p.dancerId || p.newDancer)
      .map((p) => {
        const owner = items.find((it) =>
          it.mode === "drop-in"
            ? (it.selectedDateIds ?? []).includes(p.sessionId)
            : it.sessionId === p.sessionId,
        );
        return {
          dancerName: resolveDancerName(p),
          className: owner?.className ?? "Class",
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.participants, items, dancerNames]);

  const total = useMemo(
    () => items.reduce((sum, it) => sum + (it.priceSnapshot ?? 0), 0),
    [items],
  );

  /* Token map — same keys the webhook resolves at send time. Parent identity
   * is mocked in preview (no real account), cart/class data is real. */
  const tokens = useMemo<Record<string, string>>(() => {
    const dancerList = [...new Set(lineItems.map((l) => l.dancerName))].join(", ");
    const classList = [...new Set(lineItems.map((l) => l.className))].join(", ");
    const registrationDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    return {
      "{{first_name}}": "Preview",
      "{{session_title}}": classList,
      "{{total_amount}}": fmt$$(total),
      "{{registration_date}}": registrationDate,
      "{{parent_first_name}}": "Preview",
      "{{parent_name}}": "Preview Parent",
      "{{semester_name}}": semesterName,
      "{{dancer_name}}": dancerList,
      "{{dancer_list}}": dancerList,
      "{{class_list}}": classList,
      "{{session_list}}": classList,
    };
  }, [lineItems, total, semesterName]);

  const hasTemplate = Boolean(emailTemplate.subject && emailTemplate.htmlBody);

  const previewSubject = useMemo(
    () => (emailTemplate.subject ? applyTokens(emailTemplate.subject, tokens) : ""),
    [emailTemplate.subject, tokens],
  );

  const previewHtml = useMemo(() => {
    if (!emailTemplate.htmlBody) return "";
    return prepareEmailHtml(applyTokens(emailTemplate.htmlBody, tokens));
  }, [emailTemplate.htmlBody, tokens]);

  function exitPreview() {
    clear();
    reset();
    router.push(`/preview/semester/${semesterId}`);
  }

  return (
    <div className="space-y-8">
      {/* Simulated confirmation banner */}
      <div className="rounded-xl border border-mauve bg-mauve/10 px-4 py-2.5 text-xs font-semibold text-mauve-text">
        Preview mode — this is a simulated confirmation. No payment was charged
        and no registration was created.
      </div>

      {/* Success header */}
      <div className="text-center">
        <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-500" />
        <h1 className="text-2xl font-bold text-neutral-900">
          [Preview] You&apos;re registered!
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          This is what a parent would see after completing registration for{" "}
          {semesterName}.
        </p>
      </div>

      {/* Order summary */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-neutral-900">
          Registration summary
        </h2>
        {lineItems.length === 0 ? (
          <p className="text-sm text-neutral-500">No sessions in this order.</p>
        ) : (
          <ul className="space-y-2.5">
            {lineItems.map((li, i) => (
              <li
                key={i}
                className="flex items-center justify-between border-b border-neutral-100 pb-2.5 text-sm last:border-0 last:pb-0"
              >
                <span className="text-neutral-700">{li.className}</span>
                <span className="text-neutral-500">{li.dancerName}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex items-center justify-between border-t border-neutral-200 pt-4 text-sm font-semibold text-neutral-900">
          <span>Total</span>
          <span>{fmt$$(total)}</span>
        </div>
      </div>

      {/* Confirmation email preview */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">
            Confirmation email
          </h2>
          {hasTemplate && (
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setPreviewMode("desktop")}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  previewMode === "desktop"
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                Desktop
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode("mobile")}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  previewMode === "mobile"
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                Mobile
              </button>
            </div>
          )}
        </div>

        {hasTemplate ? (
          <>
            <p className="mb-3 text-xs text-neutral-500">
              <span className="font-medium text-neutral-700">Subject:</span>{" "}
              {previewSubject}
            </p>
            <div className="overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
              {previewMode === "desktop" ? (
                <iframe
                  srcDoc={previewHtml}
                  title="Confirmation email preview"
                  className="h-[600px] w-full border-0 bg-white"
                />
              ) : (
                <div className="flex justify-center py-6">
                  <iframe
                    srcDoc={previewHtml}
                    title="Confirmation email preview (mobile)"
                    className="h-[600px] w-[375px] border-0 bg-white shadow-sm"
                  />
                </div>
              )}
            </div>
            <p className="mt-3 text-xs text-neutral-400">
              Rendered preview only — no email is sent in preview mode. Tokens
              are filled with this order&apos;s data ({"{{first_name}}"} and
              parent fields are mocked).
            </p>
          </>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            No confirmation email template is configured for this semester.
            Add one in the semester&apos;s <strong>Confirmation Email</strong>{" "}
            step so families receive a confirmation after registering.
          </div>
        )}
      </div>

      {/* Exit */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={exitPreview}
          className="rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
        >
          Exit preview
        </button>
      </div>
    </div>
  );
}
