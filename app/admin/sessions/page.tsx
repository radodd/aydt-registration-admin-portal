"use client";

import { useEffect, useState } from "react";
import ListSessions from "./(components)/ListSessions";
import CreateSession from "./(components)/CreateSession";
import { getSessions } from "@/queries/admin";
import { Session } from "@/types";

export default function AdminSessionsPage() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const data = await getSessions();
      setSessions(data);
      setLoading(false);
    })();
  }, []);

  return (
    <main className="max-w-7xl mx-auto px-6 py-10 space-y-10">
      {/* ============================================================
          Header
      ============================================================ */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">
            Manage Sessions
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Create and manage class offerings.
          </p>
        </div>

        <button
          onClick={() => setShowForm((prev) => !prev)}
          className={`inline-flex items-center px-5 py-2.5 rounded-2xl text-sm font-medium transition ${
            showForm
              ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
              : "bg-indigo-600 text-white hover:bg-indigo-700"
          }`}
        >
          {showForm ? "Cancel" : "+ Add Session"}
        </button>
      </header>

      {/* ============================================================
          Create Form
      ============================================================ */}
      {showForm && (
        <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
          <CreateSession
            onSuccess={() => {
              setShowForm(false);
            }}
          />
        </section>
      )}

      {/* ============================================================
          Sessions List
      ============================================================ */}
      <section className="space-y-4">
        {loading ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 text-gray-500">
            Loading sessions...
          </div>
        ) : sessions && sessions.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-10 text-center text-gray-500">
            No sessions have been created yet.
          </div>
        ) : (
          <ListSessions sessions={sessions || []} setSessions={setSessions} />
        )}
      </section>
    </main>
  );
}
