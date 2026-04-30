"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import {
  getDancerProfile,
  getAllMyClassesForDancer,
  getAllNotesForDancer,
  formatTime,
  formatDay,
  formatDiscipline,
  calcAge,
  type DancerProfile,
  type DancerNote,
  type MyClassWithDancer,
} from "@/queries/instructor";
import {
  createStudentNote,
  updateStudentNote,
  deleteStudentNote,
  type NoteTag,
} from "@/app/instructor/actions/notes";
import {
  createFamilyContact,
  type FamilyContactType,
} from "@/app/instructor/actions/familyContacts";
import {
  ArrowLeft, Phone, Mail, MessageSquare, Plus, MoreHorizontal,
  X, Pencil, Trash2,
} from "lucide-react";

type Scope = "class" | "all";

const NOTE_TAG_OPTIONS: { value: NoteTag; label: string }[] = [
  { value: "progress", label: "Progress" },
  { value: "behavior", label: "Behavior" },
  { value: "goal",     label: "Goal" },
  { value: "general",  label: "General" },
];

const TAG_STYLES: Record<NoteTag, { bg: string; color: string }> = {
  progress: { bg: "#EAF3DE", color: "#3B6D11" },
  behavior: { bg: "#E6F1FB", color: "#185FA5" },
  goal:     { bg: "#FAEEDA", color: "#854F0B" },
  general:  { bg: "var(--admin-surface-sub)", color: "var(--admin-text-muted)" },
};

const STATUS_STYLES: Record<string, { bg: string; color: string; letter: string }> = {
  present: { bg: "#EAF3DE", color: "#3B6D11", letter: "P" },
  absent:  { bg: "#FCEBEB", color: "#A32D2D", letter: "A" },
  tardy:   { bg: "#FAEEDA", color: "#854F0B", letter: "T" },
  excused: { bg: "#E6F1FB", color: "#185FA5", letter: "E" },
};

