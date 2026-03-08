"use client";

import { useState, useTransition } from "react";
import { SignatureConfig } from "@/types";
import { updateAdminProfile } from "./actions/updateAdminProfile";

type Props = {
  initialConfig: SignatureConfig;
  currentSignatureHtml: string | null;
};

function buildPreviewHtml(config: SignatureConfig): string {
  const { name, title, phone, website } = config;
  if (!name && !title && !phone && !website) return "";

  const namePart = name
    ? `<div style="font-weight:bold;font-size:14px;color:#111827;">${name}</div>`
    : "";
  const titlePart = title
    ? `<div style="font-size:13px;color:#6b7280;margin-top:2px;">${title}</div>`
    : "";

  const metaParts = [phone, website].filter(Boolean).join(" &nbsp;·&nbsp; ");
  const metaPart = metaParts
    ? `<div style="font-size:12px;color:#9ca3af;margin-top:4px;">${metaParts}</div>`
    : "";

  return `<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,sans-serif;line-height:1.5;">
  <tr>
    <td style="padding-top:12px;border-top:1px solid #e5e7eb;">
      ${namePart}${titlePart}${metaPart}
    </td>
  </tr>
</table>`;
}

export default function ProfileClient({ initialConfig, currentSignatureHtml }: Props) {
  const [config, setConfig] = useState<SignatureConfig>(initialConfig);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function update(field: keyof SignatureConfig, value: string) {
    setSaved(false);
    setConfig((prev) => ({ ...prev, [field]: value }));
  }

  function handleSave() {
    startTransition(async () => {
      await updateAdminProfile(config);
      setSaved(true);
    });
  }

  const previewHtml = buildPreviewHtml(config);
  const hasContent = Object.values(config).some((v) => v.trim() !== "");

  return (
    <div className="space-y-6">
      {/* Signature section */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Email Signature</h2>
          <p className="text-sm text-gray-500 mt-1">
            Appended to emails when &ldquo;Include admin signature&rdquo; is enabled.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 max-w-lg">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Display name</label>
            <input
              type="text"
              value={config.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Sarah Johnson"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-slate-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Title</label>
            <input
              type="text"
              value={config.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="Studio Director"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-slate-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Phone</label>
            <input
              type="tel"
              value={config.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="(555) 123-4567"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-slate-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Website</label>
            <input
              type="text"
              value={config.website}
              onChange={(e) => update("website", e.target.value)}
              placeholder="aydt.com"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-slate-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Live preview */}
        {hasContent && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Preview</p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4">
              <p className="text-xs text-gray-400 mb-3">
                Hi [Parent Name], ...your email body here...
              </p>
              <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? "Saving…" : "Save signature"}
          </button>
          {saved && (
            <span className="text-sm text-green-600 font-medium">Saved</span>
          )}
        </div>
      </div>
    </div>
  );
}
