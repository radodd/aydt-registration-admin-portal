"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import type { FamilyDetail, FamilyDetailParent, FamilyDetailDancer, FocusTarget } from "@/types";
import { ParentCard } from "../../_components/ParentCard";
import { ParentFormModal } from "../../_components/ParentFormModal";
import { DancerFormModal } from "../../_components/DancerFormModal";
import { ConfirmModal } from "../../_components/ConfirmModal";
import { ParentDetailPanel } from "./ParentDetailPanel";
import { DancerDetailPanel } from "./DancerDetailPanel";
import { DancerCard } from "./DancerCard";
import { BillingHistorySection } from "./BillingHistorySection";
import { addParent, type AddParentInput } from "../../actions/addParent";
import { updateParent, type UpdateParentInput } from "../../actions/updateParent";
import { removeParent } from "../../actions/removeParent";
import { setPrimaryParent } from "../../actions/setPrimaryParent";
import { addDancer, type AddDancerInput } from "../../actions/addDancer";
import { updateDancer, type UpdateDancerInput } from "../../actions/updateDancer";
import { removeDancer } from "../../actions/removeDancer";
import { issueAccountCredit } from "@/app/admin/credits/actions/issueAccountCredit";
import { sendFamilyEmail } from "../../actions/sendFamilyEmail";

/* -------------------------------------------------------------------------- */
/* Modal state union                                                           */
/* -------------------------------------------------------------------------- */

