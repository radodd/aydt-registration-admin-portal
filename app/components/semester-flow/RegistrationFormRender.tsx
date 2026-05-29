"use client";

import { useMemo, useState } from "react";
import {
  RegistrationFormElement,
  TextBlockFormatting,
  AddressValue,
  WaiverAcknowledgmentValue,
} from "@/types";
import AddressBlockField from "@/app/components/semester-flow/AddressBlockField";
import { isAddressComplete } from "@/lib/address";
import {
  isAcknowledged,
  makeAcknowledgment,
  DEFAULT_ACKNOWLEDGMENT_LABEL,
} from "@/lib/waiver";

type Props = {
  elements: RegistrationFormElement[];
  sessions: { sessionId: string }[];
  mode?: "preview" | "live";
};

/* -------------------------------------------------------------------------- */
/* Text Block Rendering Helpers                                                */
/* -------------------------------------------------------------------------- */

function buildTextClasses(fmt: TextBlockFormatting | undefined): string {
  if (!fmt) return "text-sm text-neutral-600 leading-relaxed";

  const colorClass =
    fmt.color === "indigo"
      ? "text-primary-600"
      : fmt.color === "gray"
        ? "text-neutral-500"
        : "text-neutral-900";

  return [
    fmt.style === "header" ? "text-lg font-semibold" : "text-sm",
    fmt.bold ? "font-bold" : "",
    fmt.italic ? "italic" : "",
    fmt.underline ? "underline" : "",
    colorClass,
    "leading-relaxed",
  ]
    .filter(Boolean)
    .join(" ");
}

function TextBlockContent({
  el,
}: {
  el: RegistrationFormElement;
}) {
  const fmt = el.textFormatting;
  const textClass = buildTextClasses(fmt);
  const content = el.label ?? "";

  function wrapLink(node: React.ReactNode): React.ReactNode {
    if (fmt?.link) {
      return (
        <a
          href={fmt.link}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {node}
        </a>
      );
    }
    return node;
  }

  if (fmt?.listType === "bullet") {
    return (
      <ul className={`list-disc list-inside space-y-1 ${textClass}`}>
        {content
          .split("\n")
          .filter((l) => l.trim())
          .map((line, i) => (
            <li key={i}>{wrapLink(line)}</li>
          ))}
      </ul>
    );
  }

  if (fmt?.listType === "numbered") {
    return (
      <ol className={`list-decimal list-inside space-y-1 ${textClass}`}>
        {content
          .split("\n")
          .filter((l) => l.trim())
          .map((line, i) => (
            <li key={i}>{wrapLink(line)}</li>
          ))}
      </ol>
    );
  }

  return <div className={textClass}>{wrapLink(content)}</div>;
}

/* -------------------------------------------------------------------------- */
/* Main Component                                                              */
/* -------------------------------------------------------------------------- */

