"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { type MediaFolderRow, type MediaImage } from "@/types";

export default function MediaLibraryPage() {
  const [images, setImages] = useState<MediaImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState("");
  const [uploading, setUploading] = useState(false);

  // Folder management
  const [folders, setFolders] = useState<MediaFolderRow[]>([]);
  const [newFolderLabel, setNewFolderLabel] = useState("");
  const [addingFolder, setAddingFolder] = useState(false);
  const [savingFolder, setSavingFolder] = useState(false);
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Delete confirmation state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Move to folder state
  const [movingImage, setMovingImage] = useState<MediaImage | null>(null);
  const [selectedMoveFolder, setSelectedMoveFolder] = useState<string>("");

  // Per-image dropdown open state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Upload warning toast
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch("/api/media/folders");
      const json = await res.json();
      setFolders((json.folders as MediaFolderRow[]) ?? []);
    } catch {
      setFolders([]);
    }
  }, []);

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
    void fetchFolders();
    fetchImages("", "");
  }, [fetchFolders, fetchImages]);

  // Auto-dismiss warnings after 6s
  useEffect(() => {
    if (!uploadWarnings.length) return;
    const t = setTimeout(() => setUploadWarnings([]), 6000);
    return () => clearTimeout(t);
  }, [uploadWarnings]);

  // Focus new folder input when it appears
  useEffect(() => {
    if (addingFolder) newFolderInputRef.current?.focus();
  }, [addingFolder]);

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
      if ((json.warnings as string[] | undefined)?.length) {
        setUploadWarnings(json.warnings as string[]);
      }
      await fetchImages(search, folder);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleRenameSubmit = async (id: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
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

  const handleMove = async (id: string, targetFolder: string) => {
    try {
      const res = await fetch(`/api/media/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: targetFolder }),
      });
      if (!res.ok) throw new Error("Move failed");
      await fetchImages(search, folder);
    } catch {
      alert("Move failed. Please try again.");
    } finally {
      setMovingImage(null);
    }
  };

  const handleAddFolder = async () => {
    const label = newFolderLabel.trim();
    if (!label) return;
    setSavingFolder(true);
    try {
      const res = await fetch("/api/media/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error((json.error as string) ?? "Failed to create folder");
      await fetchFolders();
      setNewFolderLabel("");
      setAddingFolder(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create folder");
    } finally {
      setSavingFolder(false);
    }
  };

  const handleDeleteFolder = async (name: string) => {
    setDeletingFolder(null);
    try {
      const res = await fetch(`/api/media/folders/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error((json.error as string) ?? "Failed to delete folder");
      // If we're viewing the deleted folder, go back to All Media
      if (folder === name) handleFolderChange("");
      await fetchFolders();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete folder");
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url).catch(() => {});
    setOpenMenuId(null);
  };

  return (
    <div className="flex gap-6 px-6 py-8 max-w-6xl mx-auto">

      {/* Left sidebar — folder navigation */}
      <aside className="w-48 shrink-0">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 mb-2">
          Folders
        </p>
        <nav className="space-y-0.5">
          {/* All Media — pseudo-folder, never deletable */}
          <button
            type="button"
            onClick={() => handleFolderChange("")}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition ${
              folder === ""
                ? "bg-indigo-50 text-indigo-700"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            All Media
          </button>

          {/* Dynamic folders */}
          {folders.map((f) => (
            <div key={f.name} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleFolderChange(f.name)}
                className={`flex-1 text-left px-3 py-2 rounded-lg text-sm transition ${
                  folder === f.name
                    ? "bg-indigo-50 text-indigo-700 font-medium"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {f.label}
              </button>
              <button
                type="button"
                onClick={() => setDeletingFolder(f.name)}
                className="opacity-0 group-hover:opacity-100 shrink-0 text-gray-300 hover:text-red-500 text-sm leading-none px-1 transition-opacity"
                title={`Delete ${f.label}`}
              >
                ×
              </button>
            </div>
          ))}
        </nav>

        {/* Add folder */}
        <div className="mt-3 px-1">
          {addingFolder ? (
            <div className="space-y-1.5">
              <input
                ref={newFolderInputRef}
                type="text"
                placeholder="Folder name"
                value={newFolderLabel}
                onChange={(e) => setNewFolderLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAddFolder();
                  if (e.key === "Escape") {
                    setAddingFolder(false);
                    setNewFolderLabel("");
                  }
                }}
                className="w-full text-xs text-slate-700 placeholder:text-slate-400 border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={savingFolder}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void handleAddFolder()}
                  className="text-xs text-indigo-600 font-medium hover:underline disabled:opacity-50"
                >
                  {savingFolder ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddingFolder(false);
                    setNewFolderLabel("");
                  }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingFolder(true)}
              className="text-xs text-gray-400 hover:text-indigo-600 transition flex items-center gap-1"
            >
              <span className="text-base leading-none">+</span> New folder
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Page header */}
        <div className="flex items-center justify-between mb-4">
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

        {/* Search bar */}
        <div className="mb-5">
          <input
            type="text"
            placeholder="Search images…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full text-sm text-slate-700 placeholder:text-slate-400 border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
          />
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
            {images.map((img) => {
              const folderLabel =
                folders.find((f) => f.name === img.folder)?.label ?? img.folder;
              return (
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
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          className="flex-1 text-xs text-slate-700 placeholder:text-slate-400 border border-gray-300 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <button
                          type="submit"
                          onMouseDown={(e) => e.preventDefault()}
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
                                className="w-full text-left px-3 py-1.5 text-slate-700 hover:bg-gray-50"
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setMovingImage(img);
                                  setSelectedMoveFolder(img.folder);
                                  setOpenMenuId(null);
                                }}
                                className="w-full text-left px-3 py-1.5 text-slate-700 hover:bg-gray-50"
                              >
                                Move to…
                              </button>
                              <button
                                type="button"
                                onClick={() => copyUrl(img.public_url)}
                                className="w-full text-left px-3 py-1.5 text-slate-700 hover:bg-gray-50"
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
                      {folderLabel}
                      {img.width && img.height ? ` · ${img.width}×${img.height}` : ""}
                      {` · ${Math.round(img.size_bytes / 1024)} KB`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete image confirmation dialog */}
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

      {/* Delete folder confirmation dialog */}
      {deletingFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              Delete folder?
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              <span className="font-medium text-gray-700">
                {folders.find((f) => f.name === deletingFolder)?.label ?? deletingFolder}
              </span>{" "}
              will be removed. This only works if the folder is empty.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingFolder(null)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteFolder(deletingFolder)}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move to folder dialog */}
      {movingImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              Move to folder
            </h3>
            <p className="text-sm text-gray-500 mb-4 truncate">
              {movingImage.display_name}
            </p>
            <div className="space-y-2 mb-6">
              {folders.map((f) => (
                <label key={f.name} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="move-folder"
                    value={f.name}
                    checked={selectedMoveFolder === f.name}
                    onChange={() => setSelectedMoveFolder(f.name)}
                    className="accent-indigo-600"
                  />
                  <span className="text-sm text-gray-700">{f.label}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setMovingImage(null)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleMove(movingImage.id, selectedMoveFolder)}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition"
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload warning toast */}
      {uploadWarnings.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in bg-amber-50 border border-amber-200 rounded-xl shadow-lg p-4 max-w-sm">
          <div className="flex items-start gap-3">
            <span className="text-amber-500 text-base mt-0.5">⚠</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800 mb-1">
                Upload succeeded with warnings
              </p>
              <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
                {uploadWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={() => setUploadWarnings([])}
              className="text-amber-400 hover:text-amber-600 text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
