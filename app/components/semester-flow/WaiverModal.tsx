"use client";

import { useRef, useState } from "react";
import { RegistrationFormElement } from "@/types";
import { v4 as uuid } from "uuid";
import { FileText, UploadCloud, X } from "lucide-react";
import {
  DEFAULT_WAIVER_TITLE,
  DEFAULT_WAIVER_BODY,
  DEFAULT_ACKNOWLEDGMENT_LABEL,
} from "@/lib/waiver";

type Props = {
  initialElement: RegistrationFormElement | null;
  onSave: (element: RegistrationFormElement) => void;
  onClose: () => void;
};

export default function WaiverModal({
  initialElement,
  onSave,
  onClose,
}: Props) {
  const isEditMode = !!initialElement;

  const [title, setTitle] = useState(initialElement?.label ?? DEFAULT_WAIVER_TITLE);
  const [body, setBody] = useState(initialElement?.waiverBody ?? DEFAULT_WAIVER_BODY);
  const [ackLabel, setAckLabel] = useState(
    initialElement?.acknowledgmentLabel ?? DEFAULT_ACKNOWLEDGMENT_LABEL,
  );
  const [required, setRequired] = useState(initialElement?.required ?? true);

  const [fileUrl, setFileUrl] = useState(initialElement?.waiverFileUrl ?? "");
  const [fileName, setFileName] = useState(initialElement?.waiverFileName ?? "");

  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ------------------------------------------------------------------------ */
  /* Upload (reuses the existing /api/upload-pdf route + email-assets bucket)   */
  /* ------------------------------------------------------------------------ */

  async function uploadFile(selected: File) {
    if (selected.type !== "application/pdf") {
      setError("Only PDF files are supported.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", selected);
      const res = await fetch("/api/upload-pdf", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed.");
        return;
      }
      setFileUrl(data.url);
      setFileName(data.filename ?? selected.name);
    } catch {
      setError("An unexpected error occurred during upload.");
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) uploadFile(selected);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const selected = e.dataTransfer.files?.[0];
    if (selected) uploadFile(selected);
  }

  function removeFile() {
    setFileUrl("");
    setFileName("");
  }

  /* ------------------------------------------------------------------------ */
  /* Save                                                                      */
  /* ------------------------------------------------------------------------ */

  function isValid(): boolean {
    return !!title.trim() && !!ackLabel.trim();
  }

  function handleSave() {
    if (!isValid()) return;
    const element: RegistrationFormElement = {
      id: initialElement?.id ?? uuid(),
      type: "waiver",
      label: title.trim(),
      waiverBody: body.trim() || DEFAULT_WAIVER_BODY,
      acknowledgmentLabel: ackLabel.trim(),
      waiverFileUrl: fileUrl || undefined,
      waiverFileName: fileName || undefined,
      required,
    };
    onSave(element);
  }

  /* ------------------------------------------------------------------------ */
  /* Render                                                                    */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-neutral-200 p-6 sm:p-8 space-y-6 mx-4 sm:mx-0 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div>
          <h2 className="text-xl font-semibold text-neutral-900">
            {isEditMode ? "Edit Waiver" : "Add Waiver"}
          </h2>
          <p className="text-sm text-neutral-500 mt-1">
            Families view the document and must check the acknowledgment box to
            continue. Upload the official PDF, or edit the placeholder text below.
          </p>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700">
            Waiver title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-neutral-300 rounded-xl px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 focus:outline-none"
          />
        </div>

        {/* File upload (drag & drop) */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700">
            Waiver document (PDF)
          </label>

          {fileUrl ? (
            <div className="flex items-center gap-3 border border-neutral-300 rounded-xl px-4 py-3">
              <FileText size={18} className="text-primary-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary-600 hover:underline truncate block"
                >
                  {fileName || "View uploaded waiver"}
                </a>
                <span className="text-xs text-neutral-400">Uploaded PDF</span>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-sm text-primary-600 hover:underline shrink-0"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={removeFile}
                className="p-1 text-neutral-400 hover:text-red-500 shrink-0"
                aria-label="Remove file"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl px-4 py-8 cursor-pointer transition ${
                dragOver
                  ? "border-primary-600 bg-primary-50"
                  : "border-neutral-300 hover:bg-neutral-50"
              }`}
            >
              <UploadCloud size={22} className="text-neutral-400" />
              <span className="text-sm text-neutral-600">
                {uploading
                  ? "Uploading…"
                  : "Drag & drop a PDF here, or click to choose"}
              </span>
              <span className="text-xs text-neutral-400">PDF up to 10 MB</span>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileChange}
            className="hidden"
          />

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <p className="text-xs text-neutral-400">
            No PDF yet? The text below is shown to families as a fallback and can
            be replaced once the official waiver is ready.
          </p>
        </div>

        {/* Body text */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700">
            Waiver text
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            className="w-full border border-neutral-300 rounded-xl px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 focus:outline-none"
          />
        </div>

        {/* Acknowledgment label */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700">
            Acknowledgment checkbox label *
          </label>
          <input
            type="text"
            value={ackLabel}
            onChange={(e) => setAckLabel(e.target.value)}
            className="w-full border border-neutral-300 rounded-xl px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 focus:outline-none"
          />
        </div>

        {/* Required toggle */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            className="h-4 w-4 text-primary-600 border-neutral-300 rounded"
          />
          <label className="text-sm text-neutral-700">
            Required — families must acknowledge to continue
          </label>
        </div>

        {/* Footer */}
        <div className="flex justify-between pt-4 border-t border-neutral-200">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl border border-neutral-300 text-neutral-700 hover:bg-neutral-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid() || uploading}
            className={`px-5 py-2 rounded-xl text-white transition ${
              isValid() && !uploading
                ? "bg-primary-600 hover:bg-primary-700"
                : "bg-neutral-300 cursor-not-allowed"
            }`}
          >
            {isEditMode ? "Update Waiver" : "Add Waiver"}
          </button>
        </div>
      </div>
    </div>
  );
}
