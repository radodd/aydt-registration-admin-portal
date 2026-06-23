"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { signOut } from "@/app/auth/actions";
import { updateInstructorPhone } from "@/app/instructor/actions/updateProfile";
import {
  getInstructorThisSeasonStats,
  formatTime,
  type ThisSeasonStats,
} from "@/queries/instructor";
import { Pencil, Eye, EyeOff, ArrowRight, Check } from "lucide-react";

type SaveState = "idle" | "saving" | "saved" | "error";

interface Profile {
  firstName: string;
  lastName:  string;
  email:     string;
  phone:     string;
  joinedAt:  string;
}

const NOTIFICATION_TOGGLES = [
  { key: "class_reminders",       title: "Class reminders",     desc: "SMS 30 minutes before each class starts",     defaultOn: true  },
  { key: "roster_changes",        title: "Roster changes",      desc: "Email when a student joins or drops your class", defaultOn: true  },
  { key: "sub_requests",          title: "Sub requests",        desc: "Notify me when other instructors need coverage", defaultOn: false },
  { key: "studio_announcements",  title: "Studio announcements", desc: "Important updates from AYDT staff",            defaultOn: true  },
];

const CERTIFICATIONS = [
  { name: "CPR / First Aid",         meta: "American Red Cross · Expires Jun 2026", status: "expiring", label: "Expires soon" },
  { name: "Background check",        meta: "Cleared Aug 2024 · Valid for 2 years",   status: "active",   label: "Active"        },
  { name: "RAD ballet certification", meta: "Royal Academy of Dance · 2019",          status: "active",   label: "On file"       },
] as const;

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function InstructorProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats,   setStats]   = useState<ThisSeasonStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Phone edit
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneValue,   setPhoneValue]   = useState("");
  const [phoneSave,    setPhoneSave]    = useState<SaveState>("idle");
  const [phoneError,   setPhoneError]   = useState<string | null>(null);

  // Password change
  const [newPassword, setNewPassword] = useState("");
  const [confirmPw,   setConfirmPw]   = useState("");
  const [showNew,     setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwSave,      setPwSave]      = useState<SaveState>("idle");
  const [pwError,     setPwError]     = useState<string | null>(null);

  // Notification toggles (UI only — not persisted)
  const [toggles, setToggles] = useState<Record<string, boolean>>(() =>
    NOTIFICATION_TOGGLES.reduce((acc, t) => ({ ...acc, [t.key]: t.defaultOn }), {}),
  );

  // Sign out states
  const [signingOut, setSigningOut] = useState<"none" | "this" | "all">("none");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      const [{ data }, statsResult] = await Promise.all([
        supabase
          .from("users")
          .select("first_name, last_name, email, phone_number, created_at")
          .eq("id", user.id)
          .single(),
        getInstructorThisSeasonStats(user.id),
      ]);
      if (data) {
        setProfile({
          firstName: (data.first_name as string) ?? "",
          lastName:  (data.last_name  as string) ?? "",
          email:     (data.email      as string) ?? user.email ?? "",
          phone:     (data.phone_number as string) ?? "",
          joinedAt:  (data.created_at as string) ?? "",
        });
        setPhoneValue((data.phone_number as string) ?? "");
      }
      setStats(statsResult);
      setLoading(false);
    });
  }, []);

  async function handleSavePhone() {
    setPhoneSave("saving");
    setPhoneError(null);
    const result = await updateInstructorPhone(phoneValue);
    if (!result.success) {
      setPhoneError(result.error ?? "Failed to save");
      setPhoneSave("error");
      return;
    }
    setProfile((p) => p ? { ...p, phone: phoneValue } : p);
    setPhoneSave("saved");
    setEditingPhone(false);
    setTimeout(() => setPhoneSave("idle"), 2500);
  }

  const pwLongEnough = newPassword.length >= 8;
  const pwMatch      = newPassword === confirmPw;
  const canChangePw  = pwLongEnough && pwMatch && newPassword.length > 0;

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!canChangePw) return;
    setPwSave("saving");
    setPwError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPwError(error.message);
      setPwSave("error");
      return;
    }
    setNewPassword("");
    setConfirmPw("");
    setPwSave("saved");
    setTimeout(() => setPwSave("idle"), 2500);
  }

  async function handleSignOut(scope: "local" | "global") {
    setSigningOut(scope === "global" ? "all" : "this");
    // Canonical server action: revalidates layouts + redirects to /auth on
    // success; returns { error } (no redirect) so we can surface failures.
    const res = await signOut({ scope });
    if (res?.error) {
      alert(res.error);
      setSigningOut("none");
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 max-w-2xl">
        {[120, 100, 200, 160, 180].map((h, i) => (
          <div
            key={i}
            className="rounded-2xl animate-pulse"
            style={{ height: h, background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}
          />
        ))}
      </div>
    );
  }

  const initials = profile
    ? `${profile.firstName[0] ?? ""}${profile.lastName[0] ?? ""}`.toUpperCase()
    : "?";
  const joinedLabel = profile?.joinedAt
    ? new Date(profile.joinedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : null;

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--admin-text)" }}>Profile</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--admin-text-muted)" }}>
          Manage your account and teaching information
        </p>
      </div>

      {/* ── YOUR INFO ─────────────────────────────────────────── */}
      <SectionLabel>Your Info</SectionLabel>
      <Card>
        <div
          className="flex items-center gap-4 pb-4 mb-4"
          style={{ borderBottom: "1px solid var(--admin-border-sub)" }}
        >
          <div
            className="flex items-center justify-center rounded-full text-base font-semibold shrink-0"
            style={{
              width: 60, height: 60,
              background: "var(--admin-surface-sub)",
              color: "var(--admin-sidebar-active)",
              fontSize: 18,
            }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold" style={{ color: "var(--admin-text)" }}>
              {profile?.firstName} {profile?.lastName}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5 text-xs" style={{ color: "var(--admin-text-muted)" }}>
              <span
                className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: "#FBEAF0", color: "#993556" }}
              >
                Instructor
              </span>
              {joinedLabel && <span>· Joined {joinedLabel}</span>}
            </div>
          </div>
        </div>

        <FieldRow label="Email">
          <span className="text-sm" style={{ color: "var(--admin-text)" }}>
            {profile?.email}
          </span>
        </FieldRow>

        <FieldRow
          label="Phone"
          editAction={!editingPhone ? {
            label: profile?.phone ? "Edit" : "Add",
            onClick: () => { setEditingPhone(true); setPhoneError(null); },
          } : undefined}
        >
          {editingPhone ? (
            <div className="flex flex-col gap-2 w-full">
              <div className="flex gap-2 flex-wrap">
                <input
                  type="tel"
                  value={phoneValue}
                  onChange={(e) => { setPhoneValue(e.target.value); setPhoneError(null); }}
                  placeholder="(555) 123-4567"
                  autoFocus
                  className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{
                    background: "var(--admin-surface-sub)",
                    border:     "1px solid var(--admin-border-sub)",
                    color:      "var(--admin-text)",
                    fontSize:   16,
                  }}
                />
                <button
                  onClick={handleSavePhone}
                  disabled={phoneSave === "saving"}
                  className="px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50"
                  style={{ background: "var(--admin-sidebar-active)", color: "#fff", minHeight: 36 }}
                >
                  {phoneSave === "saving" ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => { setEditingPhone(false); setPhoneValue(profile?.phone ?? ""); setPhoneError(null); }}
                  className="px-3 py-2 rounded-lg text-xs"
                  style={{ color: "var(--admin-text-muted)", minHeight: 36 }}
                >
                  Cancel
                </button>
              </div>
              {phoneError && (
                <p className="text-xs" style={{ color: "#A32D2D" }}>{phoneError}</p>
              )}
            </div>
          ) : profile?.phone ? (
            <span className="text-sm" style={{ color: "var(--admin-text)" }}>{profile.phone}</span>
          ) : (
            <span className="text-sm italic" style={{ color: "var(--admin-text-faint)" }}>Not set</span>
          )}
          {phoneSave === "saved" && (
            <span className="text-xs flex items-center gap-1" style={{ color: "#3B6D11" }}>
              <Check size={12} /> Saved
            </span>
          )}
        </FieldRow>
      </Card>

      {/* ── THIS SEASON ───────────────────────────────────────── */}
      <SectionLabel>This Season</SectionLabel>
      <Card>
        <div className="grid grid-cols-3 gap-2 mb-4">
          <StatTile value={String(stats?.classCount ?? 0)} label="classes" />
          <StatTile value={String(stats?.studentCount ?? 0)} label="students" />
          <StatTile
            value={stats?.attendanceLoggedPct !== null && stats?.attendanceLoggedPct !== undefined ? `${stats.attendanceLoggedPct}%` : "—"}
            label="attendance logged"
            accent={stats?.attendanceLoggedPct !== null && stats?.attendanceLoggedPct !== undefined && stats.attendanceLoggedPct >= 80 ? "good" : undefined}
          />
        </div>
        <div
          className="flex items-center justify-between gap-2 flex-wrap pt-3 text-xs"
          style={{ borderTop: "1px solid var(--admin-border-sub)", color: "var(--admin-text-muted)" }}
        >
          {stats?.nextClass ? (
            <>
              <span>
                Next class: <strong style={{ color: "var(--admin-text)", fontWeight: 500 }}>
                  {stats.nextClass.className}
                </strong>{" · "}
                {stats.nextClass.isToday ? "Today" : new Date(stats.nextClass.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {stats.nextClass.startTime ? ` ${formatTime(stats.nextClass.startTime)}` : ""}
              </span>
              <Link
                href={`/instructor/classes/series/${stats.nextClass.classKey}`}
                className="flex items-center gap-1 font-medium"
                style={{ color: "var(--admin-sidebar-active)" }}
              >
                View schedule <ArrowRight size={12} />
              </Link>
            </>
          ) : (
            <span>No upcoming classes scheduled.</span>
          )}
        </div>
      </Card>

      {/* ── CERTIFICATIONS ──────────────────────────────────── */}
      <SectionLabel>Certifications &amp; Credentials</SectionLabel>
      <Card>
        {CERTIFICATIONS.map((c, idx) => (
          <div
            key={c.name}
            className="flex items-center justify-between gap-3 py-3"
            style={{ borderBottom: idx === CERTIFICATIONS.length - 1 ? "none" : "1px solid var(--admin-border-sub)" }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium" style={{ color: "var(--admin-text)" }}>{c.name}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--admin-text-muted)" }}>{c.meta}</p>
            </div>
            <span
              className="text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0"
              style={
                c.status === "expiring"
                  ? { background: "#FAEEDA", color: "#854F0B" }
                  : { background: "#EAF3DE", color: "#3B6D11" }
              }
            >
              {c.label}
            </span>
          </div>
        ))}
        <p
          className="text-xs mt-3 pt-3"
          style={{ borderTop: "1px solid var(--admin-border-sub)", color: "var(--admin-text-muted)" }}
        >
          Need to update?{" "}
          <span style={{ color: "var(--admin-sidebar-active)", fontWeight: 500 }}>
            Contact studio admin
          </span>
        </p>
      </Card>

      {/* ── NOTIFICATIONS ───────────────────────────────────── */}
      <SectionLabel>Notifications</SectionLabel>
      <Card>
        {NOTIFICATION_TOGGLES.map((t, idx) => (
          <div
            key={t.key}
            className="flex items-center justify-between gap-3 py-3"
            style={{ borderBottom: idx === NOTIFICATION_TOGGLES.length - 1 ? "none" : "1px solid var(--admin-border-sub)" }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium" style={{ color: "var(--admin-text)" }}>{t.title}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--admin-text-muted)" }}>{t.desc}</p>
            </div>
            <Toggle
              on={!!toggles[t.key]}
              onChange={() => setToggles((prev) => ({ ...prev, [t.key]: !prev[t.key] }))}
            />
          </div>
        ))}
        <p
          className="text-[11px] mt-3 pt-3 italic"
          style={{ borderTop: "1px solid var(--admin-border-sub)", color: "var(--admin-text-faint)" }}
        >
          Preferences will be wired up in a future release.
        </p>
      </Card>

      {/* ── SECURITY ────────────────────────────────────────── */}
      <SectionLabel>Security</SectionLabel>
      <form
        onSubmit={handleChangePassword}
        className="rounded-2xl px-5 py-5"
        style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}
      >
        <p className="text-sm font-medium mb-1" style={{ color: "var(--admin-text)" }}>Change password</p>
        <p className="text-xs mb-4" style={{ color: "var(--admin-text-muted)" }}>
          Use at least 8 characters, with a mix of letters and numbers.
        </p>

        <PasswordInput
          label="New password"
          value={newPassword}
          onChange={(v) => { setNewPassword(v); setPwError(null); }}
          show={showNew}
          onToggle={() => setShowNew((v) => !v)}
          placeholder="At least 8 characters"
        />
        <PasswordInput
          label="Confirm new password"
          value={confirmPw}
          onChange={(v) => { setConfirmPw(v); setPwError(null); }}
          show={showConfirm}
          onToggle={() => setShowConfirm((v) => !v)}
          placeholder="Re-enter your password"
        />

        {newPassword.length > 0 && !pwLongEnough && (
          <p className="text-xs mb-2" style={{ color: "#A32D2D" }}>Must be at least 8 characters.</p>
        )}
        {confirmPw.length > 0 && newPassword !== confirmPw && (
          <p className="text-xs mb-2" style={{ color: "#A32D2D" }}>Passwords do not match.</p>
        )}
        {pwError && <p className="text-xs mb-2" style={{ color: "#A32D2D" }}>{pwError}</p>}

        <button
          type="submit"
          disabled={!canChangePw || pwSave === "saving"}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
          style={{ background: "var(--admin-sidebar-active)", color: "#fff", minHeight: 44 }}
        >
          {pwSave === "saving" ? "Updating…" : pwSave === "saved" ? "Updated ✓" : "Update password"}
        </button>
      </form>

      {/* ── ACCOUNT ────────────────────────────────────────── */}
      <Card>
        <p className="text-sm font-medium mb-3" style={{ color: "var(--admin-text)" }}>Account</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleSignOut("local")}
            disabled={signingOut !== "none"}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{
              border: "1px solid var(--admin-border-sub)",
              color:  "var(--admin-text)",
              background: "transparent",
              minHeight: 40,
            }}
          >
            {signingOut === "this" ? "Signing out…" : "Sign out"}
          </button>
          <button
            onClick={() => {
              if (!confirm("Sign out of all devices? You'll have to sign back in everywhere.")) return;
              handleSignOut("global");
            }}
            disabled={signingOut !== "none"}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{
              border: "1px solid rgba(163, 45, 45, 0.3)",
              color:  "#A32D2D",
              background: "transparent",
              minHeight: 40,
            }}
          >
            {signingOut === "all" ? "Signing out…" : "Sign out everywhere"}
          </button>
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Building blocks                                                             */
/* -------------------------------------------------------------------------- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-[11px] font-semibold tracking-wider uppercase mt-2 mb-2 px-1"
      style={{ color: "var(--admin-text-faint)" }}
    >
      {children}
    </h2>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl px-5 py-5"
      style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}
    >
      {children}
    </div>
  );
}

function FieldRow({
  label,
  editAction,
  children,
}: {
  label:      string;
  editAction?: { label: string; onClick: () => void };
  children:   React.ReactNode;
}) {
  return (
    <div
      className="flex items-start justify-between gap-3 py-3"
      style={{ borderBottom: "1px solid var(--admin-border-sub)" }}
    >
      <div className="min-w-[100px] pt-0.5">
        <span
          className="text-[11px] uppercase tracking-wide font-medium"
          style={{ color: "var(--admin-text-faint)" }}
        >
          {label}
        </span>
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">{children}</div>
      {editAction && (
        <button
          onClick={editAction.onClick}
          className="text-xs flex items-center gap-1 font-medium shrink-0 pt-0.5"
          style={{ color: "var(--admin-sidebar-active)" }}
        >
          <Pencil size={12} /> {editAction.label}
        </button>
      )}
    </div>
  );
}

function StatTile({ value, label, accent }: { value: string; label: string; accent?: "good" }) {
  const color = accent === "good" ? "#3B6D11" : "var(--admin-text)";
  return (
    <div
      className="rounded-xl px-3 py-3 text-center"
      style={{ background: "var(--admin-surface-sub)" }}
    >
      <div className="text-xl font-semibold leading-none" style={{ color }}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide mt-1" style={{ color: "var(--admin-text-faint)" }}>
        {label}
      </div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="relative shrink-0 transition-colors"
      style={{
        width: 38, height: 22,
        borderRadius: 999,
        background: on ? "var(--admin-sidebar-active)" : "var(--admin-border-sub)",
        border: "none",
        cursor: "pointer",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 18 : 2,
          width: 18, height: 18,
          background: "#fff",
          borderRadius: "50%",
          transition: "left 0.15s",
        }}
      />
    </button>
  );
}

function PasswordInput({
  label, value, onChange, show, onToggle, placeholder,
}: {
  label:       string;
  value:       string;
  onChange:    (v: string) => void;
  show:        boolean;
  onToggle:    () => void;
  placeholder: string;
}) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--admin-text)" }}>
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none"
          style={{
            background: "var(--admin-surface-sub)",
            border:     "1px solid var(--admin-border-sub)",
            color:      "var(--admin-text)",
            fontSize:   16,
          }}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
          style={{ color: "var(--admin-text-faint)" }}
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );
}
