"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { type MediaFolderRow, type MediaImage } from "@/types";
import { Search, LayoutGrid, List, Upload, Folder } from "lucide-react";

export default function MediaLibraryPage() {
  const [allImages, setAllImages] = useState<MediaImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState("");
  const [uploading, setUploading] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isDragOver, setIsDragOver] = useState(false);

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

  // Client-side filtered view
  const images = useMemo(() => {
    let filtered = allImages;
    if (folder) filtered = filtered.filter((img) => img.folder === folder);
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((img) =>
        img.display_name.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [allImages, folder, search]);

  // Counts per folder derived from full image list
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allImages.forEach((img) => {
      counts[img.folder] = (counts[img.folder] || 0) + 1;
    });
    return counts;
  }, [allImages]);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch("/api/media/folders");
      const json = await res.json();
      setFolders((json.folders as MediaFolderRow[]) ?? []);
    } catch {
      setFolders([]);
    }
  }, []);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/media");
      const json = await res.json();
      setAllImages((json.images as MediaImage[]) ?? []);
    } catch {
      setAllImages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFolders();
    void fetchImages();
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

  // Listen for upload trigger from TopBar
  useEffect(() => {
    const handler = () => fileInputRef.current?.click();
    document.addEventListener("media:open-upload", handler);
    return () => document.removeEventListener("media:open-upload", handler);
  }, []);

  const uploadFile = async (file: File) => {
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
      await fetchImages();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await uploadFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type)) {
      alert("Please upload a PNG, JPG, GIF, or WebP image.");
      return;
    }
    await uploadFile(file);
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
      setAllImages((prev) =>
        prev.map((img) => (img.id === id ? { ...img, display_name: trimmed } : img))
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
      setAllImages((prev) => prev.filter((img) => img.id !== id));
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
      setAllImages((prev) =>
        prev.map((img) => (img.id === id ? { ...img, folder: targetFolder } : img))
      );
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
      if (folder === name) setFolder("");
      await fetchFolders();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete folder");
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url).catch(() => {});
    setOpenMenuId(null);
  };

  const activeFolderLabel = folder
    ? (folders.find((f) => f.name === folder)?.label ?? folder)
    : "All Media";

  const imageMenuItems = (img: MediaImage) => (
    <>
      <button
        type="button"
        onClick={() => {
          setRenamingId(img.id);
          setRenameValue(img.display_name);
          setOpenMenuId(null);
        }}
        className="w-full text-left px-3 py-1.5 text-slate-700 hover:bg-neutral-50"
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
        className="w-full text-left px-3 py-1.5 text-slate-700 hover:bg-neutral-50"
      >
        Move to…
      </button>
      <button
        type="button"
        onClick={() => copyUrl(img.public_url)}
        className="w-full text-left px-3 py-1.5 text-slate-700 hover:bg-neutral-50"
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
    </>
  );

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-6">

      {/* Mobile: folder select dropdown */}
      <div className="md:hidden">
        <select
          className="admin-select text-[12.5px] w-full"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
        >
          <option value="">All Media ({allImages.length})</option>
          {folders.map((f) => (
            <option key={f.name} value={f.name}>
              {f.label || f.name} ({folderCounts[f.name] ?? 0})
            </option>
          ))}
        </select>
      </div>

      {/* Left sidebar — desktop only */}
      <aside className="hidden md:block w-48 shrink-0 bg-white rounded-2xl border border-neutral-100 p-4 self-start">
        <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest px-3 mb-2">
          Folders
        </p>
        <nav className="space-y-0.5">
          {/* All Media */}
          <button
            type="button"
            onClick={() => setFolder("")}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition flex items-center justify-between gap-1 ${
              folder === ""
                ? "bg-primary-50 text-primary-700"
                : "text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            <span className="flex items-center gap-2 truncate">
              <Folder size={14} className="shrink-0" />
              All Media
            </span>
            <span
              className={`text-xs tabular-nums rounded-full px-1.5 py-0.5 shrink-0 ${
                folder === ""
                  ? "bg-primary-100 text-primary-700"
                  : "bg-neutral-100 text-neutral-500"
              }`}
            >
              {allImages.length}
            </span>
          </button>

          {/* Dynamic folders */}
          {folders.map((f) => {
            const count = folderCounts[f.name] ?? 0;
            return (
              <div key={f.name} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setFolder(f.name)}
                  className={`flex-1 min-w-0 text-left px-3 py-2 rounded-lg text-sm transition flex items-center justify-between gap-1 ${
                    folder === f.name
                      ? "bg-primary-50 text-primary-700 font-medium"
                      : "text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0 truncate">
                    <Folder size={14} className="shrink-0" />
                    <span className="truncate">{f.label}</span>
                  </span>
                  <span
                    className={`text-xs tabular-nums rounded-full px-1.5 py-0.5 shrink-0 ${
                      folder === f.name
                        ? "bg-primary-100 text-primary-700"
                        : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {count}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingFolder(f.name)}
                  className="opacity-0 group-hover:opacity-100 shrink-0 text-neutral-300 hover:text-red-500 text-sm leading-none px-1 transition-opacity"
                  title={`Delete ${f.label}`}
                >
                  ×
                </button>
              </div>
            );
          })}
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
                className="w-full text-xs text-slate-700 placeholder:text-slate-400 border border-neutral-300 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-primary-600"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={savingFolder}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void handleAddFolder()}
                  className="text-xs text-primary-600 font-medium hover:underline disabled:opacity-50"
                >
                  {savingFolder ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddingFolder(false);
                    setNewFolderLabel("");
                  }}
                  className="text-xs text-neutral-400 hover:text-neutral-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingFolder(true)}
              className="text-xs text-neutral-400 hover:text-primary-600 transition flex items-center gap-1"
            >
              <span className="text-base leading-none">+</span> New folder
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Search + view toggle */}
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search images…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-sm text-slate-700 placeholder:text-slate-400 border border-neutral-300 rounded-lg pl-9 pr-3 py-2 outline-none focus:ring-2 focus:ring-primary-600"
            />
          </div>
          <div className="flex items-center border border-neutral-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`px-2.5 py-2 transition ${
                viewMode === "grid"
                  ? "bg-neutral-100 text-neutral-700"
                  : "text-neutral-400 hover:text-neutral-600"
              }`}
              title="Grid view"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`px-2.5 py-2 transition ${
                viewMode === "list"
                  ? "bg-neutral-100 text-neutral-700"
                  : "text-neutral-400 hover:text-neutral-600"
              }`}
              title="List view"
            >
              <List size={15} />
            </button>
          </div>
        </div>

        {/* Folder heading + count */}
        <div className="flex items-baseline gap-2 mb-4">
          <h2 className="text-sm font-semibold text-neutral-700">{activeFolderLabel}</h2>
          <span className="text-xs text-neutral-400">
            {images.length} image{images.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Image grid or list */}
        {loading ? (
          <p className="text-sm text-neutral-400 text-center py-24">Loading…</p>
        ) : images.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-sm text-neutral-400">No images yet.</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 text-sm text-primary-600 font-medium hover:underline"
            >
              Upload the first one
            </button>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {images.map((img) => {
              const folderLabel =
                folders.find((f) => f.name === img.folder)?.label ?? img.folder;
              return (
                <div
                  key={img.id}
                  className="group relative rounded-xl border border-neutral-200 overflow-hidden bg-neutral-50 hover:shadow-md hover:border-neutral-300 transition-all duration-200"
                >
                  {/* Thumbnail with hover scale + overlay */}
                  <div className="relative overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${img.public_url}?width=300&quality=70`}
                      alt={img.display_name}
                      className="w-full aspect-square object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 pointer-events-none" />

                    {/* Menu button — top right of image */}
                    <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenMenuId(openMenuId === img.id ? null : img.id)
                          }
                          className="w-7 h-7 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-full shadow-sm text-neutral-600 hover:bg-white hover:text-neutral-900 transition-colors"
                          title="Options"
                        >
                          ⋯
                        </button>
                        {openMenuId === img.id && (
                          <div className="absolute right-0 top-8 z-10 bg-white border border-neutral-200 rounded-lg shadow-lg text-xs w-32 py-1">
                            {imageMenuItems(img)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

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
                          className="flex-1 text-xs text-slate-700 border border-neutral-300 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-primary-600"
                        />
                        <button
                          type="submit"
                          onMouseDown={(e) => e.preventDefault()}
                          className="text-xs text-primary-600 font-medium hover:underline"
                        >
                          Save
                        </button>
                      </form>
                    ) : (
                      <p
                        className="text-xs text-neutral-700 truncate"
                        title={img.display_name}
                      >
                        {img.display_name}
                      </p>
                    )}
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {folderLabel}
                      {img.width && img.height ? ` · ${img.width}×${img.height}` : ""}
                      {` · ${Math.round(img.size_bytes / 1024)} KB`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="border border-neutral-200 rounded-xl overflow-hidden">
            {images.map((img, idx) => {
              const folderLabel =
                folders.find((f) => f.name === img.folder)?.label ?? img.folder;
              return (
                <div
                  key={img.id}
                  className={`flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 transition ${
                    idx !== images.length - 1 ? "border-b border-neutral-100" : ""
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${img.public_url}?width=80&quality=70`}
                    alt={img.display_name}
                    className="w-10 h-10 object-cover rounded-lg border border-neutral-200 shrink-0"
                  />
                  {renamingId === img.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleRenameSubmit(img.id);
                      }}
                      className="flex gap-1 flex-1"
                    >
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="flex-1 text-xs text-slate-700 border border-neutral-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary-600"
                      />
                      <button
                        type="submit"
                        onMouseDown={(e) => e.preventDefault()}
                        className="text-xs text-primary-600 font-medium hover:underline"
                      >
                        Save
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm text-neutral-700 truncate"
                          title={img.display_name}
                        >
                          {img.display_name}
                        </p>
                        <p className="text-xs text-neutral-400">
                          {folderLabel}
                          {img.width && img.height ? ` · ${img.width}×${img.height}` : ""}
                          {` · ${Math.round(img.size_bytes / 1024)} KB`}
                        </p>
                      </div>
                      <div className="relative shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenMenuId(openMenuId === img.id ? null : img.id)
                          }
                          className="text-neutral-400 hover:text-neutral-600 text-sm px-1"
                          title="Options"
                        >
                          ⋯
                        </button>
                        {openMenuId === img.id && (
                          <div className="absolute right-0 top-6 z-10 bg-white border border-neutral-200 rounded-lg shadow-lg text-xs w-32 py-1">
                            {imageMenuItems(img)}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`mt-6 border-2 border-dashed rounded-xl p-10 text-center transition cursor-pointer ${
            isDragOver
              ? "border-primary-400 bg-primary-50"
              : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50/50"
          }`}
        >
          <Upload
            size={20}
            className={`mx-auto mb-3 ${
              isDragOver ? "text-primary-500" : "text-neutral-300"
            }`}
          />
          <p
            className={`text-sm font-medium ${
              isDragOver ? "text-primary-700" : "text-neutral-500"
            }`}
          >
            {uploading ? "Uploading…" : isDragOver ? "Drop to upload" : "Drop images here to upload"}
          </p>
          <p className="text-xs text-neutral-400 mt-1">
            PNG, JPG, GIF, WebP — max 10 MB each
          </p>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={handleUpload}
      />

      {/* Delete image confirmation dialog */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-base font-semibold text-neutral-900 mb-2">
              Delete image?
            </h3>
            <p className="text-sm text-neutral-500 mb-6">
              This will permanently remove the image from storage and the library. It
              cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingId(null)}
                className="text-sm text-neutral-500 hover:text-neutral-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(deletingId)}
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
            <h3 className="text-base font-semibold text-neutral-900 mb-2">
              Delete folder?
            </h3>
            <p className="text-sm text-neutral-500 mb-6">
              <span className="font-medium text-neutral-700">
                {folders.find((f) => f.name === deletingFolder)?.label ?? deletingFolder}
              </span>{" "}
              will be removed. This only works if the folder is empty.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingFolder(null)}
                className="text-sm text-neutral-500 hover:text-neutral-700"
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
            <h3 className="text-base font-semibold text-neutral-900 mb-1">
              Move to folder
            </h3>
            <p className="text-sm text-neutral-500 mb-4 truncate">
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
                    className="accent-primary-600"
                  />
                  <span className="text-sm text-neutral-700">{f.label}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setMovingImage(null)}
                className="text-sm text-neutral-500 hover:text-neutral-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleMove(movingImage.id, selectedMoveFolder)}
                className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition"
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload warning toast */}
      {uploadWarnings.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in bg-mauve/10 border border-mauve rounded-xl shadow-lg p-4 max-w-sm">
          <div className="flex items-start gap-3">
            <span className="text-mauve-text text-base mt-0.5">⚠</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-mauve-text mb-1">
                Upload succeeded with warnings
              </p>
              <ul className="text-xs text-mauve-text space-y-0.5 list-disc list-inside">
                {uploadWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={() => setUploadWarnings([])}
              className="text-mauve hover:text-mauve-text text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
