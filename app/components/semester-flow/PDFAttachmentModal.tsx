"use client";

import { useState, useRef } from "react";
import { Paperclip } from "lucide-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (opts: { url: string; label: string }) => void;
};

export default function PDFAttachmentModal({ isOpen, onClose, onInsert }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setError(null);
    if (selected) {
      setLabel(selected.name.replace(/\.pdf$/i, ""));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/upload-pdf", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        return;
      }

      onInsert({ url: data.url, label: label.trim() || file.name });
      onClose();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <h3 className="text-base font-semibold text-gray-900">Insert PDF Link</h3>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              PDF File
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-3 border border-dashed border-gray-300 rounded-lg px-3 py-3 cursor-pointer hover:bg-gray-50 transition"
            >
              <Paperclip size={16} className="text-gray-400 shrink-0" />
              <span className="text-sm text-gray-500 truncate">
                {file ? file.name : "Choose a PDF file…"}
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Link label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Spring 2026 Schedule"
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-xl border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!file || uploading}
              className="flex-1 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {uploading ? "Uploading…" : "Insert"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
