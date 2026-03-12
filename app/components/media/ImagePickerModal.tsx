"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { type MediaFolderRow, type MediaImage, type ImageLayout } from "@/types";

type Props = {
  isOpen: boolean;
  defaultLayout?: ImageLayout;
  onClose: () => void;
  onInsert: (image: MediaImage, layout: ImageLayout) => void;
};

export default function ImagePickerModal({
  isOpen,
  defaultLayout = "inline",
  onClose,
  onInsert,
}: Props) {
  const [images, setImages] = useState<MediaImage[]>([]);
  const [folders, setFolders] = useState<MediaFolderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState("");
  const [selected, setSelected] = useState<MediaImage | null>(null);
  const [layout, setLayout] = useState<ImageLayout>(defaultLayout);
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchImages = useCallback(async (q: string, f: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("search", q);
    if (f) params.set("folder", f);
    try {
      const res = await fetch(`/api/media?${params}`);
      const json = await res.json();
      setImages((json.images as MediaImage[]) ?? []);
    } catch {
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reset state and fetch folders each time the modal opens
  useEffect(() => {
    if (!isOpen) return;
    setSelected(null);
    setSearch("");
    setFolder("");
    setLayout(defaultLayout);
    fetchImages("", "");
    fetch("/api/media/folders")
      .then((r) => r.json())
      .then((json) => setFolders((json.folders as MediaFolderRow[]) ?? []))
      .catch(() => setFolders([]));
  }, [isOpen, defaultLayout, fetchImages]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchImages(value, folder), 300);
  };

  const handleFolderChange = (value: string) => {
    setFolder(value);
    fetchImages(search, value);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folder", folder || "general");
      form.append("display_name", file.name.replace(/\.[^/.]+$/, ""));

      const res = await fetch("/api/upload-image", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error((json.error as string) ?? "Upload failed");

      // Refresh list then auto-select the newly uploaded image
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (folder) params.set("folder", folder);
      const refreshRes = await fetch(`/api/media?${params}`);
      const refreshJson = await refreshRes.json();
      const refreshed = (refreshJson.images as MediaImage[]) ?? [];
      setImages(refreshed);
      const newImage = refreshed.find((img) => img.id === (json.id as string));
      if (newImage) setSelected(newImage);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">Insert Image</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 px-6 py-3 border-b border-gray-100 bg-gray-50">
          <input
            type="text"
            placeholder="Search images…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="flex-1 text-sm text-slate-700 placeholder:text-slate-400 border border-gray-300 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <select
            value={folder}
            onChange={(e) => handleFolderChange(e.target.value)}
            className="text-sm text-slate-700 border border-gray-300 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All folders</option>
            {folders.map((f) => (
              <option key={f.name} value={f.name}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {/* Image grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-16">Loading…</p>
          ) : images.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm text-gray-400">No images found.</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 text-sm text-indigo-600 font-medium hover:underline"
              >
                Upload the first one
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {images.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setSelected(img)}
                  className={`relative rounded-xl overflow-hidden border-2 transition aspect-square group focus:outline-none ${
                    selected?.id === img.id
                      ? "border-indigo-500 ring-2 ring-indigo-200"
                      : "border-gray-200 hover:border-indigo-300"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${img.public_url}?width=200&quality=70`}
                    alt={img.display_name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition">
                    <p className="text-white text-xs truncate">{img.display_name}</p>
                  </div>
                  {selected?.id === img.id && (
                    <div className="absolute top-1.5 right-1.5 bg-indigo-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                      ✓
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-t border-gray-200 bg-gray-50">
          {/* Upload + layout toggle */}
          <div className="flex items-center gap-3 text-sm">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={handleUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-indigo-600 font-medium hover:underline disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "+ Upload new"}
            </button>

            <span className="text-gray-300 select-none">|</span>

            <span className="text-gray-500">Layout:</span>
            <button
              type="button"
              onClick={() => setLayout("inline")}
              className={`px-2 py-0.5 rounded text-xs font-medium transition ${
                layout === "inline"
                  ? "bg-indigo-100 text-indigo-700"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              Inline
            </button>
            <button
              type="button"
              onClick={() => setLayout("banner")}
              className={`px-2 py-0.5 rounded text-xs font-medium transition ${
                layout === "banner"
                  ? "bg-indigo-100 text-indigo-700"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              Banner
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {selected && (
              <p className="text-xs text-gray-400 max-w-[140px] truncate">
                {selected.display_name}
              </p>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selected}
              onClick={() => {
                if (selected) onInsert(selected, layout);
              }}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Insert
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