function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso + (iso.length === 10 ? "T12:00:00" : "")).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fmtMonthYear(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function DancerDetailPage() {
  const { sessionId, dancerId } = useParams<{ sessionId: string; dancerId: string }>();
  const router = useRouter();

  const [profile,    setProfile]    = useState<DancerProfile | null>(null);
  const [allClasses, setAllClasses] = useState<MyClassWithDancer[]>([]);
  const [allNotes,   setAllNotes]   = useState<DancerNote[]>([]);
  const [scope,      setScope]      = useState<Scope>("class");
  const [loading,    setLoading]    = useState(true);
  const [me,         setMe]         = useState<string | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => setMe(user?.id ?? null));
  }, []);

  const refresh = async () => {
    if (!sessionId || !dancerId || !me) return;
    const [prof, classes, notes] = await Promise.all([
      getDancerProfile(dancerId, sessionId),
      getAllMyClassesForDancer(dancerId, me),
      getAllNotesForDancer(dancerId),
    ]);
    setProfile(prof);
    setAllClasses(classes);
    setAllNotes(notes);
  };

  useEffect(() => {
    if (!sessionId || !dancerId || !me) return;
    setLoading(true);
    refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, dancerId, me]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 rounded-lg animate-pulse" style={{ background: "var(--admin-surface)" }} />
        <div className="h-32 rounded-2xl animate-pulse" style={{ background: "var(--admin-surface)" }} />
        <div className="h-12 rounded-2xl animate-pulse" style={{ background: "var(--admin-surface)" }} />
        <div className="h-48 rounded-2xl animate-pulse" style={{ background: "var(--admin-surface)" }} />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-16 text-sm" style={{ color: "var(--admin-text-faint)" }}>
        Dancer not found.
      </div>
    );
  }

  const { dancer, family, contacts, thisClass } = profile;
  const age = calcAge(dancer.birthDate);

  // Hero stats — depend on scope
  const classAttendanceTotal = thisClass.attendance.length;
  const classPresent = thisClass.attendance.filter((a) => a.status === "present").length;
  const classTardy   = thisClass.attendance.filter((a) => a.status === "tardy").length;
  const classExcused = thisClass.attendance.filter((a) => a.status === "excused").length;
  const classPct = classAttendanceTotal > 0
    ? Math.round(((classPresent + classTardy + classExcused) / classAttendanceTotal) * 100)
    : null;

  const allMarked = allClasses.reduce(
    (acc, c) => {
      acc.present += c.attendance.present;
      acc.absent  += c.attendance.absent;
      acc.tardy   += c.attendance.tardy;
      acc.excused += c.attendance.excused;
      return acc;
    },
    { present: 0, absent: 0, tardy: 0, excused: 0 },
  );
  const allMarkedTotal = allMarked.present + allMarked.absent + allMarked.tardy + allMarked.excused;
  const allPct = allMarkedTotal > 0
    ? Math.round(((allMarked.present + allMarked.tardy + allMarked.excused) / allMarkedTotal) * 100)
    : null;
  const allSessionsTaught = allClasses.reduce((acc, c) => acc + c.attendance.total, 0);

  const heroStats = scope === "class"
    ? {
        attendance: classPct,
        classes:    1,
        sessions:   classAttendanceTotal,
      }
    : {
        attendance: allPct,
        classes:    allClasses.length,
        sessions:   allSessionsTaught,
      };

  return (
    <div className="space-y-5">
      {/* Back link */}
      <Link
        href={`/instructor/classes/${sessionId}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium"
        style={{ color: "var(--admin-text-muted)" }}
      >
        <ArrowLeft size={16} />
        {thisClass.className} · Roster
      </Link>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <div
        className="rounded-2xl px-5 py-5"
        style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}
      >
        <div className="flex items-center gap-4 mb-4">
          <div
            className="flex items-center justify-center rounded-full text-base font-semibold shrink-0"
            style={{
              width: 56, height: 56,
              background: "var(--admin-surface-sub)",
              color: "var(--admin-sidebar-active)",
              fontSize: 17,
            }}
          >
            {initials(dancer.firstName, dancer.lastName)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold leading-snug" style={{ color: "var(--admin-text)" }}>
              {dancer.firstName} {dancer.lastName}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--admin-text-muted)" }}>
              {[
                age !== null && `Age ${age}`,
                dancer.grade && `Grade ${dancer.grade}`,
                dancer.enrolledSince && `Enrolled since ${fmtMonthYear(dancer.enrolledSince)}`,
              ].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>

        <div
          className="grid grid-cols-3 gap-2 pt-4"
          style={{ borderTop: "1px solid var(--admin-border-sub)" }}
        >
          <Stat label="attendance" value={heroStats.attendance !== null ? `${heroStats.attendance}%` : "—"} accent={heroStats.attendance !== null && heroStats.attendance >= 90 ? "good" : heroStats.attendance !== null && heroStats.attendance >= 75 ? "warn" : undefined} />
          <Stat label={scope === "class" ? "this class" : "enrolled classes"} value={String(heroStats.classes)} />
          <Stat label="sessions" value={String(heroStats.sessions)} />
        </div>
      </div>

      {/* ── Scope toggle ───────────────────────────────────────── */}
      <div
        className="grid grid-cols-2 rounded-2xl p-1"
        style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}
      >
        {(["class", "all"] as Scope[]).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className="text-center py-2.5 px-3 text-sm font-medium rounded-xl transition-colors"
            style={
              scope === s
                ? { background: "var(--admin-sidebar-active)", color: "#fff" }
                : { background: "transparent", color: "var(--admin-text-muted)" }
            }
          >
            <div>{s === "class" ? "This class" : "All my classes"}</div>
            <div className="text-[11px] opacity-70 mt-0.5 font-normal">
              {s === "class"
                ? `${thisClass.className} · ${thisClass.semesterName}`
                : `${allClasses.length} class${allClasses.length === 1 ? "" : "es"} with ${dancer.firstName}`}
            </div>
          </button>
        ))}
      </div>

      {scope === "class" ? (
        <ThisClassScope
          dancerName={dancer.firstName}
          dancerId={dancer.id}
          familyId={family?.id ?? null}
          contacts={contacts}
          attendance={thisClass.attendance}
          occurrenceCount={thisClass.occurrenceCount}
          notes={thisClass.notes}
          semesterName={thisClass.semesterName}
          me={me}
          onChanged={refresh}
          onAddContact={() => setShowAddContact(true)}
        />
      ) : (
        <AllClassesScope
          dancerName={dancer.firstName}
          allClasses={allClasses}
          allNotes={allNotes}
          allMarked={allMarked}
          enrolledSince={dancer.enrolledSince}
          me={me}
          dancerId={dancer.id}
          onChanged={refresh}
        />
      )}

      {showAddContact && family && (
        <AddContactModal
          familyId={family.id}
          onClose={() => setShowAddContact(false)}
          onCreated={async () => {
            setShowAddContact(false);
            await refresh();
          }}
        />
      )}
    </div>
  );

  // unused: keep for downstream callers
  void router;
}

/* -------------------------------------------------------------------------- */
/* Hero stat                                                                   */
/* -------------------------------------------------------------------------- */

function Stat({ label, value, accent }: { label: string; value: string; accent?: "good" | "warn" }) {
  const color =
    accent === "good" ? "#3B6D11" :
    accent === "warn" ? "#854F0B" :
    "var(--admin-text)";
  return (
    <div>
      <div className="text-xl font-semibold leading-none" style={{ color }}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide mt-1" style={{ color: "var(--admin-text-faint)" }}>
        {label}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* "This class" scope                                                          */
/* -------------------------------------------------------------------------- */

function ThisClassScope({
  dancerName, dancerId, familyId, contacts, attendance, occurrenceCount,
  notes, semesterName, me, onChanged, onAddContact,
}: {
  dancerName:      string;
  dancerId:        string;
  familyId:        string | null;
  contacts:        DancerProfile["contacts"];
  attendance:      DancerProfile["thisClass"]["attendance"];
  occurrenceCount: number;
  notes:           DancerNote[];
  semesterName:    string;
  me:              string | null;
  onChanged:       () => Promise<void>;
  onAddContact:    () => void;
}) {
  const counts = {
    present: attendance.filter((a) => a.status === "present").length,
    absent:  attendance.filter((a) => a.status === "absent").length,
    tardy:   attendance.filter((a) => a.status === "tardy").length,
    excused: attendance.filter((a) => a.status === "excused").length,
  };

  return (
    <>
      {/* Contacts */}
      <SectionLabel
        label="Contacts"
        action={familyId ? { label: "+ Add contact", onClick: onAddContact } : undefined}
      />
      <Card>
        {contacts.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--admin-text-faint)" }}>
            No contacts on file.
          </p>
        ) : (
          contacts.map((c, idx) => (
            <ContactRow
              key={c.id}
              contact={c}
              isLast={idx === contacts.length - 1}
            />
          ))
        )}
      </Card>

      {/* Attendance */}
      <SectionLabel
        label={`${semesterName} Attendance`}
        meta={`${attendance.length} of ${occurrenceCount} sessions`}
      />
      <Card>
        <AttendanceBreakdown counts={counts} />
        {attendance.length === 0 ? (
          <p className="text-sm pt-3 mt-3" style={{ color: "var(--admin-text-faint)", borderTop: "1px solid var(--admin-border-sub)" }}>
            No attendance recorded yet.
          </p>
        ) : (
          <div className="pt-3 mt-3" style={{ borderTop: "1px solid var(--admin-border-sub)" }}>
            <AttendanceTimeline entries={attendance} />
          </div>
        )}
      </Card>

      {/* Notes */}
      <SectionLabel
        label="Instructor Notes"
        meta="Visible to instructors only"
      />
      <Card>
        <NotesList notes={notes} me={me} onChanged={onChanged} />
        <AddNoteForm dancerId={dancerId} dancerName={dancerName} onCreated={onChanged} />
      </Card>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* "All my classes" scope                                                      */
/* -------------------------------------------------------------------------- */

function AllClassesScope({
  dancerName, allClasses, allNotes, allMarked, enrolledSince, me, dancerId, onChanged,
}: {
  dancerName:    string;
  allClasses:    MyClassWithDancer[];
  allNotes:      DancerNote[];
  allMarked:     { present: number; absent: number; tardy: number; excused: number };
  enrolledSince: string | null;
  me:            string | null;
  dancerId:      string;
  onChanged:     () => Promise<void>;
}) {
  const totalSessions = allClasses.reduce((acc, c) => acc + c.attendance.total, 0);

  return (
    <>
      <SectionLabel label="Enrolled in your classes" meta={`${allClasses.length} class${allClasses.length === 1 ? "" : "es"}`} />
      <Card>
        {allClasses.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--admin-text-faint)" }}>
            {dancerName} isn&apos;t enrolled in any class you teach.
          </p>
        ) : (
          allClasses.map((c, idx) => (
            <ClassRow key={c.scheduleId} cls={c} isLast={idx === allClasses.length - 1} />
          ))
        )}
      </Card>

      <SectionLabel label="All-time attendance" meta="Across your classes" />
      <Card>
        <AttendanceBreakdown counts={allMarked} />
        <p
          className="text-xs pt-3 mt-3"
          style={{ color: "var(--admin-text-muted)", borderTop: "1px solid var(--admin-border-sub)" }}
        >
          {totalSessions} session{totalSessions === 1 ? "" : "s"} across {allClasses.length} class{allClasses.length === 1 ? "" : "es"}
          {enrolledSince ? ` · enrolled since ${fmtMonthYear(enrolledSince)}` : ""}
        </p>
      </Card>

      <SectionLabel label="All notes" meta="Across your classes" />
      <Card>
        {allNotes.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--admin-text-faint)" }}>
            No notes yet.
          </p>
        ) : (
          <NotesList notes={allNotes} me={me} onChanged={onChanged} />
        )}
        <AddNoteForm dancerId={dancerId} dancerName={dancerName} onCreated={onChanged} />
      </Card>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Building blocks                                                             */
/* -------------------------------------------------------------------------- */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl px-4 py-4"
      style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}
    >
      {children}
    </div>
  );
}

function SectionLabel({
  label, meta, action,
}: {
  label: string;
  meta?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex items-baseline justify-between mt-5 mb-2 px-1">
      <span
        className="text-[11px] font-semibold tracking-wider uppercase"
        style={{ color: "var(--admin-text-faint)" }}
      >
        {label}
      </span>
      {action ? (
        <button
          onClick={action.onClick}
          className="text-xs font-medium"
          style={{ color: "var(--admin-sidebar-active)" }}
        >
          {action.label}
        </button>
      ) : meta ? (
        <span className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
          {meta}
        </span>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Contacts                                                                    */
/* -------------------------------------------------------------------------- */

const CONTACT_BADGE: Record<DancerProfile["contacts"][number]["type"], { label: string; primary: boolean }> = {
  primary_parent:    { label: "Primary",   primary: true  },
  alternate_parent:  { label: "Secondary", primary: false },
  emergency_contact: { label: "Emergency", primary: false },
  caregiver:         { label: "Caregiver", primary: false },
};

function ContactRow({
  contact, isLast,
}: {
  contact: DancerProfile["contacts"][number];
  isLast:  boolean;
}) {
  const badge = CONTACT_BADGE[contact.type];
  return (
    <div
      className="flex items-center gap-3 py-3"
      style={{ borderBottom: isLast ? "none" : "1px solid var(--admin-border-sub)" }}
    >
      <div
        className="flex items-center justify-center rounded-full text-xs font-semibold shrink-0"
        style={{
          width: 36, height: 36,
          background: "var(--admin-surface-sub)",
          color: "var(--admin-text-muted)",
        }}
      >
        {initials(contact.firstName, contact.lastName)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium" style={{ color: "var(--admin-text)" }}>
          {contact.firstName} {contact.lastName}
        </div>
        <div className="text-xs flex items-center gap-1.5 flex-wrap mt-0.5" style={{ color: "var(--admin-text-muted)" }}>
          <span>{contact.relationship ?? "—"}</span>
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={
              badge.primary
                ? { background: "#FBEAF0", color: "#993556" }
                : { background: "var(--admin-surface-sub)", color: "var(--admin-text-muted)" }
            }
          >
            {badge.label}
          </span>
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        {contact.phone && (
          <>
            <IconLink href={`tel:${contact.phone}`} title="Call">
              <Phone size={14} />
            </IconLink>
            <IconLink href={`sms:${contact.phone}`} title="Text">
              <MessageSquare size={14} />
            </IconLink>
          </>
        )}
        {contact.email && (
          <IconLink href={`mailto:${contact.email}`} title="Email">
            <Mail size={14} />
          </IconLink>
        )}
      </div>
    </div>
  );
}

function IconLink({
  href, title, children,
}: {
  href:    string;
  title:   string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      title={title}
      className="flex items-center justify-center rounded-lg transition-colors"
      style={{
        width: 32, height: 32,
        border: "1px solid var(--admin-border-sub)",
        color: "var(--admin-text-muted)",
        textDecoration: "none",
      }}
    >
      {children}
    </a>
  );
}

/* -------------------------------------------------------------------------- */
/* Attendance                                                                  */
/* -------------------------------------------------------------------------- */

function AttendanceBreakdown({ counts }: { counts: { present: number; absent: number; tardy: number; excused: number } }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {(["present", "absent", "tardy", "excused"] as const).map((s) => (
        <div
          key={s}
          className="rounded-xl px-2 py-3 text-center"
          style={{ background: STATUS_STYLES[s].bg }}
        >
          <div className="text-lg font-semibold leading-none" style={{ color: STATUS_STYLES[s].color }}>
            {counts[s]}
          </div>
          <div className="text-[10px] uppercase tracking-wide mt-1" style={{ color: STATUS_STYLES[s].color, opacity: 0.85 }}>
            {s}
          </div>
        </div>
      ))}
    </div>
  );
}

function AttendanceTimeline({
  entries,
}: {
  entries: DancerProfile["thisClass"]["attendance"];
}) {
  const [showAll, setShowAll] = useState(false);
  const initial = 6;
  const visible = showAll ? entries : entries.slice(0, initial);

  return (
    <>
      <div>
        {visible.map((e, idx) => {
          const style = STATUS_STYLES[e.status];
          return (
            <div
              key={e.id}
              className="flex items-center gap-3 py-2"
              style={{
                borderBottom:
                  idx === visible.length - 1 ? "none" : "1px solid var(--admin-border-sub)",
              }}
            >
              <div
                className="flex items-center justify-center rounded-lg shrink-0 text-xs font-semibold"
                style={{ width: 28, height: 28, background: style.bg, color: style.color }}
              >
                {style.letter}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium" style={{ color: "var(--admin-text)" }}>
                  {fmtDate(e.date)}
                </div>
              </div>
              {e.note && (
                <div
                  className="text-xs italic shrink-0 text-right max-w-[200px]"
                  style={{ color: "var(--admin-text-muted)" }}
                >
                  &ldquo;{e.note}&rdquo;
                </div>
              )}
            </div>
          );
        })}
      </div>
      {entries.length > initial && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="w-full text-center text-xs font-medium mt-2 pt-2"
          style={{
            color: "var(--admin-sidebar-active)",
            borderTop: "1px solid var(--admin-border-sub)",
          }}
        >
          {showAll ? "Show fewer" : `Show ${entries.length - initial} earlier session${entries.length - initial === 1 ? "" : "s"} →`}
        </button>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Notes                                                                       */
/* -------------------------------------------------------------------------- */

function NotesList({
  notes, me, onChanged,
}: {
  notes:     DancerNote[];
  me:        string | null;
  onChanged: () => Promise<void>;
}) {
  return (
    <div>
      {notes.map((n, idx) => (
        <NoteRow
          key={n.id}
          note={n}
          isLast={idx === notes.length - 1}
          isMine={n.authorId === me}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

function NoteRow({
  note, isLast, isMine, onChanged,
}: {
  note:      DancerNote;
  isLast:    boolean;
  isMine:    boolean;
  onChanged: () => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing,  setEditing]  = useState(false);
  const [text,     setText]     = useState(note.note);
  const [tag,      setTag]      = useState<NoteTag | null>(note.tag);
  const [pending,  startTransition] = useTransition();
  const tagStyle = note.tag ? TAG_STYLES[note.tag] : null;

  const handleSave = () => {
    startTransition(async () => {
      try {
        await updateStudentNote(note.id, text, tag);
        setEditing(false);
        await onChanged();
      } catch (err) {
        alert((err as Error).message);
      }
    });
  };

  const handleDelete = () => {
    if (!confirm("Delete this note?")) return;
    startTransition(async () => {
      try {
        await deleteStudentNote(note.id);
        await onChanged();
      } catch (err) {
        alert((err as Error).message);
      }
    });
  };

  return (
    <div
      className="py-3"
      style={{ borderBottom: isLast ? "none" : "1px solid var(--admin-border-sub)" }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="text-[11px] flex items-center gap-1.5 flex-wrap" style={{ color: "var(--admin-text-faint)" }}>
          <span className="font-medium" style={{ color: "var(--admin-text-muted)" }}>
            {note.authorFirstName} {note.authorLastName}
          </span>
          <span>·</span>
          <span>{fmtDate(note.createdAt.slice(0, 10))}</span>
          {tagStyle && note.tag && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: tagStyle.bg, color: tagStyle.color }}
            >
              {note.tag.charAt(0).toUpperCase() + note.tag.slice(1)}
            </span>
          )}
        </div>
        {isMine && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="p-1 rounded-lg"
              style={{ color: "var(--admin-text-faint)" }}
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div
                  className="absolute right-0 mt-1 z-20 rounded-lg overflow-hidden"
                  style={{
                    background: "var(--admin-surface)",
                    border: "1px solid var(--admin-border)",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                    minWidth: 120,
                  }}
                >
                  <button
                    onClick={() => { setMenuOpen(false); setEditing(true); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs"
                    style={{ color: "var(--admin-text)" }}
                  >
                    <Pencil size={12} /> Edit
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); handleDelete(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs"
                    style={{ color: "#A32D2D" }}
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="w-full rounded-lg px-3 py-2 text-sm resize-none focus:outline-none"
            style={{
              background: "var(--admin-surface-sub)",
              border: "1px solid var(--admin-border-sub)",
              color: "var(--admin-text)",
              fontSize: 16,
            }}
          />
          <div className="flex flex-wrap gap-1.5">
            {NOTE_TAG_OPTIONS.map((t) => (
              <TagPill
                key={t.value}
                tag={t.value}
                label={t.label}
                active={tag === t.value}
                onClick={() => setTag(tag === t.value ? null : t.value)}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={pending || !text.trim()}
              className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
              style={{ background: "var(--admin-sidebar-active)", color: "#fff" }}
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => { setEditing(false); setText(note.note); setTag(note.tag); }}
              className="px-3 py-1.5 rounded-lg text-xs"
              style={{ color: "var(--admin-text-muted)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="text-sm leading-relaxed" style={{ color: "var(--admin-text)" }}>
          {note.note}
        </div>
      )}
    </div>
  );
}

function TagPill({
  tag, label, active, onClick,
}: {
  tag:    NoteTag;
  label:  string;
  active: boolean;
  onClick: () => void;
}) {
  const style = TAG_STYLES[tag];
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] px-2.5 py-1 rounded-full font-medium transition-opacity"
      style={
        active
          ? { background: style.bg, color: style.color, opacity: 1 }
          : { background: "var(--admin-surface-sub)", color: "var(--admin-text-muted)", opacity: 0.7 }
      }
    >
      {label}
    </button>
  );
}

function AddNoteForm({
  dancerId, dancerName, onCreated,
}: {
  dancerId:   string;
  dancerName: string;
  onCreated:  () => Promise<void>;
}) {
  const [open,    setOpen]    = useState(false);
  const [text,    setText]    = useState("");
  const [tag,     setTag]     = useState<NoteTag | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    startTransition(async () => {
      try {
        await createStudentNote(dancerId, text, tag);
        setText("");
        setTag(null);
        setOpen(false);
        await onCreated();
      } catch (err) {
        alert((err as Error).message);
      }
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 pt-3 w-full flex items-center justify-center gap-1.5 text-xs font-medium"
        style={{ color: "var(--admin-sidebar-active)", borderTop: "1px solid var(--admin-border-sub)" }}
      >
        <Plus size={14} /> Add a note about {dancerName}
      </button>
    );
  }

  return (
    <div className="mt-3 pt-3 space-y-2" style={{ borderTop: "1px solid var(--admin-border-sub)" }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Add a note about ${dancerName}…`}
        rows={3}
        autoFocus
        className="w-full rounded-lg px-3 py-2 text-sm resize-none focus:outline-none"
        style={{
          background: "var(--admin-surface-sub)",
          border: "1px solid var(--admin-border-sub)",
          color: "var(--admin-text)",
          fontSize: 16,
        }}
      />
      <div className="flex flex-wrap gap-1.5">
        {NOTE_TAG_OPTIONS.map((t) => (
          <TagPill
            key={t.value}
            tag={t.value}
            label={t.label}
            active={tag === t.value}
            onClick={() => setTag(tag === t.value ? null : t.value)}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={pending || !text.trim()}
          className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
          style={{ background: "var(--admin-sidebar-active)", color: "#fff" }}
        >
          {pending ? "Saving…" : "Save note"}
        </button>
        <button
          onClick={() => { setOpen(false); setText(""); setTag(null); }}
          className="px-3 py-1.5 rounded-lg text-xs"
          style={{ color: "var(--admin-text-muted)" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* All-classes class row                                                       */
/* -------------------------------------------------------------------------- */

function ClassRow({ cls, isLast }: { cls: MyClassWithDancer; isLast: boolean }) {
  const marked = cls.attendance.present + cls.attendance.absent + cls.attendance.tardy + cls.attendance.excused;
  const pct = marked > 0
    ? Math.round(((cls.attendance.present + cls.attendance.tardy + cls.attendance.excused) / marked) * 100)
    : null;
  const pctColor = pct === null ? "var(--admin-text-faint)"
    : pct >= 90 ? "#3B6D11"
    : pct >= 75 ? "#854F0B"
    : "#A32D2D";

  return (
    <Link
      href={`/instructor/classes/${cls.sessionId}`}
      className="flex items-center gap-3 py-3"
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--admin-border-sub)",
        textDecoration: "none",
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium" style={{ color: "var(--admin-text)" }}>
            {cls.className}
          </span>
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={
              cls.isCurrent
                ? { background: "#FBEAF0", color: "#993556" }
                : { background: "var(--admin-surface-sub)", color: "var(--admin-text-muted)", opacity: 0.7 }
            }
          >
            {cls.isCurrent ? "Current" : "Past"}
          </span>
        </div>
        <div className="text-xs mt-0.5" style={{ color: "var(--admin-text-muted)" }}>
          {formatDay(cls.dayOfWeek)}s · {cls.semesterName} · {marked} of {cls.attendance.total} sessions
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold" style={{ color: pctColor }}>
          {pct !== null ? `${pct}%` : "—"}
        </div>
        <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--admin-text-faint)" }}>
          attendance
        </div>
      </div>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Add contact modal                                                           */
/* -------------------------------------------------------------------------- */

function AddContactModal({
  familyId, onClose, onCreated,
}: {
  familyId:  string;
  onClose:   () => void;
  onCreated: () => void;
}) {
  const [type,         setType]         = useState<FamilyContactType>("emergency_contact");
  const [firstName,    setFirstName]    = useState("");
  const [lastName,     setLastName]     = useState("");
  const [phone,        setPhone]        = useState("");
  const [email,        setEmail]        = useState("");
  const [relationship, setRelationship] = useState("");
  const [pending,      startTransition] = useTransition();

  const handleSubmit = () => {
    if (!firstName.trim()) {
      alert("First name is required.");
      return;
    }
    startTransition(async () => {
      try {
        await createFamilyContact({
          familyId,
          type,
          firstName: firstName.trim(),
          lastName:  lastName.trim() || null,
          phone:     phone.trim()    || null,
          email:     email.trim()    || null,
          relationship: relationship.trim() || null,
        });
        onCreated();
      } catch (err) {
        alert((err as Error).message);
      }
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div
        className="fixed z-50 inset-x-0 bottom-0 rounded-t-[20px] overflow-y-auto md:inset-auto md:top-1/2 md:left-1/2 md:w-full md:max-w-sm md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[20px]"
        style={{
          background: "var(--admin-surface)",
          boxShadow: "0 -4px 40px rgba(0,0,0,0.18)",
          maxHeight: "90vh",
        }}
      >
        <div className="px-5 py-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-semibold" style={{ color: "var(--admin-text)" }}>
              Add contact
            </h2>
            <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: "var(--admin-text-faint)" }}>
              <X size={18} />
            </button>
          </div>
          <div className="space-y-3">
            <label className="block text-xs font-medium" style={{ color: "var(--admin-text-muted)" }}>
              Type
              <select
                value={type}
                onChange={(e) => setType(e.target.value as FamilyContactType)}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
                style={{
                  background: "var(--admin-surface-sub)",
                  border: "1px solid var(--admin-border-sub)",
                  color: "var(--admin-text)",
                  fontSize: 16,
                }}
              >
                <option value="emergency_contact">Emergency contact</option>
                <option value="alternate_parent">Alternate parent</option>
                <option value="caregiver">Caregiver</option>
              </select>
            </label>
            <Field label="First name" value={firstName} onChange={setFirstName} required />
            <Field label="Last name"  value={lastName}  onChange={setLastName} />
            <Field label="Relationship (e.g. Grandmother)" value={relationship} onChange={setRelationship} />
            <Field label="Phone" value={phone} onChange={setPhone} type="tel" />
            <Field label="Email" value={email} onChange={setEmail} type="email" />
          </div>
          <div className="flex gap-2 mt-5">
            <button
              onClick={handleSubmit}
              disabled={pending}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ background: "var(--admin-sidebar-active)", color: "#fff", minHeight: 44 }}
            >
              {pending ? "Saving…" : "Save contact"}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-sm"
              style={{ color: "var(--admin-text-muted)", minHeight: 44 }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Field({
  label, value, onChange, required, type = "text",
}: {
  label:    string;
  value:    string;
  onChange: (v: string) => void;
  required?: boolean;
  type?:    string;
}) {
  return (
    <label className="block text-xs font-medium" style={{ color: "var(--admin-text-muted)" }}>
      {label}{required && <span style={{ color: "#A32D2D" }}> *</span>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
        style={{
          background: "var(--admin-surface-sub)",
          border: "1px solid var(--admin-border-sub)",
          color: "var(--admin-text)",
          fontSize: 16,
        }}
      />
    </label>
  );
}

// keep formatTime / formatDiscipline imports in scope (used elsewhere)
void formatTime;
void formatDiscipline;