type ModalState =
  | { type: "addParent" }
  | { type: "editParent"; parent: FamilyDetailParent }
  | { type: "removeParent"; userId: string; name: string }
  | { type: "addDancer" }
  | { type: "editDancer"; dancer: FamilyDetailDancer }
  | { type: "removeDancer"; dancer: FamilyDetailDancer }
  | { type: "issueCredit" }
  | { type: "composeEmail" }
  | null;

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export function FamilyDetailClient({
  family,
  initialFocus,
}: {
  family: FamilyDetail;
  initialFocus: FocusTarget;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [focus, setFocus] = useState<FocusTarget>(initialFocus);
  const [modal, setModal] = useState<ModalState>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Compose email form state
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState("");

  // Issue credit form state
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const [creditError, setCreditError] = useState("");
  const [creditSubmitting, setCreditSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  /* ── Helpers ─────────────────────────────────────────────────────────── */

  function changeFocus(target: FocusTarget) {
    setFocus(target);
    const param =
      target.type === "parent" ? `parent:${target.id}` : `dancer:${target.id}`;
    router.replace(`${pathname}?focus=${param}`, { scroll: false });
  }

  function closeModal() {
    setModal(null);
    setModalError(null);
  }

  function refresh() {
    router.refresh();
  }

  const run = (fn: () => Promise<void>) => {
    startTransition(async () => {
      try {
        setModalError(null);
        await fn();
      } catch (e: unknown) {
        setModalError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  };

  /* ── Parent handlers ─────────────────────────────────────────────────── */

  const handleAddParent = (input: AddParentInput) =>
    run(async () => {
      await addParent(input);
      refresh();
      closeModal();
    });

  const handleUpdateParent = (input: UpdateParentInput) =>
    run(async () => {
      await updateParent(input);
      refresh();
      closeModal();
    });

  const handleRemoveParent = (userId: string) =>
    run(async () => {
      await removeParent(userId);
      refresh();
      closeModal();
    });

  const handleSetPrimary = (userId: string) =>
    run(async () => {
      await setPrimaryParent(family.id, userId);
      refresh();
    });

  /* ── Dancer handlers ─────────────────────────────────────────────────── */

  const handleAddDancer = (input: AddDancerInput) =>
    run(async () => {
      await addDancer(input);
      refresh();
      closeModal();
    });

  const handleUpdateDancer = (input: UpdateDancerInput) =>
    run(async () => {
      await updateDancer(input);
      refresh();
      closeModal();
    });

  const handleRemoveDancer = (dancerId: string) =>
    run(async () => {
      const result = await removeDancer(dancerId);
      if (!result.ok) {
        setModalError(result.reason);
        return;
      }
      refresh();
      closeModal();
    });

  /* ── Credit handler ──────────────────────────────────────────────────── */

  async function handleIssueCredit() {
    const amount = parseFloat(creditAmount);
    if (isNaN(amount) || amount <= 0) {
      setCreditError("Please enter a valid amount greater than $0.");
      return;
    }
    setCreditSubmitting(true);
    setCreditError("");
    const result = await issueAccountCredit({
      familyId: family.id,
      amount,
      reason: creditReason || undefined,
    });
    setCreditSubmitting(false);
    if (result.error) {
      setCreditError(result.error);
      return;
    }
    const fmt$ = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
    setToast(`Credit of ${fmt$(amount)} issued to ${family.family_name}.`);
    setTimeout(() => setToast(null), 5000);
    setCreditAmount("");
    setCreditReason("");
    setCreditError("");
    setModal(null);
    refresh();
  }

  /* ── Email handler ───────────────────────────────────────────────────── */

  const primaryParentEmail = family.users.find((u) => u.is_primary_parent)?.email ?? "";

  async function handleSendEmail() {
    setEmailSending(true);
    setEmailError("");
    const result = await sendFamilyEmail({
      to: primaryParentEmail,
      subject: emailSubject,
      body: emailBody,
    });
    setEmailSending(false);
    if (result.error) {
      setEmailError(result.error);
      return;
    }
    setToast(`Email sent to ${primaryParentEmail}.`);
    setTimeout(() => setToast(null), 5000);
    setEmailSubject("");
    setEmailBody("");
    setEmailError("");
    setModal(null);
  }

  /* ── Derived data ────────────────────────────────────────────────────── */

  const focusedParent =
    focus.type === "parent"
      ? family.users.find((u) => u.id === focus.id) ?? null
      : null;

  const focusedDancer =
    focus.type === "dancer"
      ? family.dancers.find((d) => d.id === focus.id) ?? null
      : null;

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <main className="flex-1 overflow-y-auto px-8 py-8 space-y-6">

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-green-700 text-white text-sm px-4 py-3 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* Breadcrumb */}
      <nav className="text-sm text-neutral-500 flex items-center gap-1.5">
        <Link href="/admin/families" className="hover:text-neutral-700">
          Families
        </Link>
        <span>/</span>
        <span className="text-neutral-800 font-medium">{family.family_name}</span>
      </nav>

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{family.family_name}</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {family.users.length} parent{family.users.length !== 1 ? "s" : ""} ·{" "}
            {family.dancers.length} dancer{family.dancers.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button className="px-3 py-1.5 text-sm font-medium border border-neutral-200 rounded-xl text-neutral-700 hover:bg-neutral-50 transition-colors">
            Download statement
          </button>
          <button
            onClick={() => { setEmailSubject(""); setEmailBody(""); setEmailError(""); setModal({ type: "composeEmail" }); }}
            className="px-3 py-1.5 text-sm font-medium border border-neutral-200 rounded-xl text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            Send email
          </button>
          <button className="px-3 py-1.5 text-sm font-medium border border-neutral-200 rounded-xl text-neutral-700 hover:bg-neutral-50 transition-colors">
            Make payment
          </button>
          <Link
            href={`/admin/register?family=${family.id}`}
            className="px-3 py-1.5 text-sm font-medium bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors"
          >
            + Register dancer
          </Link>
        </div>
      </div>

      {/* Two-column cards: Parents left, Dancers right */}
      <div className="grid grid-cols-2 gap-6">

        {/* Parents & Guardians */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
              Parents &amp; Guardians
            </h2>
            <button
              onClick={() => setModal({ type: "addParent" })}
              className="text-xs text-primary-600 font-medium hover:underline"
            >
              + Add parent
            </button>
          </div>
          <div className="space-y-2">
            {family.users.map((parent) => (
              <ParentCard
                key={parent.id}
                parent={parent}
                isSelected={focus.type === "parent" && focus.id === parent.id}
                onClick={() => changeFocus({ type: "parent", id: parent.id })}
                onEdit={() => setModal({ type: "editParent", parent })}
                onMakePrimary={
                  !parent.is_primary_parent
                    ? () => handleSetPrimary(parent.id)
                    : undefined
                }
                onRemove={
                  !parent.is_primary_parent
                    ? () =>
                        setModal({
                          type: "removeParent",
                          userId: parent.id,
                          name: `${parent.first_name} ${parent.last_name}`,
                        })
                    : undefined
                }
                isPending={isPending}
              />
            ))}
          </div>
        </section>

        {/* Dancers */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
              Dancers
            </h2>
            <button
              onClick={() => setModal({ type: "addDancer" })}
              className="text-xs text-primary-600 font-medium hover:underline"
            >
              + Add dancer
            </button>
          </div>
          {family.dancers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-sm text-neutral-400 text-center">
              No dancers added yet.
            </div>
          ) : (
            <div className="space-y-2">
              {family.dancers.map((dancer) => (
                <DancerCard
                  key={dancer.id}
                  dancer={dancer}
                  isSelected={focus.type === "dancer" && focus.id === dancer.id}
                  onClick={() => changeFocus({ type: "dancer", id: dancer.id })}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Detail panel — full width below the two-column section */}
      {focusedParent && (
        <ParentDetailPanel
          parent={focusedParent}
          family={family}
          onEdit={() => setModal({ type: "editParent", parent: focusedParent })}
          onIssueCredit={() => setModal({ type: "issueCredit" })}
        />
      )}
      {focusedDancer && (
        <DancerDetailPanel
          dancer={focusedDancer}
          onEdit={() => setModal({ type: "editDancer", dancer: focusedDancer })}
          onRemove={() => setModal({ type: "removeDancer", dancer: focusedDancer })}
        />
      )}

      {/* Registration & Billing History */}
      <BillingHistorySection family={family} />

      {/* ── Modals ────────────────────────────────────────────────────────── */}

      {/* Issue Credit */}
      {modal?.type === "issueCredit" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">
                Issue account credit — {family.family_name}
              </h2>
              <button
                onClick={closeModal}
                className="text-neutral-400 hover:text-neutral-600 text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Amount <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={creditAmount}
                    onChange={(e) => {
                      setCreditAmount(e.target.value);
                      setCreditError("");
                    }}
                    className="w-full pl-7 pr-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
                    autoFocus
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Reason{" "}
                  <span className="text-neutral-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Class cancellation refund"
                  value={creditReason}
                  onChange={(e) => setCreditReason(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
                />
              </div>
              {creditError && <p className="text-sm text-red-600">{creditError}</p>}
            </div>
            <div className="flex gap-3">
              <button
                onClick={closeModal}
                disabled={creditSubmitting}
                className="flex-1 rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleIssueCredit}
                disabled={creditSubmitting || !creditAmount}
                className="flex-1 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {creditSubmitting ? "Issuing…" : "Issue credit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compose Email */}
      {modal?.type === "composeEmail" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">Send email</h2>
              <button
                onClick={closeModal}
                className="text-neutral-400 hover:text-neutral-600 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              {/* To (read-only) */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">To</label>
                <div className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl bg-neutral-50 text-neutral-500">
                  {primaryParentEmail}
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Subject <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => { setEmailSubject(e.target.value); setEmailError(""); }}
                  placeholder="e.g. Upcoming class schedule"
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-600"
                  autoFocus
                />
              </div>

              {/* Message */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Message <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={emailBody}
                  onChange={(e) => { setEmailBody(e.target.value); setEmailError(""); }}
                  placeholder="Write your message here…"
                  rows={8}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-600 resize-none"
                />
              </div>

              {emailError && <p className="text-sm text-red-600">{emailError}</p>}
            </div>

            <div className="flex gap-3">
              <button
                onClick={closeModal}
                disabled={emailSending}
                className="flex-1 rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSendEmail}
                disabled={emailSending || !emailSubject.trim() || !emailBody.trim()}
                className="flex-1 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {emailSending ? "Sending…" : "Send email"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Parent modals */}
      {(modal?.type === "addParent" || modal?.type === "editParent") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <ParentFormModal
              mode={modal.type === "addParent" ? "add" : "edit"}
              initial={modal.type === "editParent" ? modal.parent : undefined}
              familyId={family.id}
              onAdd={handleAddParent}
              onUpdate={handleUpdateParent}
              onClose={closeModal}
              error={modalError}
              isPending={isPending}
            />
          </div>
        </div>
      )}

      {modal?.type === "removeParent" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <ConfirmModal
              title="Remove Parent"
              message={`Are you sure you want to remove ${modal.name} from this family?`}
              confirmLabel="Remove"
              destructive
              onConfirm={() => handleRemoveParent(modal.userId)}
              onClose={closeModal}
              error={modalError}
              isPending={isPending}
            />
          </div>
        </div>
      )}

      {/* Dancer modals */}
      {(modal?.type === "addDancer" || modal?.type === "editDancer") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <DancerFormModal
              mode={modal.type === "addDancer" ? "add" : "edit"}
              initial={modal.type === "editDancer" ? modal.dancer : undefined}
              familyId={modal.type === "addDancer" ? family.id : undefined}
              onAdd={handleAddDancer}
              onUpdate={handleUpdateDancer}
              onClose={closeModal}
              error={modalError}
              isPending={isPending}
            />
          </div>
        </div>
      )}

      {modal?.type === "removeDancer" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <ConfirmModal
              title="Remove Dancer"
              message={`Are you sure you want to remove ${modal.dancer.first_name} ${modal.dancer.last_name}?`}
              confirmLabel="Remove"
              destructive
              onConfirm={() => handleRemoveDancer(modal.dancer.id)}
              onClose={closeModal}
              error={modalError}
              isPending={isPending}
            />
          </div>
        </div>
      )}
    </main>
  );
}
