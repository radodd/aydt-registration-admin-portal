"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Users,
  TrendingUp,
  Clock,
  CalendarDays,
  FileText,
  BarChart2,
  UserPlus,
  Settings,
} from "lucide-react";
import CopyLinkButton from "./CopyLinkButton";

const RegistrationTrendChart = dynamic(
  () => import("./RegistrationTrendChart"),
  { ssr: false }
);

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

type RecentReg = {
  id: string;
  created_at: string;
  dancers:
    | { id: string; first_name: string; last_name: string; birth_date: string | null; gender: string | null }
    | { id: string; first_name: string; last_name: string; birth_date: string | null; gender: string | null }[]
    | null;
  class_sessions:
    | { classes: { name: string } | null }
    | { classes: { name: string } | null }[]
    | null;
};

type TrendPoint = { month: string; count: number };

type Props = {
  semesterId: string;
  recentRegistrations: RecentReg[];
  participantCount: number;
  spotsFilledCount: number;
  waitlistCount: number;
  collected: number;
  outstanding: number;
  totalRevenue: number;
  trendData: TrendPoint[];
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function fmt$$(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function calcAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function single<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="flex items-start gap-3 p-4 bg-white border border-gray-200 rounded-xl">
      <div className="p-2 bg-blue-50 rounded-lg mt-0.5">
        <Icon className="w-4 h-4 text-blue-500" />
      </div>
      <div>
        <p className="text-xs text-slate-500 mb-0.5">{label}</p>
        <p className="text-2xl font-semibold text-slate-800 leading-none">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main Component                                                              */
/* -------------------------------------------------------------------------- */

export default function SemesterDashboard({
  semesterId,
  recentRegistrations,
  participantCount,
  spotsFilledCount,
  waitlistCount,
  collected,
  outstanding,
  totalRevenue,
  trendData,
}: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-6 items-start">
      {/* ------------------------------------------------------------------ */}
      {/* Main column                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-6">

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Participants"
            value={participantCount}
            sub="unique dancers"
            icon={Users}
          />
          <StatCard
            label="Spots Filled"
            value={spotsFilledCount}
            sub="total enrollments"
            icon={CalendarDays}
          />
          <StatCard
            label="Waitlist"
            value={waitlistCount}
            sub="pending spots"
            icon={Clock}
          />
          <StatCard
            label="Total Revenue"
            value={fmt$$(totalRevenue)}
            sub={`${fmt$$(outstanding)} outstanding`}
            icon={TrendingUp}
          />
        </div>

        {/* Revenue breakdown */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Revenue</h2>
          <div className="grid grid-cols-3 divide-x divide-gray-100">
            <div className="pr-6">
              <p className="text-xs text-slate-500 mb-1">Collected</p>
              <p className="text-xl font-semibold text-green-600">{fmt$$(collected)}</p>
            </div>
            <div className="px-6">
              <p className="text-xs text-slate-500 mb-1">Outstanding</p>
              <p className="text-xl font-semibold text-amber-600">{fmt$$(outstanding)}</p>
            </div>
            <div className="pl-6">
              <p className="text-xs text-slate-500 mb-1">Total</p>
              <p className="text-xl font-semibold text-slate-800">{fmt$$(totalRevenue)}</p>
            </div>
          </div>
        </div>

        {/* Recent registrations */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-slate-700">Recent Registrations</h2>
          </div>

          {recentRegistrations.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-400 text-center">
              No registrations yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-5 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">Time</th>
                    <th className="px-5 py-3 text-xs font-medium text-slate-500">Participant</th>
                    <th className="px-5 py-3 text-xs font-medium text-slate-500">Age</th>
                    <th className="px-5 py-3 text-xs font-medium text-slate-500">Gender</th>
                    <th className="px-5 py-3 text-xs font-medium text-slate-500">Class</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recentRegistrations.map((reg) => {
                    const dancer = single(reg.dancers);
                    const cs = single(reg.class_sessions);
                    const cls = cs ? single(cs.classes) : null;
                    const age = dancer ? calcAge(dancer.birth_date) : null;

                    return (
                      <tr key={reg.id} className="hover:bg-slate-50/50 transition">
                        <td className="px-5 py-3 text-xs text-slate-400 whitespace-nowrap">
                          {fmtDateTime(reg.created_at)}
                        </td>
                        <td className="px-5 py-3 font-medium whitespace-nowrap">
                          {dancer ? (
                            <Link
                              href={`/admin/dancers/${dancer.id}`}
                              className="text-blue-600 hover:underline"
                            >
                              {dancer.first_name} {dancer.last_name}
                            </Link>
                          ) : "—"}
                        </td>
                        <td className="px-5 py-3 text-slate-500">
                          {age !== null ? age : "—"}
                        </td>
                        <td className="px-5 py-3 text-slate-500 capitalize">
                          {dancer?.gender ?? "—"}
                        </td>
                        <td className="px-5 py-3 text-slate-500">
                          {cls?.name ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Registrations over time */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">
            Registrations Over Time
          </h2>
          <RegistrationTrendChart data={trendData} />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Sidebar — Quick actions                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-1">
        <p className="px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Actions
        </p>

        <Link
          href={`/admin/register?semester=${semesterId}`}
          className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-slate-50 transition text-slate-600"
        >
          <UserPlus className="w-4 h-4 text-slate-400 shrink-0" />
          Register someone
        </Link>

        <Link
          href={`/admin/semesters/${semesterId}/edit`}
          className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-slate-50 transition text-slate-600"
        >
          <Settings className="w-4 h-4 text-slate-400 shrink-0" />
          Edit setup
        </Link>

        <Link
          href={`/admin/sessions`}
          className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-slate-50 transition text-slate-600"
        >
          <BarChart2 className="w-4 h-4 text-slate-400 shrink-0" />
          Session capacity
        </Link>

        <Link
          href={`/admin/payments`}
          className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-slate-50 transition text-slate-600"
        >
          <FileText className="w-4 h-4 text-slate-400 shrink-0" />
          Payment dashboard
        </Link>

        <CopyLinkButton semesterId={semesterId} />
      </div>
    </div>
  );
}
