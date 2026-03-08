"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EmailTab,
  EmailListRow,
  EmailAnalyticsRow,
  TemplateListRow,
  SubscriptionListRow,
  EmailSubscriber,
  PaginatedResult,
} from "@/types";
import { EmailStatusBadge } from "./EmailStatusBadge";
import { listEmails, listSentEmails } from "./actions/listEmails";
import { listTemplates, deleteTemplate, cloneTemplateToEmail } from "./actions/listTemplates";
import { listUnsubscribed, listSubscribed } from "./actions/listSubscriptions";
import { listEmailSubscribers } from "./actions/listEmailSubscribers";
import { addEmailSubscriber } from "./actions/addEmailSubscriber";
import { removeEmailSubscriber } from "./actions/removeEmailSubscriber";
import { updateSubscription } from "./actions/updateSubscription";
import { cancelEmail } from "./actions/cancelEmail";
import { revertToDraft } from "./actions/revertToDraft";
import { deleteEmail } from "./actions/deleteEmail";
import { cloneEmail } from "./actions/cloneEmail";
import { createEmailDraft } from "./actions/createEmailDraft";

type Props = {
  isSuperAdmin: boolean;
};

const TABS: { key: EmailTab; label: string }[] = [
  { key: "drafts", label: "Drafts" },
  { key: "scheduled", label: "Scheduled" },
  { key: "sent", label: "Sent" },
  { key: "failed", label: "Failed" },
  { key: "templates", label: "Templates" },
  { key: "unsubscribed", label: "Unsubscribed" },
  { key: "subscribed", label: "Subscribed" },
  { key: "external_subscribers", label: "External Subscribers" },
];

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

