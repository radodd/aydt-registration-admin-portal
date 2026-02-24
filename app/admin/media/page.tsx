"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MEDIA_FOLDERS, type MediaImage } from "@/types";

export default function MediaLibraryPage() {
  const [images, setImages] = useState<MediaImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState("");
  const [uploading, setUploading] = useState(false);

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Delete confirmation state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Per-image dropdown open state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

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

  useEffect(() => {
    fetchImages("", "");
  }, [fetchImages]);

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
      await fetchImages(search, folder);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleRenameSubmit = async (id: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    try {
      const res = await fetch(`/api/media/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: trimmed }),
      });
      if (!res.ok) throw new Error("Rename failed");
      setImages((prev) =>
        prev.map((img) =>
          img.id === id ? { ...img, display_name: trimmed } : img
        )
      );
    } catch {
      alert("Rename failed. Please try again.");
    } finally {
      setRenamingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/media/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setImages((prev) => prev.filter((img) => img.id !== id));
    } catch {
      alert("Delete failed. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url).catch(() => {});
    setOpenMenuId(null);
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Media Library</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Shared image library for all email templates
          </p>
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
        >
          {uploading ? "Uploading…" : "Upload Image"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={handleUpload}
        />
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          placeholder="Search images…"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <select
          value={folder}
          onChange={(e) => handleFolderChange(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All folders</option>
          {MEDIA_FOLDERS.map((f) => (
            <option key={f} value={f}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Grid */}
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-24">Loading…</p>
      ) : images.length === 0 ? (
        <div className="text-center py-24">
          <p className="text-sm text-gray-400">No images yet.</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-3 text-sm text-indigo-600 font-medium hover:underline"
          >
            Upload the first one
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {images.map((img) => (
            <div
              key={img.id}
              className="group relative rounded-xl border border-gray-200 overflow-hidden bg-gray-50"
            >
              {/* Thumbnail */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${img.public_url}?width=300&quality=70`}
                alt={img.display_name}
                className="w-full aspect-square object-cover"
              />

              {/* Metadata footer */}
              <div className="px-2 py-1.5">
                {renamingId === img.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleRenameSubmit(img.id);
                    }}
                    className="flex gap-1"
                  >
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => setRenamingId(null)}
                      className="flex-1 text-xs border border-gray-300 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="submit"
                      className="text-xs text-indigo-600 font-medium hover:underline"
                    >
                      Save
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center justify-between gap-1">
                    <p
                      className="text-xs text-gray-700 truncate flex-1"
                      title={img.display_name}
                    >
                      {img.display_name}
                    </p>

                    {/* Actions menu */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenMenuId(
                            openMenuId === img.id ? null : img.id
                          )
                        }
                        className="text-gray-400 hover:text-gray-600 text-sm leading-none px-0.5"
                        title="Options"
                      >
                        ⋯
                      </button>

                      {openMenuId === img.id && (
                        <div className="absolute right-0 bottom-6 z-10 bg-white border border-gray-200 rounded-lg shadow-lg text-xs w-32 py-1">
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingId(img.id);
                              setRenameValue(img.display_name);
                              setOpenMenuId(null);
                            }}
                            className="w-full text-left px-3 py-1.5 hover:bg-gray-50"
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            onClick={() => copyUrl(img.public_url)}
                            className="w-full text-left px-3 py-1.5 hover:bg-gray-50"
                          >
                            Copy URL
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeletingId(img.id);
                              setOpenMenuId(null);
                            }}
                            className="w-full text-left px-3 py-1.5 text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <p className="text-xs text-gray-400 mt-0.5">
                  {img.folder} · {Math.round(img.size_bytes / 1024)} KB
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              Delete image?
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              This will permanently remove the image from storage and the
              library. It cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingId(null)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deletingId)}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
