"use client";

import { useEffect, useState } from "react";
import type { PublicSemester } from "@/types/public";
import { subscribeForNotification } from "@/app/(user-facing)/semester/actions/subscribeForNotification";

interface Props {
  semester: PublicSemester;
  onOpen: () => void;
}

/* -------------------------------------------------------------------------- */
/* Countdown logic                                                             */
/* -------------------------------------------------------------------------- */

function getSecondsRemaining(openAt: Date): number {
  return Math.max(0, Math.floor((openAt.getTime() - Date.now()) / 1000));
}

function formatCountdown(totalSeconds: number): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
} {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/* -------------------------------------------------------------------------- */
/* ICS generation                                                             */
/* -------------------------------------------------------------------------- */

function downloadIcs(semesterName: string, openAt: Date) {
  function toIcsDate(d: Date): string {
    return d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  }

  const start = toIcsDate(openAt);
  // 1-hour event
  const end = toIcsDate(new Date(openAt.getTime() + 60 * 60 * 1000));
  const now = toIcsDate(new Date());

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AYDT//Registration//EN",
    "BEGIN:VEVENT",
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:Registration Opens — ${semesterName}`,
    `DESCRIPTION:Registration is now open for ${semesterName}. Visit the registration page to enroll.`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${semesterName.replace(/\s+/g, "-")}-registration.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export function PreRegistrationLanding({ semester, onOpen }: Props) {
  const openAt = semester.registrationOpenAt
    ? new Date(semester.registrationOpenAt)
    : null;

  // Start at 0 to match server render (avoids Date.now() hydration mismatch).
  // The useEffect tick below sets the real value immediately on mount.
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Notify-me form state
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [notifyState, setNotifyState] = useState<
    "idle" | "submitting" | "done" | "already" | "error"
  >("idle");

  /* Countdown ticker */
  useEffect(() => {
    if (!openAt) return;

    // Don't call onOpen() on the very first tick — only from subsequent
    // interval ticks. This prevents an immediate swap if openAt is in the
    // past when the component mounts (edge case: server/client time skew).
    let mounted = false;

    const tick = () => {
      const remaining = getSecondsRemaining(openAt);
      console.log("[PreRegistrationLanding] tick", { remaining, mounted, clientNow: new Date().toISOString(), openAt: openAt.toISOString() });
      setSecondsLeft(remaining);
      if (remaining === 0 && mounted) {
        console.log("[PreRegistrationLanding] countdown reached 0 → calling onOpen()");
        onOpen();
      }
      mounted = true;
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Unique disciplines for preview pills */
  const disciplines = [
    ...new Set(
      semester.sessions
        .map((s) => s.discipline)
        .filter((d): d is string => Boolean(d))
        .map((d) => d.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())),
    ),
  ].slice(0, 10);

  /* Formatted open date */
  const formattedOpen = openAt
    ? openAt.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }) +
      " at " +
      openAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : null;

  const { days, hours, minutes, seconds } = formatCountdown(secondsLeft);

  async function handleNotifySubmit(e: React.FormEvent) {
    e.preventDefault();
    setNotifyState("submitting");
    try {
      const result = await subscribeForNotification({ email, name });
      if (!result.success) {
        setNotifyState("error");
        return;
      }
      setNotifyState(result.alreadySubscribed ? "already" : "done");
    } catch {
      setNotifyState("error");
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-16 space-y-12">
      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="text-center space-y-3">
        <p className="text-sm font-medium text-indigo-600 uppercase tracking-widest">
          Coming Soon
        </p>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900">
          {semester.name}
        </h1>
        {formattedOpen && (
          <p className="text-lg text-gray-500">
            Registration opens{" "}
            <span className="text-gray-800 font-semibold">{formattedOpen}</span>
          </p>
        )}
        {semester.description && (
          <p className="text-gray-500 max-w-xl mx-auto leading-relaxed">
            {semester.description}
          </p>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Countdown                                                           */}
      {/* ------------------------------------------------------------------ */}
      {openAt && secondsLeft > 0 && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-8">
          <p className="text-center text-sm font-medium text-indigo-500 mb-6 uppercase tracking-widest">
            Registration opens in
          </p>
          <div className="grid grid-cols-4 gap-4 text-center">
            {[
              { label: "Days", value: days },
              { label: "Hours", value: hours },
              { label: "Minutes", value: minutes },
              { label: "Seconds", value: seconds },
            ].map(({ label, value }) => (
              <div key={label} className="space-y-1">
                <div className="text-4xl sm:text-5xl font-bold text-indigo-700 tabular-nums">
                  {pad(value)}
                </div>
                <div className="text-xs text-indigo-400 uppercase tracking-wider">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Class preview                                                       */}
      {/* ------------------------------------------------------------------ */}
      {disciplines.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 text-center">
            Classes being offered
          </h2>
          <div className="flex flex-wrap justify-center gap-2">
            {disciplines.map((d) => (
              <span
                key={d}
                className="inline-block bg-white border border-gray-200 text-gray-700 text-sm font-medium px-4 py-1.5 rounded-full shadow-sm"
              >
                {d}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Notify-me                                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Get notified when registration opens
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            We&apos;ll send you a reminder as soon as enrollment is available.
          </p>
        </div>

        {notifyState === "done" && (
          <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
            You&apos;re on the list! We&apos;ll email you when registration opens.
          </div>
        )}

        {notifyState === "already" && (
          <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
            You&apos;re already subscribed. We&apos;ll be in touch!
          </div>
        )}

        {notifyState === "error" && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            Something went wrong. Please try again.
          </div>
        )}

        {notifyState !== "done" && notifyState !== "already" && (
          <form onSubmit={handleNotifySubmit} className="space-y-3">
            <input
              type="text"
              placeholder="Your name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
            />
            <div className="flex gap-3">
              <input
                type="email"
                placeholder="you@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
              />
              <button
                type="submit"
                disabled={notifyState === "submitting"}
                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition disabled:opacity-60 whitespace-nowrap"
              >
                {notifyState === "submitting" ? "Saving…" : "Notify me"}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Add to calendar                                                     */}
      {/* ------------------------------------------------------------------ */}
      {openAt && (
        <div className="text-center">
          <button
            onClick={() => downloadIcs(semester.name, openAt)}
            className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition"
          >
            <CalendarIcon />
            Add to calendar
          </button>
        </div>
      )}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}