export default function RegistrationFormRenderer({
  elements,
  sessions,
  mode = "preview",
}: Props) {
  const [responses, setResponses] = useState<
    Record<string, string | string[] | AddressValue | WaiverAcknowledgmentValue>
  >({});

  /* -------------------------------------------------------------------------- */
  /* Session Filtering                                                          */
  /* -------------------------------------------------------------------------- */

  const applicableElements = useMemo(() => {
    return elements.filter((el) => {
      if (!el.sessionIds || el.sessionIds.length === 0) {
        return true; // applies to all
      }

      const activeSessionIds = sessions.map((s) => s.sessionId);
      return el.sessionIds.some((id) => activeSessionIds.includes(id));
    });
  }, [elements, sessions]);

  /* -------------------------------------------------------------------------- */
  /* Response Handling                                                          */
  /* -------------------------------------------------------------------------- */

  function updateResponse(
    id: string,
    value: string | string[] | AddressValue | WaiverAcknowledgmentValue,
  ) {
    setResponses((prev) => ({
      ...prev,
      [id]: value,
    }));
  }

  function isFieldInvalid(el: RegistrationFormElement) {
    if (!el.required) return false;
    const value = responses[el.id];
    if (el.type === "waiver") return !isAcknowledged(value);
    if (el.inputType === "address") return !isAddressComplete(value);
    if (value === undefined || value === null) return true;
    if (typeof value === "string" && value.trim() === "") return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
  }

  /* -------------------------------------------------------------------------- */
  /* Render                                                                     */
  /* -------------------------------------------------------------------------- */

  return (
    <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-8 space-y-6">
      {applicableElements.length === 0 && (
        <div className="text-sm text-neutral-400">
          No registration questions configured.
        </div>
      )}

      {applicableElements.map((el) => {
        if (el.type === "subheader") {
          return (
            <div key={el.id} className="pt-4">
              <h3 className="text-lg font-semibold text-neutral-900">
                {el.label}
              </h3>
              {el.subtitle && (
                <p className="text-sm text-neutral-500 mt-0.5">{el.subtitle}</p>
              )}
            </div>
          );
        }

        if (el.type === "text_block") {
          // Prefer TipTap HTML output; fall back to legacy textFormatting
          if (el.htmlContent) {
            return (
              <div
                key={el.id}
                className="prose prose-sm max-w-none text-neutral-700"
                dangerouslySetInnerHTML={{ __html: el.htmlContent }}
              />
            );
          }
          return (
            <div key={el.id}>
              <TextBlockContent el={el} />
            </div>
          );
        }

        if (el.type === "waiver") {
          return (
            <div key={el.id} className="space-y-2">
              <label className="block text-sm font-medium text-neutral-800">
                {el.label}
                {el.required && <span className="text-red-500 ml-1">*</span>}
              </label>

              <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm leading-relaxed text-neutral-600">
                {el.waiverBody}
              </div>

              {el.waiverFileUrl && (
                <a
                  href={el.waiverFileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-sm font-medium text-primary-600 hover:underline"
                >
                  View / download waiver (PDF) ↗
                </a>
              )}

              <label className="flex items-start gap-2 text-sm text-neutral-800">
                <input
                  type="checkbox"
                  disabled={mode === "preview"}
                  checked={isAcknowledged(responses[el.id])}
                  onChange={(e) =>
                    updateResponse(
                      el.id,
                      makeAcknowledgment(e.target.checked, new Date().toISOString()),
                    )
                  }
                  className="mt-0.5"
                />
                {el.acknowledgmentLabel ?? DEFAULT_ACKNOWLEDGMENT_LABEL}
              </label>

              {isFieldInvalid(el) && mode === "live" && (
                <div className="text-xs text-red-500">
                  You must acknowledge this waiver to continue.
                </div>
              )}
            </div>
          );
        }

        // Question
        return (
          <div key={el.id} className="space-y-2">
            <label className="block text-sm font-medium text-neutral-800">
              {el.label}
              {el.required && <span className="text-red-500 ml-1">*</span>}
            </label>

            {el.inputType === "short_answer" && (
              <input
                type="text"
                disabled={mode === "preview"}
                value={(responses[el.id] as string) ?? ""}
                onChange={(e) => updateResponse(el.id, e.target.value)}
                className={`w-full border rounded-xl px-4 py-2 text-sm ${
                  isFieldInvalid(el) ? "border-red-400" : "border-neutral-300"
                }`}
              />
            )}

            {el.inputType === "long_answer" && (
              <textarea
                disabled={mode === "preview"}
                value={(responses[el.id] as string) ?? ""}
                onChange={(e) => updateResponse(el.id, e.target.value)}
                className={`w-full border rounded-xl px-4 py-2 text-sm ${
                  isFieldInvalid(el) ? "border-red-400" : "border-neutral-300"
                }`}
                rows={4}
              />
            )}

            {el.inputType === "date" && (
              <input
                type="date"
                disabled={mode === "preview"}
                value={(responses[el.id] as string) ?? ""}
                onChange={(e) => updateResponse(el.id, e.target.value)}
                className={`w-full border rounded-xl px-4 py-2 text-sm ${
                  isFieldInvalid(el) ? "border-red-400" : "border-neutral-300"
                }`}
              />
            )}

            {(el.inputType === "select" || el.inputType === "checkbox") &&
              el.options?.map((opt) => {
                const checked =
                  el.inputType === "checkbox"
                    ? (responses[el.id] as string[] | undefined)?.includes(opt)
                    : responses[el.id] === opt;

                return (
                  <label key={opt} className="flex items-center gap-2 text-sm">
                    <input
                      type={el.inputType === "checkbox" ? "checkbox" : "radio"}
                      disabled={mode === "preview"}
                      checked={checked ?? false}
                      onChange={() => {
                        if (el.inputType === "checkbox") {
                          const prev = (responses[el.id] as string[]) ?? [];
                          const next = checked
                            ? prev.filter((v: string) => v !== opt)
                            : [...prev, opt];
                          updateResponse(el.id, next);
                        } else {
                          updateResponse(el.id, opt);
                        }
                      }}
                    />
                    {opt}
                  </label>
                );
              })}

            {el.inputType === "phone_number" && (
              <input
                type="tel"
                disabled={mode === "preview"}
                value={(responses[el.id] as string) ?? ""}
                onChange={(e) => updateResponse(el.id, e.target.value)}
                placeholder="(555) 123-4567"
                className={`w-full border rounded-xl px-4 py-2 text-sm ${
                  isFieldInvalid(el) ? "border-red-400" : "border-neutral-300"
                }`}
              />
            )}

            {el.inputType === "address" && (
              <AddressBlockField
                value={responses[el.id]}
                onChange={(v) => updateResponse(el.id, v)}
                disabled={mode === "preview"}
                inputClassName={`w-full border rounded-xl px-4 py-2 text-sm ${
                  isFieldInvalid(el) ? "border-red-400" : "border-neutral-300"
                }`}
              />
            )}

            {isFieldInvalid(el) && mode === "live" && (
              <div className="text-xs text-red-500">
                This field is required.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