export default function EmailsClient({ isSuperAdmin }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<EmailTab>("drafts");
  const [page, setPage] = useState(0);

  const [draftData, setDraftData] = useState<PaginatedResult<EmailListRow> | null>(null);
  const [scheduledData, setScheduledData] = useState<PaginatedResult<EmailListRow> | null>(null);
  const [sentData, setSentData] = useState<PaginatedResult<EmailAnalyticsRow> | null>(null);
  const [failedData, setFailedData] = useState<PaginatedResult<EmailListRow> | null>(null);
  const [templatesData, setTemplatesData] = useState<PaginatedResult<TemplateListRow> | null>(null);
  const [unsubData, setUnsubData] = useState<PaginatedResult<SubscriptionListRow> | null>(null);
  const [subData, setSubData] = useState<PaginatedResult<SubscriptionListRow> | null>(null);
  const [extSubsData, setExtSubsData] = useState<PaginatedResult<EmailSubscriber> | null>(null);

  // External subscriber search
  const [extSubSearch, setExtSubSearch] = useState("");
  const extSubSearchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Add subscriber form state
  const [newSubEmail, setNewSubEmail] = useState("");
  const [newSubName, setNewSubName] = useState("");
  const [newSubPhone, setNewSubPhone] = useState("");
  const [addSubStatus, setAddSubStatus] = useState<"idle" | "loading" | "conflict" | "already_exists" | "error">("idle");
  const [addSubConflictMsg, setAddSubConflictMsg] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchTab = useCallback(
    async (tab: EmailTab, p: number) => {
      setIsLoading(true);
      setActionError(null);
      try {
        switch (tab) {
          case "drafts": {
            const result = await listEmails("draft", p);
            setDraftData(result);
            break;
          }
          case "scheduled": {
            const result = await listEmails("scheduled", p);
            setScheduledData(result);
            break;
          }
          case "sent": {
            const result = await listSentEmails(p);
            setSentData(result);
            break;
          }
          case "failed": {
            const result = await listEmails("failed", p);
            setFailedData(result);
            break;
          }
          case "templates": {
            const result = await listTemplates(p);
            setTemplatesData(result);
            break;
          }
          case "unsubscribed": {
            const result = await listUnsubscribed(p);
            setUnsubData(result);
            break;
          }
          case "subscribed": {
            const result = await listSubscribed(p);
            setSubData(result);
            break;
          }
          case "external_subscribers": {
            const result = await listEmailSubscribers(p, extSubSearch);
            setExtSubsData(result);
            break;
          }
        }
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setIsLoading(false);
      }
    },
    [extSubSearch],
  );

  useEffect(() => {
    fetchTab(activeTab, page);
  }, [activeTab, page, fetchTab]);

  // Debounced search for external subscribers
  useEffect(() => {
    if (activeTab !== "external_subscribers") return;
    if (extSubSearchDebounce.current) clearTimeout(extSubSearchDebounce.current);
    extSubSearchDebounce.current = setTimeout(() => {
      setPage(0);
      fetchTab("external_subscribers", 0);
    }, 400);
    return () => {
      if (extSubSearchDebounce.current) clearTimeout(extSubSearchDebounce.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extSubSearch]);

  function handleTabChange(tab: EmailTab) {
    setActiveTab(tab);
    setPage(0);
  }

  async function handleNewEmail() {
    try {
      const { emailId } = await createEmailDraft();
      router.push(`/admin/emails/${emailId}/edit?step=setup`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to create draft");
    }
  }

  async function handleCancel(emailId: string) {
    if (!confirm("Cancel this scheduled email?")) return;
    try {
      await cancelEmail(emailId);
      fetchTab("scheduled", page);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Cancel failed");
    }
  }

  async function handleRevertToDraft(emailId: string, fromTab: EmailTab) {
    if (!confirm("Revert this email to draft? The scheduled time and recipient snapshot will be cleared.")) return;
    try {
      await revertToDraft(emailId);
      fetchTab(fromTab, page);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Revert failed");
    }
  }

  async function handleDelete(emailId: string) {
    if (!confirm("Delete this draft? This cannot be undone.")) return;
    try {
      await deleteEmail(emailId);
      fetchTab("drafts", page);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function handleClone(emailId: string) {
    try {
      const { emailId: newId } = await cloneEmail(emailId);
      router.push(`/admin/emails/${newId}/edit?step=setup`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Clone failed");
    }
  }

  async function handleDeleteTemplate(templateId: string) {
    if (!confirm("Delete this template?")) return;
    try {
      await deleteTemplate(templateId);
      fetchTab("templates", page);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function handleCloneTemplate(templateId: string) {
    try {
      const { emailId } = await cloneTemplateToEmail(templateId);
      router.push(`/admin/emails/${emailId}/edit?step=setup`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Clone failed");
    }
  }

  async function handleResubscribe(userId: string) {
    try {
      await updateSubscription(userId, true);
      fetchTab("unsubscribed", page);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function handleAddSubscriber(force = false) {
    if (!newSubEmail.trim()) return;
    setAddSubStatus("loading");
    try {
      const result = await addEmailSubscriber(newSubEmail, newSubName, newSubPhone, force);
      if (result.status === "conflict") {
        setAddSubStatus("conflict");
        setAddSubConflictMsg(result.message);
        return;
      }
      if (result.status === "already_exists") {
        setAddSubStatus("already_exists");
        return;
      }
      setNewSubEmail("");
      setNewSubName("");
      setNewSubPhone("");
      setAddSubStatus("idle");
      fetchTab("external_subscribers", page);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to add subscriber");
      setAddSubStatus("error");
    }
  }

  async function handleRemoveSubscriber(id: string) {
    if (!confirm("Remove this subscriber? They will no longer receive emails.")) return;
    try {
      await removeEmailSubscriber(id);
      fetchTab("external_subscribers", page);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Remove failed");
    }
  }

  const totalPages =
    activeTab === "drafts"
      ? draftData?.totalPages
      : activeTab === "scheduled"
        ? scheduledData?.totalPages
        : activeTab === "sent"
          ? sentData?.totalPages
          : activeTab === "failed"
            ? failedData?.totalPages
            : activeTab === "templates"
              ? templatesData?.totalPages
              : activeTab === "unsubscribed"
                ? unsubData?.totalPages
                : activeTab === "subscribed"
                  ? subData?.totalPages
                  : extSubsData?.totalPages;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
              Emails
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Broadcast emails to families and manage subscriptions.
            </p>
          </div>
          <button
            onClick={handleNewEmail}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition"
          >
            + Compose Email
          </button>
        </div>

        {actionError && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {actionError}
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <div className="flex gap-1 -mb-px overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => handleTabChange(t.key)}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === t.key
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <>
            {/* Drafts tab */}
            {activeTab === "drafts" && (
              <EmailListTable
                rows={draftData?.data ?? []}
                emptyLabel="No draft emails."
                columns={["Subject", "Updated", "By", "Actions"]}
                renderRow={(row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium max-w-xs truncate">
                      {row.subject || "(no subject)"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {formatDate(row.updated_at)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {row.updated_by
                        ? `${row.updated_by.first_name} ${row.updated_by.last_name}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-3">
                        <button
                          onClick={() =>
                            router.push(
                              `/admin/emails/${row.id}/edit?step=setup`,
                            )
                          }
                          className="text-indigo-600 hover:text-indigo-700 font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleClone(row.id)}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          Clone
                        </button>
                        <button
                          onClick={() => handleDelete(row.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              />
            )}

            {/* Scheduled tab */}
            {activeTab === "scheduled" && (
              <EmailListTable
                rows={scheduledData?.data ?? []}
                emptyLabel="No scheduled emails."
                columns={["Subject", "Recipients", "Scheduled For", "Actions"]}
                renderRow={(row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium max-w-xs truncate">
                      {row.subject}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {(row.recipient_count as unknown as { count: number }[])?.[0]?.count?.toLocaleString() ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {formatDate(row.scheduled_at)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-3">
                        {isSuperAdmin && (
                          <button
                            onClick={() => handleRevertToDraft(row.id, "scheduled")}
                            className="text-indigo-600 hover:text-indigo-700 font-medium"
                          >
                            Revert to Draft
                          </button>
                        )}
                        {isSuperAdmin && (
                          <button
                            onClick={() => handleCancel(row.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              />
            )}

            {/* Failed tab */}
            {activeTab === "failed" && (
              <EmailListTable
                rows={failedData?.data ?? []}
                emptyLabel="No failed emails."
                columns={["Subject", "Recipients", "Attempted", "Actions"]}
                renderRow={(row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium max-w-xs truncate">
                      {row.subject}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {(row.recipient_count as unknown as { count: number }[])?.[0]?.count?.toLocaleString() ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {formatDate(row.sent_at)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-3">
                        {isSuperAdmin && (
                          <button
                            onClick={() => handleRevertToDraft(row.id, "failed")}
                            className="text-indigo-600 hover:text-indigo-700 font-medium"
                          >
                            Revert to Draft
                          </button>
                        )}
                        <button
                          onClick={() => handleClone(row.id)}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          Clone
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              />
            )}

            {/* Sent tab */}
            {activeTab === "sent" && (
              <EmailListTable
                rows={sentData?.data ?? []}
                emptyLabel="No sent emails."
                columns={[
                  "Subject",
                  "Sent",
                  "Recipients",
                  "Delivered",
                  "Opens",
                  "Clicks",
                  "Actions",
                ]}
                renderRow={(row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium max-w-xs truncate">
                      {row.subject}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {formatDate(row.sent_at)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {row.recipient_count.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {row.delivered_count.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {pct(row.open_rate)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {pct(row.click_rate)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => handleClone(row.id)}
                        className="text-gray-500 hover:text-gray-700 font-medium"
                      >
                        Clone
                      </button>
                    </td>
                  </tr>
                )}
              />
            )}

            {/* Templates tab */}
            {activeTab === "templates" && (
              <EmailListTable
                rows={templatesData?.data ?? []}
                emptyLabel="No templates."
                columns={["Name", "Subject", "Created", "Actions"]}
                renderRow={(row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                      {row.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                      {row.subject}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {formatDate(row.created_at)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleCloneTemplate(row.id)}
                          className="text-indigo-600 hover:text-indigo-700 font-medium"
                        >
                          Use Template
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(row.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              />
            )}

            {/* Unsubscribed tab */}
            {activeTab === "unsubscribed" && (
              <EmailListTable
                rows={unsubData?.data ?? []}
                emptyLabel="No unsubscribed users."
                columns={["Email", "Name", "Unsubscribed", "Actions"]}
                renderRow={(row) => (
                  <tr key={row.user_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {row.users?.email ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {row.users
                        ? `${row.users.first_name} ${row.users.last_name}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {formatDate(row.unsubscribed_at)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {isSuperAdmin && (
                        <button
                          onClick={() => handleResubscribe(row.user_id)}
                          className="text-indigo-600 hover:text-indigo-700 font-medium"
                        >
                          Re-subscribe
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              />
            )}

            {/* Subscribed tab */}
            {activeTab === "subscribed" && (
              <EmailListTable
                rows={subData?.data ?? []}
                emptyLabel="No subscribed users."
                columns={["Email", "Name", "Status"]}
                renderRow={(row) => (
                  <tr key={row.user_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {row.users?.email ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {row.users
                        ? `${row.users.first_name} ${row.users.last_name}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <EmailStatusBadge status="sent" />
                    </td>
                  </tr>
                )}
              />
            )}

            {/* External Subscribers tab */}
            {activeTab === "external_subscribers" && (
              <div className="space-y-6">
                {/* Add subscriber form */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
                  <p className="text-sm font-medium text-gray-700">Add external subscriber</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="text"
                      value={newSubName}
                      onChange={(e) => setNewSubName(e.target.value)}
                      placeholder="Name"
                      className="border border-gray-300 rounded-xl px-3 py-2 text-sm text-slate-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <input
                      type="email"
                      value={newSubEmail}
                      onChange={(e) => {
                        setNewSubEmail(e.target.value);
                        if (addSubStatus !== "idle") setAddSubStatus("idle");
                      }}
                      placeholder="Email address *"
                      className="border border-gray-300 rounded-xl px-3 py-2 text-sm text-slate-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <input
                      type="tel"
                      value={newSubPhone}
                      onChange={(e) => setNewSubPhone(e.target.value)}
                      placeholder="Phone (optional)"
                      className="border border-gray-300 rounded-xl px-3 py-2 text-sm text-slate-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  {addSubStatus === "conflict" && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                      <p className="text-sm text-amber-800">{addSubConflictMsg}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAddSubscriber(true)}
                          className="px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition"
                        >
                          Add anyway
                        </button>
                        <button
                          onClick={() => setAddSubStatus("idle")}
                          className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {addSubStatus === "already_exists" && (
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                      This email is already on the external subscriber list.
                    </p>
                  )}

                  {addSubStatus !== "conflict" && (
                    <button
                      onClick={() => handleAddSubscriber(false)}
                      disabled={!newSubEmail.trim() || addSubStatus === "loading"}
                      className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {addSubStatus === "loading" ? "Adding…" : "Add subscriber"}
                    </button>
                  )}
                </div>

                {/* Search */}
                <div>
                  <input
                    type="text"
                    value={extSubSearch}
                    onChange={(e) => setExtSubSearch(e.target.value)}
                    placeholder="Search by name or email…"
                    className="w-full max-w-sm border border-gray-300 rounded-xl px-3 py-2 text-sm text-slate-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                {/* List */}
                <EmailListTable
                  rows={extSubsData?.data ?? []}
                  emptyLabel="No external subscribers yet."
                  columns={["Email", "Name", "Phone", "Added", "Actions"]}
                  renderRow={(row) => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{row.email}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{row.name ?? "—"}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{row.phone ?? "—"}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                        {formatDate(row.created_at)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <button
                          onClick={() => handleRemoveSubscriber(row.id)}
                          className="text-red-500 hover:text-red-700 font-medium"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  )}
                />
              </div>
            )}

            {/* Pagination */}
            {(totalPages ?? 0) > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-4 py-2 rounded-xl border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-500">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  onClick={() =>
                    setPage((p) => Math.min((totalPages ?? 1) - 1, p + 1))
                  }
                  disabled={page >= (totalPages ?? 1) - 1}
                  className="px-4 py-2 rounded-xl border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Reusable table shell                                                        */
/* -------------------------------------------------------------------------- */

function EmailListTable<T>({
  rows,
  columns,
  renderRow,
  emptyLabel,
}: {
  rows: T[];
  columns: string[];
  renderRow: (row: T) => React.ReactNode;
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-gray-300 rounded-xl p-10 text-center">
        <p className="text-sm text-gray-400">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.map(renderRow)}
        </tbody>
      </table>
    </div>
  );
}
