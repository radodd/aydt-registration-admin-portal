"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
  getInstructorSessionDetail,
  getSessionRoster,
  getStudentNote,
  formatTime,
  formatDay,
  formatDiscipline,
  calcAge,
  type SessionDetail,
  type RosterEntry,
} from "@/queries/instructor";
import { upsertStudentNote } from "@/app/instructor/actions/notes";
import {
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  ChevronDown,
  X,
  User,
  NotebookPen,
  Copy,
  Check,
} from "lucide-react";
import { AttendanceTab } from "./AttendanceTab";

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

type Tab = "roster" | "attendance";

export default function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();

  const [session,       setSession]       = useState<SessionDetail | null>(null);
  const [roster,        setRoster]        = useState<RosterEntry[]>([]);
  const [tab,           setTab]           = useState<Tab>("roster");
  const [loading,       setLoading]       = useState(true);
  const [selected,      setSelected]      = useState<RosterEntry | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [emailsCopied,  setEmailsCopied]  = useState(false);

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => setCurrentUserId(user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    Promise.all([
      getInstructorSessionDetail(sessionId),
      getSessionRoster(sessionId),
    ]).then(([detail, rosterData]) => {
      setSession(detail);
      setRoster(rosterData);
      setLoading(false);
    });
  }, [sessionId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-32 rounded-lg animate-pulse" style={{ background: "var(--admin-surface)" }} />
        <div className="h-24 rounded-2xl animate-pulse" style={{ background: "var(--admin-surface)" }} />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: "var(--admin-surface)" }} />
          ))}
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-16 text-sm" style={{ color: "var(--admin-text-faint)" }}>
        Session not found.
      </div>
    );
  }

  const timeLabel = session.startTime
    ? `${formatTime(session.startTime)}${session.endTime ? ` – ${formatTime(session.endTime)}` : ""}`
    : null;

  const lead = session.instructors.find((i) => i.isLead);

  return (
    <>
      <div className="space-y-5">
        {/* ── Back button ──────────────────────────────────────────── */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm font-medium transition-colors"
          style={{ color: "var(--admin-text-muted)" }}
        >
          <ArrowLeft size={16} />
          Classes
        </button>

        {/* ── Session header ───────────────────────────────────────── */}
        <div
          className="rounded-2xl px-5 py-5"
          style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}
        >
          <div className="flex items-start gap-2 flex-wrap mb-2">
            <h1
              className="text-xl font-semibold leading-snug"
              style={{ color: "var(--admin-text)" }}
            >
              {session.className}
            </h1>
            <span
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
              style={{ background: "var(--admin-surface-sub)", color: "var(--admin-text-muted)" }}
            >
              {formatDiscipline(session.discipline)}
            </span>
            <span
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize"
              style={{ background: "var(--admin-surface-sub)", color: "var(--admin-text-muted)" }}
            >
              {session.division.replace(/_/g, " ")}
            </span>
          </div>

          <div className="space-y-1 text-sm" style={{ color: "var(--admin-text-muted)" }}>
            {timeLabel && (
              <p>{formatDay(session.dayOfWeek)} · {timeLabel}</p>
            )}
            {session.location && (
              <p className="flex items-center gap-1.5">
                <MapPin size={13} />
                {session.location}
              </p>
            )}
          </div>

          {/* Instructor list */}
          {session.instructors.length > 0 && (
            <div className="mt-3 pt-3 flex flex-wrap gap-2" style={{ borderTop: "1px solid var(--admin-border-sub)" }}>
              {session.instructors.map((i) => (
                <span
                  key={i.userId}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                  style={
                    i.isLead
                      ? { background: "#FDF2F1", color: "var(--admin-sidebar-active)" }
                      : { background: "var(--admin-surface-sub)", color: "var(--admin-text-muted)" }
                  }
                >
                  <User size={11} />
                  {i.firstName} {i.lastName}
                  {i.isLead && <span className="opacity-60 font-normal">· Lead</span>}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────── */}
        <div
          className="flex rounded-xl overflow-hidden"
          style={{ border: "1px solid var(--admin-border)" }}
        >
          {(["roster", "attendance"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2.5 text-sm font-medium capitalize transition-colors"
              style={
                tab === t
                  ? { background: "var(--admin-sidebar-active)", color: "#fff" }
                  : { background: "var(--admin-surface)", color: "var(--admin-text-muted)" }
              }
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* ── Tab content ──────────────────────────────────────────── */}
        {tab === "roster" ? (
          <RosterTab roster={roster} onSelectDancer={setSelected} />
        ) : (
          session && <AttendanceTab session={session} roster={roster} />
        )}

        {/* ── Message Families ───────────────────────────────────── */}
        {roster.length > 0 && (
          <div
            className="rounded-2xl px-5 py-4 mt-2"
            style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}
          >
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--admin-text-faint)" }}>
              Message Families
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              {/* mailto: link — opens device email app with all parents BCC'd */}
              <a
                href={`mailto:?bcc=${roster.map((e) => e.parent?.email).filter(Boolean).join(",")}&subject=${encodeURIComponent(session?.className ?? "Class Update")}`}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{ background: "var(--admin-sidebar-active)", color: "#fff", textDecoration: "none", minHeight: "44px" }}
              >
                <Mail size={14} />
                Open in Email App
              </a>
              {/* Copy all emails */}
              <button
                onClick={() => {
                  const emails = roster.map((e) => e.parent?.email).filter(Boolean).join(", ");
                  navigator.clipboard.writeText(emails);
                  setEmailsCopied(true);
                  setTimeout(() => setEmailsCopied(false), 2000);
                }}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{ background: "var(--admin-surface-sub)", color: "var(--admin-text)", border: "1px solid var(--admin-border)", minHeight: "44px" }}
              >
                {emailsCopied ? <Check size={14} /> : <Copy size={14} />}
                {emailsCopied ? "Copied!" : "Copy Emails"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Dancer detail drawer ─────────────────────────────────── */}
      {selected && (
        <DancerDrawer
          entry={selected}
          currentUserId={currentUserId}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* RosterTab                                                                   */
/* -------------------------------------------------------------------------- */

function RosterTab({
  roster,
  onSelectDancer,
}: {
  roster: RosterEntry[];
  onSelectDancer: (entry: RosterEntry) => void;
}) {
  if (roster.length === 0) {
    return (
      <div
        className="rounded-2xl border border-dashed px-6 py-12 text-center text-sm"
        style={{ borderColor: "var(--admin-border)", color: "var(--admin-text-faint)" }}
      >
        No students enrolled in this session.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide px-1" style={{ color: "var(--admin-text-faint)" }}>
        {roster.length} student{roster.length !== 1 ? "s" : ""} enrolled
      </p>

      {roster.map((entry) => {
        const age = calcAge(entry.dancer.birthDate);
        const initials = `${entry.dancer.firstName[0]}${entry.dancer.lastName[0]}`.toUpperCase();

        return (
          <button
            key={entry.registrationId}
            onClick={() => onSelectDancer(entry)}
            className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-left transition-colors active:scale-[0.99]"
            style={{
              background: "var(--admin-surface)",
              border: "1px solid var(--admin-border)",
              minHeight: "64px", // solid touch target
            }}
          >
            {/* Avatar */}
            <div
              className="flex items-center justify-center rounded-full text-sm font-semibold shrink-0"
              style={{
                width: 40, height: 40,
                background: "var(--admin-surface-sub)",
                color: "var(--admin-sidebar-active)",
              }}
            >
              {initials}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm" style={{ color: "var(--admin-text)" }}>
                {entry.dancer.firstName} {entry.dancer.lastName}
              </p>
              <p className="text-xs mt-0.5 truncate" style={{ color: "var(--admin-text-muted)" }}>
                {[
                  age !== null && `Age ${age}`,
                  entry.dancer.grade && `Grade ${entry.dancer.grade}`,
                  entry.parent && `${entry.parent.firstName} ${entry.parent.lastName}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>

            <ChevronDown
              size={16}
              className="-rotate-90 shrink-0"
              style={{ color: "var(--admin-text-faint)" }}
            />
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* DancerDrawer — bottom sheet on mobile, centred panel on desktop             */
/* -------------------------------------------------------------------------- */

function DancerDrawer({
  entry,
  currentUserId,
  onClose,
}: {
  entry:         RosterEntry;
  currentUserId: string | null;
  onClose:       () => void;
}) {
  const age      = calcAge(entry.dancer.birthDate);
  const initials = `${entry.dancer.firstName[0]}${entry.dancer.lastName[0]}`.toUpperCase();

  // ── Notes state ────────────────────────────────────────────────
  const [noteText,    setNoteText]    = useState("");
  const [noteId,      setNoteId]      = useState<string | null>(null);
  const [noteSaving,  setNoteSaving]  = useState(false);
  const [noteSaved,   setNoteSaved]   = useState(false);
  const [noteLoading, setNoteLoading] = useState(true);

  useEffect(() => {
    if (!currentUserId) return;
    setNoteLoading(true);
    getStudentNote(entry.dancer.id, currentUserId).then((n) => {
      setNoteText(n?.note ?? "");
      setNoteId(n?.id ?? null);
      setNoteLoading(false);
    });
  }, [entry.dancer.id, currentUserId]);

  const handleSaveNote = async () => {
    if (!noteText.trim()) return;
    setNoteSaving(true);
    try {
      await upsertStudentNote(entry.dancer.id, noteText.trim());
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
    } finally {
      setNoteSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
      />

      {/* Panel — slides up on mobile, centred modal on md+ */}
      <div
        className="fixed z-50 w-full md:w-auto md:max-w-sm md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2"
        style={{
          bottom: 0,
          left: 0,
          right: 0,
          background: "var(--admin-surface)",
          borderRadius: "20px 20px 0 0",
          boxShadow: "0 -4px 40px rgba(0,0,0,0.18)",
          maxHeight: "90vh",
          overflowY: "auto",
          // md overrides
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--admin-border)" }} />
        </div>

        <div className="px-5 pb-10 pt-3 md:py-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center rounded-full text-base font-semibold shrink-0"
                style={{
                  width: 48, height: 48,
                  background: "var(--admin-surface-sub)",
                  color: "var(--admin-sidebar-active)",
                }}
              >
                {initials}
              </div>
              <div>
                <p className="font-semibold text-base" style={{ color: "var(--admin-text)" }}>
                  {entry.dancer.firstName} {entry.dancer.lastName}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--admin-text-muted)" }}>
                  {[
                    age !== null && `Age ${age}`,
                    entry.dancer.grade && `Grade ${entry.dancer.grade}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg"
              style={{ color: "var(--admin-text-faint)" }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Student contact */}
          {(entry.dancer.phone || entry.dancer.email) && (
            <Section label="Student Contact">
              {entry.dancer.phone && (
                <ContactRow
                  icon={<Phone size={14} />}
                  label={entry.dancer.phone}
                  href={`tel:${entry.dancer.phone}`}
                />
              )}
              {entry.dancer.email && (
                <ContactRow
                  icon={<Mail size={14} />}
                  label={entry.dancer.email}
                  href={`mailto:${entry.dancer.email}`}
                />
              )}
            </Section>
          )}

          {/* Parent/guardian contact */}
          {entry.parent && (
            <Section label="Parent / Guardian">
              <p className="text-sm font-medium mb-2" style={{ color: "var(--admin-text)" }}>
                {entry.parent.firstName} {entry.parent.lastName}
              </p>
              {entry.parent.phone && (
                <ContactRow
                  icon={<Phone size={14} />}
                  label={entry.parent.phone}
                  href={`tel:${entry.parent.phone}`}
                />
              )}
              <ContactRow
                icon={<Mail size={14} />}
                label={entry.parent.email}
                href={`mailto:${entry.parent.email}`}
              />
            </Section>
          )}

          {/* Private instructor note */}
          <Section label="My Note (private)">
            {noteLoading ? (
              <div className="h-20 rounded-xl animate-pulse" style={{ background: "var(--admin-surface-sub)" }} />
            ) : (
              <>
                <textarea
                  value={noteText}
                  onChange={(e) => { setNoteText(e.target.value); setNoteSaved(false); }}
                  placeholder="Add a private note about this student…"
                  rows={3}
                  className="w-full rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none"
                  style={{
                    background:  "var(--admin-surface-sub)",
                    border:      "1px solid var(--admin-border-sub)",
                    color:       "var(--admin-text)",
                    fontSize:    "16px", // prevent iOS zoom
                  }}
                />
                <button
                  onClick={handleSaveNote}
                  disabled={noteSaving || !noteText.trim()}
                  className="mt-2 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                  style={{
                    background: noteSaved ? "#22c55e" : "var(--admin-sidebar-active)",
                    color:      "#fff",
                    minHeight:  "44px",
                  }}
                >
                  {noteSaving ? (
                    <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : noteSaved ? (
                    <Check size={14} />
                  ) : (
                    <NotebookPen size={14} />
                  )}
                  {noteSaving ? "Saving…" : noteSaved ? "Saved" : "Save Note"}
                </button>
                <p className="text-[11px] mt-1.5" style={{ color: "var(--admin-text-faint)" }}>
                  Only you and studio admins can see this note.
                </p>
              </>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <p
        className="text-[10px] font-semibold uppercase tracking-widest mb-2"
        style={{ color: "var(--admin-text-faint)" }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

function ContactRow({
  icon,
  label,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-2.5 py-2.5 px-3 rounded-xl mb-1 transition-colors active:bg-neutral-100"
      style={{
        background: "var(--admin-surface-sub)",
        color: "var(--admin-text)",
        textDecoration: "none",
        display: "flex",
        minHeight: "44px", // WCAG touch target
      }}
    >
      <span style={{ color: "var(--admin-sidebar-active)", flexShrink: 0 }}>{icon}</span>
      <span className="text-sm truncate">{label}</span>
    </a>
  );
}
