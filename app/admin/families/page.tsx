"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { MoreHorizontal, Search } from "lucide-react";
import type { Family } from "@/types";
import { getFamilies } from "@/queries/admin";
import { createFamily, type CreateFamilyInput } from "./actions/createFamily";
import { FormField, ModalActions, inputCls } from "./_components/FormHelpers";

/* ── helpers ──────────────────────────────────────────────────────────── */

const AVATAR_COLORS = [
  { bg: "rgba(158,196,180,.25)", text: "#20503A" },
  { bg: "rgba(196,160,212,.20)", text: "#5A2878" },
  { bg: "rgba(212,160,192,.20)", text: "#702858" },
  { bg: "rgba(232,184,176,.20)", text: "#802818" },
  { bg: "rgba(125,206,194,.20)", text: "#0A5A50" },
];

function avatarColor(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[Math.abs(h)];
}

function initials(first: string, last: string) {
  return (first[0] ?? "") + (last[0] ?? "");
}

/* ── page ─────────────────────────────────────────────────────────────── */

export default function FamiliesAdmin() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getFamilies()
      .then((data) => setFamilies((data as Family[]) ?? []))
      .finally(() => setLoading(false));
  }, []);

  const handleCreateFamily = (input: CreateFamilyInput) => {
    startTransition(async () => {
      try {
        setCreateError(null);
        await createFamily(input);
        const data = await getFamilies();
        setFamilies((data as Family[]) ?? []);
        setShowCreate(false);
      } catch (e: unknown) {
        setCreateError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  };

  const filtered = families.filter((f) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const name = (f.family_name ?? "").toLowerCase();
    const parents = f.users
      .map((u) => `${u.first_name} ${u.last_name} ${u.email}`)
      .join(" ")
      .toLowerCase();
    const dancerNames = f.dancers
      .map((d) => `${d.first_name} ${d.last_name}`)
      .join(" ")
      .toLowerCase();
    return name.includes(q) || parents.includes(q) || dancerNames.includes(q);
  });

  return (
    <div className="space-y-5">
      {openMenuId && (
        <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
      )}

      {/* Page header */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Families</h1>
          <p className="admin-page-subtitle">Manage family accounts and their dancers.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/families/activation" className="admin-btn-neutral admin-btn-sm">
            Activate accounts
          </Link>
          <button
            onClick={() => setShowCreate(true)}
            className="admin-btn-primary admin-btn-sm"
          >
            + New Family
          </button>
        </div>
      </div>

      {/* Card */}
      <div className="admin-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div
              className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: "#8E2A23", borderTopColor: "transparent" }}
            />
          </div>
        ) : (
          <>
            {/* Search bar */}
            <div className="px-5 py-2.5 border-b" style={{ borderColor: "var(--admin-border-sub)" }}>
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-1.5"
                style={{ background: "var(--admin-surface-sub)", border: "1px solid var(--admin-border)" }}
              >
                <Search size={13} style={{ color: "var(--admin-text-faint)", flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Search by family, parent, or dancer…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-[12.5px]"
                  style={{ color: "var(--admin-text)" }}
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="text-[11px] leading-none"
                    style={{ color: "var(--admin-text-faint)" }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {filtered.length === 0 ? (
              <p className="px-5 py-10 text-sm text-center" style={{ color: "var(--admin-text-faint)" }}>
                {search ? `No families matching "${search}"` : "No families yet. Create one to get started."}
              </p>
            ) : (
              <>
                {/* Desktop table header */}
                <div
                  className="hidden md:flex items-center px-5 py-2"
                  style={{ background: "var(--admin-table-header-bg)" }}
                >
                  <span className="flex-1 text-[10.5px] font-medium uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>Family</span>
                  <span className="w-44 text-[10.5px] font-medium uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>Primary Parent</span>
                  <span className="w-20 text-right text-[10.5px] font-medium uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>Dancers</span>
                  <span className="w-24 pl-4 text-right text-[10.5px] font-medium uppercase tracking-wide" style={{ color: "var(--admin-table-header-text)" }}>Enrolled</span>
                  <span className="w-10" />
                </div>

                <ul>
                  {filtered.map((family, i) => {
                    const familyName = family.family_name ?? "Unknown family";
                    const primaryParent =
                      family.users.find((u) => u.is_primary_parent) ?? family.users[0];
                    const primaryParentName = primaryParent
                      ? `${primaryParent.first_name} ${primaryParent.last_name}`
                      : "—";
                    const color = avatarColor(
                      primaryParent ? `${primaryParent.first_name} ${primaryParent.last_name}` : familyName
                    );
                    const avatarInitials = primaryParent
                      ? initials(primaryParent.first_name, primaryParent.last_name)
                      : (familyName[0] ?? "F").toUpperCase();
                    const activeRegs = family.dancers.flatMap((d) =>
                      d.registrations.filter((r) => r.status !== "cancelled")
                    ).length;

                    return (
                      <li
                        key={family.id}
                        className="flex items-center px-4 md:px-5 py-3 border-b"
                        style={{
                          borderColor: "var(--admin-border-sub)",
                          background: i % 2 !== 0 ? "var(--admin-table-row-alt)" : "var(--admin-surface)",
                        }}
                      >
                        {/* Avatar + family name + mobile sub-text */}
                        <div className="flex-1 flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                            style={{ background: color.bg, color: color.text }}
                          >
                            {avatarInitials}
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={`/admin/families/${family.id}`}
                              className="text-[13px] font-medium truncate block hover:underline"
                              style={{ color: "var(--admin-text)" }}
                            >
                              {familyName}
                            </Link>
                            {/* Mobile: primary parent · counts */}
                            <p
                              className="md:hidden text-[11.5px] mt-0.5 truncate"
                              style={{ color: "var(--admin-text-faint)" }}
                            >
                              {primaryParentName}
                              {` · ${family.dancers.length} dancer${family.dancers.length !== 1 ? "s" : ""}`}
                              {activeRegs > 0 ? ` · ${activeRegs} enrolled` : ""}
                            </p>
                          </div>
                        </div>

                        {/* Desktop columns */}
                        <p className="hidden md:block w-44 text-[12px] truncate" style={{ color: "var(--admin-text-muted)" }}>
                          {primaryParentName}
                        </p>
                        <p className="hidden md:block w-20 text-right text-[12px]" style={{ color: "var(--admin-text-muted)" }}>
                          {family.dancers.length}
                        </p>
                        <p className="hidden md:block w-24 pl-4 text-right text-[12px]" style={{ color: "var(--admin-text-faint)" }}>
                          {activeRegs}
                        </p>

                        {/* ⋯ menu */}
                        <div className="relative shrink-0 ml-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(openMenuId === family.id ? null : family.id);
                            }}
                            className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
                            style={{
                              color: "var(--admin-text-faint)",
                              background: openMenuId === family.id ? "var(--admin-surface-sub)" : "transparent",
                            }}
                          >
                            <MoreHorizontal size={15} />
                          </button>

                          {openMenuId === family.id && (
                            <div
                              className="absolute right-0 top-full mt-1 rounded-lg shadow-lg z-20 overflow-hidden"
                              style={{
                                background: "var(--admin-surface)",
                                border: "1px solid var(--admin-border)",
                                minWidth: "148px",
                              }}
                            >
                              <Link
                                href={`/admin/families/${family.id}`}
                                onClick={() => setOpenMenuId(null)}
                                className="flex items-center px-3.5 py-2 text-[12px]"
                                style={{ color: "var(--admin-text)" }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                              >
                                View family
                              </Link>
                              <Link
                                href={`/admin/emails/new?familyId=${family.id}`}
                                onClick={() => setOpenMenuId(null)}
                                className="flex items-center px-3.5 py-2 text-[12px]"
                                style={{ color: "var(--admin-text)" }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--admin-surface-sub)")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                              >
                                Email family
                              </Link>
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <p className="px-5 py-3 text-[11px]" style={{ color: "var(--admin-text-faint)" }}>
                  {filtered.length.toLocaleString()} famil{filtered.length !== 1 ? "ies" : "y"}
                </p>
              </>
            )}
          </>
        )}
      </div>

      {/* Create Family Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <CreateFamilyModal
              onSubmit={handleCreateFamily}
              onClose={() => { setShowCreate(false); setCreateError(null); }}
              error={createError}
              isPending={isPending}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* CreateFamilyModal                                                           */
/* -------------------------------------------------------------------------- */

function CreateFamilyModal({
  onSubmit,
  onClose,
  error,
  isPending,
}: {
  onSubmit: (input: CreateFamilyInput) => void;
  onClose: () => void;
  error: string | null;
  isPending: boolean;
}) {
  const [familyName, setFamilyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sendInvite, setSendInvite] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ familyName, firstName, lastName, email, phone, sendInvite });
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">New Family</h2>
        <p className="text-sm text-neutral-500 mt-0.5">
          Create a family and its primary parent account.
        </p>
      </div>

      <div className="space-y-3">
        <FormField label="Family Name" required>
          <input
            type="text"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            placeholder="e.g. Smith Family"
            required
            className={inputCls}
          />
        </FormField>

        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 pt-1">
          Primary Parent
        </p>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="First Name" required>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className={inputCls}
            />
          </FormField>
          <FormField label="Last Name" required>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className={inputCls}
            />
          </FormField>
        </div>

        <FormField label="Email" required>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={inputCls}
          />
        </FormField>

        <FormField label="Phone">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputCls}
          />
        </FormField>

        <label className="flex items-start gap-3 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={sendInvite}
            onChange={(e) => setSendInvite(e.target.checked)}
            className="mt-0.5 rounded border-neutral-300 text-primary-600 focus:ring-primary-600"
          />
          <div>
            <p className="text-sm font-medium text-neutral-800">Send welcome email</p>
            <p className="text-xs text-neutral-500">
              Emails the parent a secure link to set their password and sign in.
            </p>
          </div>
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ModalActions onClose={onClose} isPending={isPending} submitLabel="Create Family" />
    </form>
  );
}
