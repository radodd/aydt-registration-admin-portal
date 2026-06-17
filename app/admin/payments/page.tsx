"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { markInstallmentPaid } from "./actions/markInstallmentPaid";
import { waiveInstallment } from "./actions/waiveInstallment";
import { sendPaymentReminder } from "./actions/sendPaymentReminder";
import { issueAccountCredit } from "@/app/admin/credits/actions/issueAccountCredit";
import { PaymentErrorLog } from "./PaymentErrorLog";
import { useToast } from "@/app/components/Toast";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

type InstallmentRow = {
  id: string;
  installment_number: number;
  amount_due: number;
  due_date: string;
  status: "scheduled" | "paid" | "overdue" | "waived" | "processing";
  paid_at: string | null;
  paid_amount: number | null;
};

type PaymentRow = {
  id: string;
  transaction_id: string | null;
  state: string;
  event_type: string | null;
  amount: number;
  currency: string;
  updated_at: string;
  raw_transaction: Record<string, unknown> | null;
};

type RefundHistoryRow = {
  id: string;
  type: "void" | "refund";
  amount: number | null;
  reason: string;
  status: "pending" | "succeeded" | "failed";
  failure_reason: string | null;
  epg_transaction_id: string | null;
  created_at: string;
  initiated_by_name?: string | null;
  line_items: Array<{ registrationId: string; className: string; amount: number }> | null;
};

type BatchRegistration = {
  class_meetings: {
    location: string | null;
    classes: { name: string } | null;
  } | null;
};

type BatchRow = {
  id: string;
  family_id: string | null;
  grand_total: number | null;
  tuition_total: number | null;
  registration_fee_total: number | null;
  family_discount_amount: number;
  auto_pay_admin_fee_total: number;
  payment_plan_type: string | null;
  amount_due_now: number | null;
  status: string;
  created_at: string;
  confirmed_at: string | null;
  users: { id: string; first_name: string; last_name: string; email: string; phone_number: string | null } | null;
  semesters: { name: string } | null;
  order_payment_installments: InstallmentRow[];
  payments: PaymentRow[];
  registrations: BatchRegistration[];
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function typeDotColor(type: string): string {
  const m: Record<string, string> = {
    class: "#0A5A50",
    fee: "#20503A",
    discount: "#0A5A50",
    merch: "#5A2878",
  };
  return m[type] ?? "#9E9890";
}

const BATCH_STATUS_BADGE: Record<string, string> = {
  pending_payment: "bg-mauve/20 text-mauve-text",
  confirmed: "bg-mint/20 text-mint-text",
  failed: "bg-pale-rose/30 text-pale-rose-text",
  refunded: "bg-neutral-100 text-neutral-600",
  partial: "bg-lavender/20 text-lavender-text",
};

const BATCH_STATUS_LABEL: Record<string, string> = {
  pending_payment: "Pending",
  confirmed: "Confirmed",
  failed: "Failed",
  refunded: "Refunded",
  partial: "Partial",
};

const INSTALLMENT_BADGE: Record<string, string> = {
  scheduled: "bg-neutral-100 text-neutral-600",
  paid: "bg-mint/20 text-mint-text",
  overdue: "bg-pale-rose/30 text-pale-rose-text",
  waived: "bg-lavender/20 text-lavender-text",
  processing: "bg-mauve/20 text-mauve-text",
};

const EPG_STATE_BADGE: Record<string, string> = {
  pending_authorization: "bg-mauve/20 text-mauve-text",
  authorized: "bg-lavender/20 text-lavender-text",
  captured: "bg-mint/20 text-mint-text",
  settled: "bg-mint/20 text-mint-text",
  declined: "bg-pale-rose/30 text-pale-rose-text",
  voided: "bg-neutral-100 text-neutral-600",
  refunded: "bg-neutral-100 text-neutral-600",
  held_for_review: "bg-mauve/20 text-mauve-text",
};

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function PaymentsAdmin() {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [waivingId, setWaivingId] = useState<string | null>(null);

  // UI state
  const [section, setSection] = useState<"transactions" | "errors">("transactions"); // elevated section tabs
  const [currentTab, setCurrentTab] = useState("all"); // status filter value
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [sortMode, setSortMode] = useState<"priority" | "amount" | "name" | "recent">("priority");
  const [selectedTerm, setSelectedTerm] = useState("all"); // semester name filter
  const [termMenuOpen, setTermMenuOpen] = useState(false);
  const [newErrorCount, setNewErrorCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const [expandedEpg, setExpandedEpg] = useState<Set<string>>(new Set());
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Issue credit modal state
  const [creditBatch, setCreditBatch] = useState<{ id: string; familyId: string | null; parentName: string } | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const [creditError, setCreditError] = useState("");
  const [creditSubmitting, setCreditSubmitting] = useState(false);
  const toast = useToast();

  // Void/refund modal state
  type VoidRefundModal = {
    paymentId: string;
    batchId: string;
    type: "void" | "refund";
    maxAmount: number;
    currency: string;
    parentName: string;
    registrations: Array<{ id: string; className: string; proratedAmount: number; totalClasses: number; classesRemaining: number }>;
  };
  const [voidRefundModal, setVoidRefundModal] = useState<VoidRefundModal | null>(null);
  const [vrReason, setVrReason] = useState("");
  const [vrMode, setVrMode] = useState<"full" | "amount" | "line_items">("full");
  const [vrAmount, setVrAmount] = useState("");
  const [vrLineAmounts, setVrLineAmounts] = useState<Record<string, string>>({});
  const [vrError, setVrError] = useState<string | null>(null);
  const [vrSubmitting, setVrSubmitting] = useState(false);

  // Refund history expandable state
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const [refundHistory, setRefundHistory] = useState<Record<string, RefundHistoryRow[]>>({});

  // Contact modal state
  type ContactModal = {
    parentName: string;
    email: string;
    phone: string | null;
    userId: string;
    installmentLabel: string;
    amountDue: number;
    dueDate: string;
    semesterName: string;
  };
  const [contactModal, setContactModal] = useState<ContactModal | null>(null);
  const [contactMethod, setContactMethod] = useState<"email" | "sms">("email");
  const [contactSubject, setContactSubject] = useState("");
  const [contactBody, setContactBody] = useState("");
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  // Close filter popover on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterOpen && toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [filterOpen]);

  async function loadBatches() {
    const supabase = createClient();
    const { data } = await supabase
      .from("registration_orders")
      .select(
        `id, family_id, grand_total, tuition_total, registration_fee_total,
         family_discount_amount, auto_pay_admin_fee_total, payment_plan_type,
         amount_due_now, status, created_at, confirmed_at,
         users:parent_id(id, first_name, last_name, email, phone_number),
         semesters:semester_id(name),
         order_payment_installments(id, installment_number, amount_due, due_date, status, paid_at, paid_amount),
         payments(id, transaction_id, state, event_type, amount, currency, updated_at, raw_transaction),
         registrations:meeting_enrollments!registration_batch_id(
           class_meetings:meeting_id(
             location,
             classes:class_id(name)
           )
         )`,
      )
      .order("created_at", { ascending: false });

    setBatches((data as unknown as BatchRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New (unresolved) error count for the Error Log section badge.
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { count } = await supabase
        .from("payment_error_logs")
        .select("*", { count: "exact", head: true })
        .eq("status", "new");
      setNewErrorCount(count ?? 0);
    })();
  }, []);

  // Close the term / status dropdowns on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-pdd]")) {
        setTermMenuOpen(false);
        setStatusMenuOpen(false);
      }
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  function cycleSort() {
    const order: Array<typeof sortMode> = ["priority", "amount", "name", "recent"];
    setSortMode((m) => order[(order.indexOf(m) + 1) % order.length]);
  }

  async function loadRefundHistory(batchId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("payment_refunds")
      .select("id, type, amount, reason, status, failure_reason, epg_transaction_id, created_at, line_items, initiated_by")
      .eq("batch_id", batchId)
      .order("created_at", { ascending: false });
    if (!data) return;
    const adminIds = [...new Set(data.map((r: any) => r.initiated_by).filter(Boolean))];
    let adminNames: Record<string, string> = {};
    if (adminIds.length > 0) {
      const { data: admins } = await supabase
        .from("users")
        .select("id, first_name, last_name")
        .in("id", adminIds);
      adminNames = Object.fromEntries((admins ?? []).map((a: any) => [a.id, `${a.first_name} ${a.last_name}`]));
    }
    setRefundHistory((prev) => ({
      ...prev,
      [batchId]: data.map((r: any) => ({ ...r, initiated_by_name: adminNames[r.initiated_by] ?? null })),
    }));
  }

  async function toggleHistory(batchId: string) {
    setExpandedHistory((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) {
        next.delete(batchId);
      } else {
        next.add(batchId);
        loadRefundHistory(batchId);
      }
      return next;
    });
  }

  function showToast(msg: string, type: "success" | "error" = "success") {
    toast.show(msg, type);
  }

  function openVoidRefundModal(batch: BatchRow, type: "void" | "refund") {
    const payment = (batch.payments ?? [])[0];
    if (!payment) return;
    const parent = batch.users as any;
    setVoidRefundModal({
      paymentId: payment.id,
      batchId: batch.id,
      type,
      maxAmount: payment.amount,
      currency: payment.currency ?? "USD",
      parentName: parent ? `${parent.first_name} ${parent.last_name}` : "Unknown",
      registrations: [],
    });
    setVrReason("");
    setVrMode("full");
    setVrAmount("");
    setVrLineAmounts({});
    setVrError(null);
  }

  async function handleVoidRefundSubmit() {
    if (!voidRefundModal) return;
    setVrError(null);
    if (vrReason.trim().length < 10) {
      setVrError("Reason must be at least 10 characters.");
      return;
    }
    let amount: number | undefined;
    let lineItems: Array<{ registrationId: string; className: string; amount: number }> | undefined;

    if (voidRefundModal.type === "refund") {
      if (vrMode === "amount") {
        amount = parseFloat(vrAmount);
        if (isNaN(amount) || amount <= 0) { setVrError("Enter a valid amount."); return; }
        if (amount > voidRefundModal.maxAmount) { setVrError(`Cannot exceed $${voidRefundModal.maxAmount.toFixed(2)}`); return; }
      } else if (vrMode === "line_items") {
        lineItems = voidRefundModal.registrations
          .map((r) => ({ registrationId: r.id, className: r.className, amount: parseFloat(vrLineAmounts[r.id] ?? "0") }))
          .filter((r) => r.amount > 0);
        if (lineItems.length === 0) { setVrError("Select at least one line item to refund."); return; }
        amount = lineItems.reduce((s, r) => s + r.amount, 0);
        if (amount > voidRefundModal.maxAmount) { setVrError(`Total exceeds original payment of $${voidRefundModal.maxAmount.toFixed(2)}.`); return; }
      }
    }

    setVrSubmitting(true);
    try {
      const endpoint = voidRefundModal.type === "void"
        ? "/api/admin/payments/void"
        : "/api/admin/payments/refund";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: voidRefundModal.paymentId, reason: vrReason, amount, lineItems }),
      });
      const json = await res.json();
      if (!res.ok) { setVrError(json.error ?? "Request failed."); return; }

      setVoidRefundModal(null);
      const label = voidRefundModal.type === "void" ? "Void" : "Refund";
      showToast(`${label} processed successfully.`);
      await loadBatches();
    } catch (err) {
      setVrError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setVrSubmitting(false);
    }
  }

  async function handleMarkPaid(installmentId: string) {
    setMarkingPaid(installmentId);
    await markInstallmentPaid(installmentId);
    await loadBatches();
    setMarkingPaid(null);
  }

  async function handleWaive(installmentId: string) {
    setWaivingId(installmentId);
    const result = await waiveInstallment(installmentId);
    if (result.error) {
      showToast(result.error, "error");
    } else {
      await loadBatches();
    }
    setWaivingId(null);
  }

  function openContactModal(batch: BatchRow, inst: InstallmentRow) {
    const parent = batch.users as any;
    const parentName = parent ? `${parent.first_name} ${parent.last_name}` : "Unknown";
    const semName = (batch.semesters as any)?.name ?? "Spring Season";
    const amtFormatted = formatCurrency(inst.amount_due);
    const dueDateFormatted = formatDate(inst.due_date);

    const defaultSubject = `Payment Overdue — ${semName} Registration`;
    const defaultBody = [
      `Hi ${parent?.first_name ?? "there"},`,
      ``,
      `This is a reminder that a payment of ${amtFormatted} was due on ${dueDateFormatted} for your ${semName} registration.`,
      ``,
      `Please log in to your account at aydt.org to complete your payment or contact us if you have any questions.`,
      ``,
      `Thank you,`,
      `AYDT Team`,
    ].join("\n");

    setContactModal({
      parentName,
      email: parent?.email ?? "",
      phone: parent?.phone_number ?? null,
      userId: parent?.id ?? "",
      installmentLabel: `Payment ${inst.installment_number}`,
      amountDue: inst.amount_due,
      dueDate: inst.due_date,
      semesterName: semName,
    });
    setContactMethod("email");
    setContactSubject(defaultSubject);
    setContactBody(defaultBody);
    setContactError(null);
  }

  async function handleSendContact() {
    if (!contactModal) return;
    setContactSubmitting(true);
    setContactError(null);
    const result = await sendPaymentReminder({
      method: contactMethod,
      email: contactModal.email,
      phone: contactModal.phone ?? undefined,
      userId: contactModal.userId,
      subject: contactSubject,
      body: contactBody,
    });
    setContactSubmitting(false);
    if (result.error) {
      setContactError(result.error);
      return;
    }
    setContactModal(null);
    showToast(`${contactMethod === "email" ? "Email" : "SMS"} sent to ${contactModal.parentName}.`);
  }

  function openCreditModal(batch: BatchRow) {
    const parent = batch.users as any;
    const name = parent ? `${parent.first_name} ${parent.last_name}` : "Unknown";
    setCreditBatch({ id: batch.id, familyId: batch.family_id, parentName: name });
    setCreditAmount("");
    setCreditReason("");
    setCreditError("");
  }

  function closeCreditModal() {
    setCreditBatch(null);
    setCreditAmount("");
    setCreditReason("");
    setCreditError("");
  }

  async function handleIssueCredit() {
    if (!creditBatch?.familyId) {
      setCreditError("No family associated with this batch.");
      return;
    }
    const amount = parseFloat(creditAmount);
    if (isNaN(amount) || amount <= 0) {
      setCreditError("Please enter a valid amount greater than $0.");
      return;
    }
    setCreditSubmitting(true);
    setCreditError("");
    const result = await issueAccountCredit({
      familyId: creditBatch.familyId,
      amount,
      reason: creditReason || undefined,
      sourceBatchId: creditBatch.id,
    });
    setCreditSubmitting(false);
    if (result.error) {
      setCreditError(result.error);
      return;
    }
    closeCreditModal();
    showToast(`Credit of ${formatCurrency(amount)} issued to ${creditBatch.parentName}.`);
  }

  function toggleBatch(batchId: string) {
    setExpandedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  }

  function clearFilters() {
    setFilterClass("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterOpen(false);
  }

  // Derive unique class names from loaded batches for dynamic filter options
  const allClassNames = Array.from(
    new Set(
      batches.flatMap((b) =>
        (b.registrations ?? [])
          .map((r) => r.class_meetings?.classes?.name)
          .filter(Boolean) as string[],
      ),
    ),
  ).sort();

  // Active chips
  const activeChips = [
    filterClass ? { label: filterClass, key: "cls" } : null,
    (filterDateFrom || filterDateTo)
      ? { label: `${filterDateFrom || "…"} → ${filterDateTo || "…"}`, key: "date" }
      : null,
  ].filter(Boolean) as Array<{ label: string; key: string }>;

  function removeChip(key: string) {
    if (key === "cls") setFilterClass("");
    if (key === "date") { setFilterDateFrom(""); setFilterDateTo(""); }
  }

  // ── Term (semester) options derived from loaded batches ──
  const allTermNames = Array.from(
    new Set(batches.map((b) => b.semesters?.name).filter(Boolean) as string[]),
  ).sort();

  function matchTerm(b: BatchRow): boolean {
    if (selectedTerm === "all") return true;
    return (b.semesters?.name ?? null) === selectedTerm;
  }

  function hasOverdueInstallment(b: BatchRow): boolean {
    return (b.order_payment_installments ?? []).some((i) => i.status === "overdue");
  }

  // Status predicate shared by the filter and the status-dropdown counts.
  function matchStatus(b: BatchRow, status: string): boolean {
    if (status === "all") return true;
    if (status === "attention") return b.status === "failed" || hasOverdueInstallment(b);
    if (status === "overdue") return hasOverdueInstallment(b);
    if (status === "pending") return b.status === "pending_payment";
    return b.status === status;
  }

  // How much has actually been collected on an order (mirrors the
  // expanded-detail logic; pay-in-full confirmed orders have no
  // installment rows, so fall back to the grand total).
  function batchCollected(b: BatchRow): number {
    const insts = b.order_payment_installments ?? [];
    if (insts.length === 0) {
      return b.status === "confirmed" && b.grand_total != null ? Number(b.grand_total) : 0;
    }
    return insts.reduce((s, i) => {
      if (i.status === "paid") return s + Number(i.paid_amount ?? i.amount_due);
      return s + Number(i.paid_amount ?? 0);
    }, 0);
  }

  // Filtered batches (term + search + date/class filter + status)
  const filteredBatches = batches.filter((b) => {
    if (!matchTerm(b)) return false;
    const parent = b.users as any;
    const name = parent ? `${parent.first_name} ${parent.last_name}` : "";
    if (searchQuery && !name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    const dateStr = b.created_at.slice(0, 10);
    if (filterDateFrom && dateStr < filterDateFrom) return false;
    if (filterDateTo && dateStr > filterDateTo) return false;
    if (filterClass) {
      const hasClass = (b.registrations ?? []).some(
        (r) => r.class_meetings?.classes?.name === filterClass,
      );
      if (!hasClass) return false;
    }
    return matchStatus(b, currentTab);
  });

  // Sort the filtered batches by the active sort mode.
  function priorityRank(b: BatchRow): number {
    if (hasOverdueInstallment(b)) return 0;
    if (b.status === "failed") return 1;
    if (b.status === "partial" || b.status === "pending_payment") return 2;
    if (b.status === "confirmed") return 3;
    return 4;
  }
  const sortedBatches = [...filteredBatches].sort((a, b) => {
    if (sortMode === "priority") {
      return priorityRank(a) - priorityRank(b) || (Number(b.grand_total ?? 0) - Number(a.grand_total ?? 0));
    }
    if (sortMode === "amount") return Number(b.grand_total ?? 0) - Number(a.grand_total ?? 0);
    if (sortMode === "name") {
      const an = `${a.users?.first_name ?? ""} ${a.users?.last_name ?? ""}`.trim();
      const bn = `${b.users?.first_name ?? ""} ${b.users?.last_name ?? ""}`.trim();
      return an.localeCompare(bn);
    }
    // recent — most recently created first
    return b.created_at.localeCompare(a.created_at);
  });

  // Count for a given status within the currently-selected term.
  function tabCount(tab: string): number {
    return batches.filter((b) => matchTerm(b) && matchStatus(b, tab)).length;
  }

  // ── Term-scoped financial summary (stat cards + collection bar) ──
  const termBatches = batches.filter(matchTerm);
  const collectedTotal = termBatches.reduce((s, b) => s + batchCollected(b), 0);
  const confirmedCount = termBatches.filter((b) => b.status === "confirmed").length;
  const outstandingTotal = termBatches.reduce((s, b) => {
    return s + (b.order_payment_installments ?? [])
      .filter((i) => i.status === "scheduled" || i.status === "overdue")
      .reduce((t, i) => t + Number(i.amount_due ?? 0), 0);
  }, 0);
  const upcomingCount = termBatches.reduce(
    (s, b) => s + (b.order_payment_installments ?? []).filter((i) => i.status === "scheduled").length,
    0,
  );
  const overdueTotal = termBatches.reduce((s, b) => {
    return s + (b.order_payment_installments ?? [])
      .filter((i) => i.status === "overdue")
      .reduce((t, i) => t + Number(i.amount_due ?? 0), 0);
  }, 0);
  const overdueFamilies = new Set(
    termBatches.filter(hasOverdueInstallment).map((b) => b.family_id ?? b.id),
  ).size;
  const attentionCount = termBatches.filter((b) => b.status === "failed" || hasOverdueInstallment(b)).length;
  const expectedTotal = collectedTotal + outstandingTotal;
  const collectedPct = expectedTotal > 0 ? Math.round((collectedTotal / expectedTotal) * 100) : 0;

  const STATUS_OPTIONS: Array<{ k: string; l: string; risk?: boolean }> = [
    { k: "all", l: "All" },
    { k: "attention", l: "Needs attention", risk: true },
    { k: "pending", l: "Pending" },
    { k: "partial", l: "Partial" },
    { k: "confirmed", l: "Confirmed" },
    { k: "failed", l: "Failed", risk: true },
    { k: "refunded", l: "Refunded" },
    { k: "overdue", l: "Overdue", risk: true },
  ];
  const SORT_OPTIONS: Array<{ k: typeof sortMode; l: string }> = [
    { k: "priority", l: "Priority" },
    { k: "amount", l: "Amount" },
    { k: "name", l: "Name" },
    { k: "recent", l: "Recent" },
  ];
  const currentStatusLabel = STATUS_OPTIONS.find((s) => s.k === currentTab)?.l ?? "All";
  const currentSortLabel = SORT_OPTIONS.find((s) => s.k === sortMode)?.l ?? "Priority";
  const currentTermLabel = selectedTerm === "all" ? "All terms" : selectedTerm;

  function getBatchLineItems(batch: BatchRow) {
    const items: Array<{ desc: string; type: string; qty: number; price: number }> = [];
    if ((batch.tuition_total ?? 0) > 0) {
      items.push({ desc: "Tuition", type: "class", qty: 1, price: batch.tuition_total! });
    }
    if ((batch.registration_fee_total ?? 0) > 0) {
      items.push({ desc: "Registration Fee", type: "fee", qty: 1, price: batch.registration_fee_total! });
    }
    if (batch.auto_pay_admin_fee_total > 0) {
      items.push({ desc: "Auto-pay Admin Fee", type: "fee", qty: 1, price: batch.auto_pay_admin_fee_total });
    }
    if (batch.family_discount_amount > 0) {
      items.push({ desc: "Family Discount", type: "discount", qty: 1, price: -batch.family_discount_amount });
    }
    return items;
  }

  // Extract readable failure info from EPG raw_transaction
  function getFailureDetails(raw: Record<string, unknown> | null): Array<{ label: string; value: string }> {
    if (!raw) return [];
    const details: Array<{ label: string; value: string }> = [];
    const r = raw as any;

    // Common EPG response fields
    if (r.result) details.push({ label: "Result", value: String(r.result) });
    if (r.result_code) details.push({ label: "Result Code", value: String(r.result_code) });
    if (r.result_message) details.push({ label: "Message", value: String(r.result_message) });
    if (r.decline_code) details.push({ label: "Decline Code", value: String(r.decline_code) });
    if (r.decline_reason) details.push({ label: "Decline Reason", value: String(r.decline_reason) });
    if (r.error_code) details.push({ label: "Error Code", value: String(r.error_code) });
    if (r.error_message) details.push({ label: "Error", value: String(r.error_message) });
    // Nested result/error objects common in EPG responses
    if (r.payment_result) {
      const pr = r.payment_result as any;
      if (pr.result_code) details.push({ label: "Payment Result Code", value: String(pr.result_code) });
      if (pr.result_message) details.push({ label: "Payment Message", value: String(pr.result_message) });
    }
    if (r.card?.scheme) details.push({ label: "Card", value: `${r.card.scheme} ····${r.card.last4 ?? ""}` });
    if (r.avs_result) details.push({ label: "AVS Result", value: String(r.avs_result) });
    if (r.cvv_result) details.push({ label: "CVV Result", value: String(r.cvv_result) });

    return details;
  }

  if (loading) {
    return (
      <div
        className="rounded-xl p-8 text-sm"
        style={{
          background: "var(--admin-surface)",
          border: "0.5px solid var(--admin-border)",
          color: "var(--admin-text-faint)",
        }}
      >
        Loading payments…
      </div>
    );
  }

  return (
    <div className="min-w-0">

        {/* Issue Credit Modal */}
        {creditBatch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-5">
              <h2 className="text-lg font-semibold text-neutral-900">Issue Account Credit</h2>
              <p className="text-sm text-neutral-500">
                Credit will be added to <strong>{creditBatch.parentName}</strong>&apos;s family account and can be applied toward any future registration.
              </p>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Credit amount <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={creditAmount}
                    onChange={(e) => { setCreditAmount(e.target.value); setCreditError(""); }}
                    className="w-full pl-7 pr-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none"
                    autoFocus
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Reason <span className="text-neutral-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Missed class — no makeup available"
                  value={creditReason}
                  onChange={(e) => setCreditReason(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none"
                />
              </div>
              {creditError && <p className="text-sm text-red-600">{creditError}</p>}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={closeCreditModal}
                  disabled={creditSubmitting}
                  className="flex-1 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleIssueCredit}
                  disabled={creditSubmitting || !creditAmount}
                  className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 transition-colors"
                  style={{ background: "var(--admin-sidebar-active)" }}
                >
                  {creditSubmitting ? "Issuing…" : "Issue Credit"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Void / Refund Modal */}
        {voidRefundModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-5 max-h-[90vh] overflow-y-auto">
              <div>
                <h2 className="text-lg font-semibold text-neutral-900">
                  {voidRefundModal.type === "void" ? "Void Transaction" : "Issue Refund"}
                </h2>
                <p className="text-sm text-neutral-500 mt-1">
                  {voidRefundModal.type === "void"
                    ? `This will reverse the transaction for ${voidRefundModal.parentName}. Voids cannot be undone.`
                    : `Issue a refund to ${voidRefundModal.parentName}. Original amount: $${voidRefundModal.maxAmount.toFixed(2)}.`}
                </p>
              </div>

              {voidRefundModal.type === "refund" && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-neutral-700">Refund type</p>
                  <div className="flex flex-col gap-2">
                    {[
                      { value: "full", label: `Full refund — $${voidRefundModal.maxAmount.toFixed(2)}` },
                      { value: "amount", label: "Partial — enter amount" },
                      { value: "line_items", label: "Partial — by line item" },
                    ].map((opt) => (
                      <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="radio"
                          name="vrMode"
                          value={opt.value}
                          checked={vrMode === opt.value}
                          onChange={() => { setVrMode(opt.value as typeof vrMode); setVrError(null); }}
                        />
                        <span className="text-sm text-neutral-700">{opt.label}</span>
                      </label>
                    ))}
                  </div>

                  {vrMode === "amount" && (
                    <div className="mt-2">
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Amount <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max={voidRefundModal.maxAmount}
                          value={vrAmount}
                          onChange={(e) => { setVrAmount(e.target.value); setVrError(null); }}
                          className="w-full pl-7 pr-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {vrMode === "line_items" && voidRefundModal.registrations.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {voidRefundModal.registrations.map((r) => (
                        <div key={r.id} className="border border-neutral-200 rounded-lg p-3 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-neutral-800">{r.className}</span>
                          </div>
                          {r.classesRemaining < r.totalClasses && (
                            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                              Prorated amount: ${r.proratedAmount.toFixed(2)} ({r.classesRemaining} of {r.totalClasses} classes remaining)
                            </p>
                          )}
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder={r.proratedAmount.toFixed(2)}
                              value={vrLineAmounts[r.id] ?? ""}
                              onChange={(e) => { setVrLineAmounts((prev) => ({ ...prev, [r.id]: e.target.value })); setVrError(null); }}
                              className="w-full pl-7 pr-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {vrMode === "line_items" && voidRefundModal.registrations.length === 0 && (
                    <p className="text-sm text-neutral-500 mt-1">No line items available — use &quot;enter amount&quot; instead.</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Reason / Notes <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Required — describe the reason for this action (min 10 characters)"
                  value={vrReason}
                  onChange={(e) => { setVrReason(e.target.value); setVrError(null); }}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none resize-none"
                />
                <p className="text-xs text-neutral-400 mt-1">{vrReason.length} characters (minimum 10)</p>
              </div>

              {vrError && <p className="text-sm text-red-600">{vrError}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setVoidRefundModal(null)}
                  disabled={vrSubmitting}
                  className="flex-1 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleVoidRefundSubmit}
                  disabled={vrSubmitting || vrReason.trim().length < 10}
                  className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 transition-colors"
                  style={
                    voidRefundModal.type === "void"
                      ? { background: "#DC2626" }
                      : { background: "var(--admin-sidebar-active)" }
                  }
                >
                  {vrSubmitting ? "Processing…" : voidRefundModal.type === "void" ? "Confirm Void" : "Issue Refund"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Contact Modal */}
        {contactModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <div>
                <h2 className="text-lg font-semibold text-neutral-900">Contact Family</h2>
                <p className="text-sm text-neutral-500 mt-0.5">
                  Reach out to <strong>{contactModal.parentName}</strong> about their overdue payment of{" "}
                  <strong>{formatCurrency(contactModal.amountDue)}</strong> due {formatDate(contactModal.dueDate)}.
                </p>
              </div>

              {/* Method tabs */}
              <div className="flex gap-2">
                {(["email", "sms"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setContactMethod(m); setContactError(null); }}
                    className="px-4 py-1.5 rounded-full text-[12px] font-medium border transition-all"
                    style={
                      contactMethod === m
                        ? { background: "var(--admin-text)", color: "#fff", borderColor: "var(--admin-text)" }
                        : { background: "var(--admin-surface-sub)", color: "var(--admin-text-muted)", borderColor: "var(--admin-border)" }
                    }
                  >
                    {m === "email" ? "📧 Email" : "💬 SMS"}
                  </button>
                ))}
              </div>

              {/* Recipient info */}
              <div
                className="rounded-lg px-3 py-2 text-[12px] flex flex-col gap-0.5"
                style={{ background: "var(--admin-surface-sub)", border: "0.5px solid var(--admin-border)" }}
              >
                {contactMethod === "email" ? (
                  <span style={{ color: "var(--admin-text)" }}>
                    To: <span className="font-medium">{contactModal.email || "No email on file"}</span>
                  </span>
                ) : (
                  <span style={{ color: contactModal.phone ? "var(--admin-text)" : "#802818" }}>
                    To: <span className="font-medium">
                      {contactModal.phone ?? "No phone number on file — SMS unavailable"}
                    </span>
                  </span>
                )}
              </div>

              {contactMethod === "email" && (
                <div>
                  <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--admin-text-muted)" }}>
                    Subject
                  </label>
                  <input
                    type="text"
                    value={contactSubject}
                    onChange={(e) => setContactSubject(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-[13px] outline-none"
                    style={{
                      border: "0.5px solid var(--admin-border)",
                      background: "var(--admin-surface-sub)",
                      color: "var(--admin-text)",
                      fontFamily: "inherit",
                    }}
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--admin-text-muted)" }}>
                  {contactMethod === "email" ? "Message" : "SMS Body"}
                  {contactMethod === "sms" && (
                    <span className="ml-2 font-normal" style={{ color: "var(--admin-text-faint)" }}>
                      ({contactBody.length}/160 chars)
                    </span>
                  )}
                </label>
                <textarea
                  rows={contactMethod === "email" ? 8 : 4}
                  value={contactBody}
                  onChange={(e) => setContactBody(contactMethod === "sms" ? e.target.value.slice(0, 160) : e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-[13px] outline-none resize-none"
                  style={{
                    border: "0.5px solid var(--admin-border)",
                    background: "var(--admin-surface-sub)",
                    color: "var(--admin-text)",
                    fontFamily: "inherit",
                    lineHeight: 1.6,
                  }}
                />
              </div>

              {contactError && <p className="text-sm text-red-600">{contactError}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setContactModal(null)}
                  disabled={contactSubmitting}
                  className="flex-1 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendContact}
                  disabled={
                    contactSubmitting ||
                    !contactBody.trim() ||
                    (contactMethod === "email" && !contactModal.email) ||
                    (contactMethod === "sms" && !contactModal.phone)
                  }
                  className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 transition-colors"
                  style={{ background: "var(--admin-sidebar-active)" }}
                >
                  {contactSubmitting ? "Sending…" : `Send ${contactMethod === "email" ? "Email" : "SMS"}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Elevated section tabs ── */}
        <div className="flex items-center gap-7 mb-5" style={{ borderBottom: "0.5px solid var(--admin-border)" }}>
          {([
            { k: "transactions", l: "Transactions" },
            { k: "errors", l: "Error Log" },
          ] as const).map((s) => {
            const active = section === s.k;
            return (
              <button
                key={s.k}
                type="button"
                onClick={() => setSection(s.k)}
                className="relative inline-flex items-center gap-2 pb-3 text-[14.5px]"
                style={{
                  color: active ? "var(--admin-text)" : "var(--admin-text-muted)",
                  fontWeight: active ? 600 : 500,
                  borderBottom: `2px solid ${active ? "var(--admin-sidebar-active)" : "transparent"}`,
                  marginBottom: "-0.5px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {s.l}
                {s.k === "errors" && newErrorCount > 0 && (
                  <span
                    className="inline-flex items-center justify-center rounded-full text-[11px] font-bold"
                    style={{ minWidth: 19, height: 19, padding: "0 6px", background: "var(--color-pale-rose, #E8B8B0)", color: "#802818" }}
                  >
                    {newErrorCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {section === "transactions" && (
          <>
            {/* Page header: title + term filter */}
            <div className="flex items-center justify-between gap-3 mb-4">
              <h1 className="text-[20px] font-medium" style={{ color: "var(--admin-text)" }}>Payments</h1>
              <div className="relative" data-pdd>
                <button
                  type="button"
                  onClick={() => { setTermMenuOpen((o) => !o); setStatusMenuOpen(false); }}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-semibold"
                  style={{ border: "0.5px solid var(--admin-border)", background: "var(--admin-surface)", color: "var(--admin-text)" }}
                >
                  <span style={{ color: "var(--admin-text-faint)", fontWeight: 500 }}>Term</span>
                  {currentTermLabel}
                  <span style={{ color: "var(--admin-text-faint)", fontSize: 9 }}>▼</span>
                </button>
                {termMenuOpen && (
                  <div
                    className="absolute right-0 mt-1.5 min-w-[200px] rounded-xl p-1.5 z-30"
                    style={{ background: "var(--admin-surface)", border: "0.5px solid var(--admin-border)", boxShadow: "var(--shadow-dropdown, 0 8px 24px rgba(0,0,0,.10))" }}
                  >
                    {["all", ...allTermNames].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => { setSelectedTerm(t); setTermMenuOpen(false); }}
                        className="w-full text-left px-2.5 py-2 rounded-lg text-[13px]"
                        style={{ background: t === selectedTerm ? "var(--admin-surface-sub)" : "transparent", fontWeight: t === selectedTerm ? 600 : 400, color: "var(--admin-text)" }}
                      >
                        {t === "all" ? "All terms" : t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Stat cards — term-scoped financial summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3.5">
              <div className="rounded-xl p-4" style={{ background: "var(--admin-surface)", border: "0.5px solid var(--admin-border)", borderTop: "3px solid var(--admin-card-accent)", boxShadow: "var(--shadow-card)" }}>
                <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--admin-text-faint)" }}>Collected · {currentTermLabel}</div>
                <div className="text-[24px] font-medium leading-none mt-2" style={{ color: "var(--admin-text)" }}>{formatCurrency(collectedTotal)}</div>
                <div className="text-[12px] mt-1.5" style={{ color: "var(--admin-text-muted)" }}>across {confirmedCount} confirmed</div>
              </div>
              <div className="rounded-xl p-4" style={{ background: "var(--admin-surface)", border: "0.5px solid var(--admin-border)", borderTop: "3px solid var(--admin-card-accent)", boxShadow: "var(--shadow-card)" }}>
                <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--admin-text-faint)" }}>Outstanding</div>
                <div className="text-[24px] font-medium leading-none mt-2" style={{ color: "var(--admin-text)" }}>{formatCurrency(outstandingTotal)}</div>
                <div className="text-[12px] mt-1.5" style={{ color: "var(--admin-text-muted)" }}>{upcomingCount} installment{upcomingCount === 1 ? "" : "s"} upcoming</div>
              </div>
              <div className="rounded-xl p-4" style={{ background: "var(--admin-surface)", border: "0.5px solid var(--admin-border)", borderTop: "3px solid #C06A5E", boxShadow: "var(--shadow-card)" }}>
                <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--admin-text-faint)" }}>Overdue</div>
                <div className="text-[24px] font-medium leading-none mt-2" style={{ color: "#802818" }}>{formatCurrency(overdueTotal)}</div>
                <div className="text-[12px] mt-1.5" style={{ color: "var(--admin-text-muted)" }}>{overdueFamilies} {overdueFamilies === 1 ? "family" : "families"}</div>
              </div>
              <button
                type="button"
                onClick={() => { setCurrentTab("attention"); }}
                className="rounded-xl p-4 text-left transition-shadow hover:shadow-md"
                style={{ background: "var(--admin-surface)", border: "0.5px solid var(--admin-border)", borderTop: "3px solid #C06A5E", boxShadow: "var(--shadow-card)", cursor: "pointer" }}
              >
                <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--admin-text-faint)" }}>Needs attention</div>
                <div className="text-[24px] font-medium leading-none mt-2" style={{ color: "#802818" }}>{attentionCount}</div>
                <div className="text-[12px] mt-1.5 font-semibold" style={{ color: "var(--admin-sidebar-active)" }}>Review →</div>
              </button>
            </div>

            {/* Collection progress */}
            <div className="rounded-xl px-4 py-3 mb-5" style={{ background: "var(--admin-surface)", border: "0.5px solid var(--admin-border)", boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-baseline justify-between mb-2 gap-3 flex-wrap">
                <span className="text-[12px]" style={{ color: "var(--admin-text-muted)" }}>
                  <b style={{ color: "var(--admin-text)" }}>{formatCurrency(collectedTotal)}</b> collected of <b style={{ color: "var(--admin-text)" }}>{formatCurrency(expectedTotal)}</b> expected
                </span>
                <span className="text-[13px] font-semibold" style={{ color: "#0A5A50" }}>{collectedPct}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--admin-surface-sub)" }}>
                <div className="h-full" style={{ width: `${collectedPct}%`, background: "#7DCEC2" }} />
              </div>
            </div>

        {/* Toolbar */}
        <div ref={toolbarRef} className="relative flex flex-wrap gap-2 items-center mb-4">
          {/* Status dropdown */}
          <div className="relative" data-pdd>
            <button
              type="button"
              onClick={() => { setStatusMenuOpen((o) => !o); setTermMenuOpen(false); }}
              className="inline-flex items-center gap-2 px-3 py-[7px] rounded-lg text-[13px] font-semibold"
              style={{ border: "0.5px solid var(--admin-border)", background: "var(--admin-surface)", color: "var(--admin-text)" }}
            >
              <span style={{ color: "var(--admin-text-faint)", fontWeight: 500 }}>Status</span>
              {currentStatusLabel}
              <span
                className="inline-flex items-center justify-center rounded-full text-[10.5px] font-bold"
                style={{ minWidth: 17, height: 17, padding: "0 5px", background: "var(--admin-surface-sub)", color: "var(--admin-text-muted)" }}
              >
                {tabCount(currentTab)}
              </span>
              <span style={{ color: "var(--admin-text-faint)", fontSize: 9 }}>▼</span>
            </button>
            {statusMenuOpen && (
              <div
                className="absolute left-0 mt-1.5 min-w-[230px] rounded-xl p-1.5 z-30"
                style={{ background: "var(--admin-surface)", border: "0.5px solid var(--admin-border)", boxShadow: "var(--shadow-dropdown, 0 8px 24px rgba(0,0,0,.10))" }}
              >
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s.k}
                    type="button"
                    onClick={() => { setCurrentTab(s.k); setStatusMenuOpen(false); }}
                    className="w-full flex items-center justify-between gap-4 px-2.5 py-2 rounded-lg text-[13px]"
                    style={{ background: s.k === currentTab ? "var(--admin-surface-sub)" : "transparent", fontWeight: s.k === currentTab ? 600 : 400, color: s.risk ? "#802818" : "var(--admin-text)" }}
                  >
                    {s.l}
                    <span style={{ color: s.risk ? "#802818" : "var(--admin-text-faint)", fontSize: 12 }}>{tabCount(s.k)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ color: "var(--admin-text-faint)" }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search by name…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-[7px] rounded-lg text-[13px] outline-none transition-[border-color,box-shadow]"
              style={{
                border: "0.5px solid var(--admin-border)",
                background: "var(--admin-surface)",
                color: "var(--admin-text)",
                fontFamily: "inherit",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--admin-sidebar-active)";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(142,42,35,.10)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--admin-border)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          {/* Filter button */}
          <button
            type="button"
            onClick={() => setFilterOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-[13px] font-medium transition-colors"
            style={{
              border: `0.5px solid ${filterOpen || activeChips.length > 0 ? "var(--admin-sidebar-active)" : "var(--admin-border)"}`,
              background: filterOpen || activeChips.length > 0 ? "var(--color-primary-50, #FDF2F1)" : "var(--admin-surface)",
              color: filterOpen || activeChips.length > 0 ? "var(--admin-sidebar-active)" : "var(--admin-text-muted)",
              fontFamily: "inherit",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="8" y1="12" x2="16" y2="12" />
              <line x1="11" y1="18" x2="13" y2="18" />
            </svg>
            Add Filter
          </button>

          {/* Filter popover */}
          {filterOpen && (
            <div
              className="absolute top-[calc(100%+6px)] left-0 w-72 rounded-xl p-4 z-50"
              style={{
                background: "var(--admin-surface)",
                border: "0.5px solid var(--admin-border)",
                boxShadow: "var(--shadow-dropdown, 0 8px 24px rgba(0,0,0,.10))",
              }}
            >
              <p
                className="mb-2.5"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--admin-text-faint)",
                }}
              >
                Filter Transactions
              </p>

              <p className="mb-1.5 text-[10px]" style={{ color: "var(--admin-text-muted)" }}>Date Range</p>
              <div className="flex gap-2 mb-3">
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="flex-1 px-2 py-1.5 rounded-[7px] text-[12px] outline-none"
                  style={{
                    border: "0.5px solid var(--admin-border)",
                    background: "var(--admin-surface-sub)",
                    color: "var(--admin-text)",
                    fontFamily: "inherit",
                  }}
                />
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="flex-1 px-2 py-1.5 rounded-[7px] text-[12px] outline-none"
                  style={{
                    border: "0.5px solid var(--admin-border)",
                    background: "var(--admin-surface-sub)",
                    color: "var(--admin-text)",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              <p className="mb-1.5 text-[10px]" style={{ color: "var(--admin-text-muted)" }}>Class</p>
              <select
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
                className="w-full px-2 py-1.5 rounded-[7px] text-[12px] outline-none cursor-pointer"
                style={{
                  border: "0.5px solid var(--admin-border)",
                  background: "var(--admin-surface-sub)",
                  color: "var(--admin-text)",
                  fontFamily: "inherit",
                }}
              >
                <option value="">All classes</option>
                {allClassNames.map((cn) => (
                  <option key={cn} value={cn}>{cn}</option>
                ))}
              </select>

              <div
                className="flex justify-end gap-2 mt-3.5 pt-3"
                style={{ borderTop: "0.5px solid var(--admin-border-sub)" }}
              >
                <button
                  type="button"
                  onClick={clearFilters}
                  className="px-3 py-1.5 rounded-md text-[12px] font-medium"
                  style={{
                    background: "var(--admin-surface-sub)",
                    color: "var(--admin-text-muted)",
                    fontFamily: "inherit",
                  }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setFilterOpen(false)}
                  className="px-3 py-1.5 rounded-md text-[12px] font-medium text-white"
                  style={{ background: "var(--admin-sidebar-active)", fontFamily: "inherit" }}
                >
                  Apply
                </button>
              </div>
            </div>
          )}

          {/* Active chips */}
          {activeChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium"
              style={{
                background: "var(--color-primary-100, #F2E7E4)",
                color: "#5C1713",
                border: "0.5px solid var(--color-primary-200, #E6D5D1)",
              }}
            >
              {chip.label}
              <button
                type="button"
                onClick={() => removeChip(chip.key)}
                className="leading-none"
                style={{ color: "#7B1F1A" }}
              >
                ×
              </button>
            </span>
          ))}

          {/* Sort — cycles through Priority / Amount / Name / Recent */}
          <button
            type="button"
            onClick={cycleSort}
            className="inline-flex items-center gap-2 px-3 py-[7px] rounded-lg text-[12.5px] font-medium"
            style={{ border: "0.5px solid var(--admin-border)", background: "var(--admin-surface)", color: "var(--admin-text)" }}
          >
            <span style={{ color: "var(--admin-text-faint)" }}>Sort</span>
            {currentSortLabel}
            <span style={{ color: "var(--admin-text-faint)", fontSize: 9 }}>▼</span>
          </button>
        </div>
          </>
        )}

        {/* Error Log section — self-contained view */}
        {section === "errors" && <PaymentErrorLog />}

        {/* Batch list (Transactions section only) */}
        {section === "transactions" && (
        <div className="flex flex-col gap-1.5">
          {sortedBatches.length === 0 ? (
            <div className="text-center py-10 text-[13px]" style={{ color: "var(--admin-text-faint)" }}>
              No transactions match your filters.
            </div>
          ) : (
            sortedBatches.map((batch) => {
              const parent = batch.users as any;
              const parentName = parent ? `${parent.first_name} ${parent.last_name}` : "Unknown";
              const semester = batch.semesters as any;
              const installments = [...(batch.order_payment_installments ?? [])].sort(
                (a, b) => a.installment_number - b.installment_number,
              );
              const hasOverdue = installments.some((i) => i.status === "overdue");
              const isExpanded = expandedBatches.has(batch.id);
              const lineItems = getBatchLineItems(batch);
              const subtotal = lineItems
                .filter((i) => i.type !== "discount")
                .reduce((s, i) => s + i.price * i.qty, 0);
              const discountAmt = Math.abs(
                lineItems
                  .filter((i) => i.type === "discount")
                  .reduce((s, i) => s + i.price * i.qty, 0),
              );
              const payment = (batch.payments ?? [])[0] ?? null;

              // Meeting-plan #19: how much has actually been collected on this
              // order, and what remains outstanding. A fully-paid installment
              // counts its paid_amount (falling back to amount_due for legacy
              // rows); scheduled/overdue rows count any partial paid_amount.
              const amountCollected = installments.reduce((s, i) => {
                if (i.status === "paid") return s + Number(i.paid_amount ?? i.amount_due);
                return s + Number(i.paid_amount ?? 0);
              }, 0);
              const outstanding =
                batch.grand_total != null ? Number(batch.grand_total) - amountCollected : 0;
              const isPartialOrder = batch.status === "partial";

              // Refund: confirmed batches with a settled payment
              const canRefund =
                batch.status === "confirmed" &&
                payment != null &&
                (payment.state === "settled" || payment.state === "captured");

              // Void: pre-settlement authorized payments
              const canVoid =
                payment != null && ["authorized", "pending_authorization"].includes(payment.state);

              // Failed: show inspection panel
              const isFailed = batch.status === "failed";
              const failureDetails = isFailed ? getFailureDetails(payment?.raw_transaction ?? null) : [];
              const isEpgExpanded = expandedEpg.has(batch.id);

              return (
                <div
                  key={batch.id}
                  className="overflow-hidden transition-shadow hover:shadow-md"
                  style={{
                    background: "var(--admin-surface)",
                    border: `0.5px solid ${hasOverdue ? "#FECACA" : isFailed ? "#FECACA" : "var(--admin-border)"}`,
                    borderRadius: 10,
                  }}
                >
                  {/* Card header row — click to expand */}
                  <div
                    className="flex items-center gap-3 px-4 py-[11px] cursor-pointer select-none"
                    onClick={() => toggleBatch(batch.id)}
                  >
                    {/* Avatar */}
                    <div
                      className="w-[30px] h-[30px] rounded-full shrink-0 flex items-center justify-center text-[11px] font-semibold"
                      style={{ background: "var(--color-primary-100, #F2E7E4)", color: "#5C1713" }}
                    >
                      {getInitials(parentName)}
                    </div>

                    {/* Name + meta */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold truncate" style={{ color: "var(--admin-text)" }}>
                        {parentName}
                        {hasOverdue && (
                          <span className="ml-1.5 text-[10px] font-semibold" style={{ color: "#802818" }}>
                            ● overdue
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] truncate" style={{ color: "var(--admin-text-faint)" }}>
                        {semester?.name ?? "—"} · {(batch.payment_plan_type ?? "—").replace(/_/g, " ")}
                      </div>
                    </div>

                    {/* Badge + amount + chevron */}
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                          BATCH_STATUS_BADGE[batch.status] ?? "bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        {BATCH_STATUS_LABEL[batch.status] ?? batch.status}
                      </span>
                      <span className="text-[14px] font-semibold" style={{ color: "var(--admin-text)" }}>
                        {batch.grand_total != null ? formatCurrency(batch.grand_total) : "—"}
                      </span>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        style={{
                          color: "var(--admin-text-faint)",
                          transition: "transform 0.2s",
                          transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                          flexShrink: 0,
                        }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  </div>

                  {/* Expanded body */}
                  {isExpanded && (
                    <div className="px-4 py-3.5" style={{ borderTop: "0.5px solid var(--admin-border-sub)" }}>

                      {/* ── Failed: EPG inspection panel ── */}
                      {isFailed && (
                        <div
                          className="rounded-xl mb-3 overflow-hidden"
                          style={{ border: "0.5px solid rgba(232,184,176,0.6)", background: "#FDF2F1" }}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedEpg((prev) => {
                                const next = new Set(prev);
                                if (next.has(batch.id)) next.delete(batch.id);
                                else next.add(batch.id);
                                return next;
                              })
                            }
                            className="w-full flex items-center justify-between px-3 py-2.5 text-left"
                          >
                            <div className="flex items-center gap-2">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#802818" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                              </svg>
                              <span style={{ fontSize: 12, fontWeight: 600, color: "#802818" }}>
                                Why did this fail?
                              </span>
                            </div>
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#802818"
                              strokeWidth="2.5"
                              style={{
                                transition: "transform 0.15s",
                                transform: isEpgExpanded ? "rotate(90deg)" : "rotate(0deg)",
                              }}
                            >
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </button>

                          {isEpgExpanded && (
                            <div className="px-3 pb-3 pt-1" style={{ borderTop: "0.5px solid rgba(232,184,176,0.4)" }}>
                              {failureDetails.length === 0 ? (
                                <p style={{ fontSize: 11, color: "#802818" }}>
                                  No detailed error information available from the payment processor.{" "}
                                  {payment?.event_type && (
                                    <span>Event: <strong>{payment.event_type}</strong></span>
                                  )}
                                </p>
                              ) : (
                                <div className="flex flex-col gap-1">
                                  {failureDetails.map((d, i) => (
                                    <div key={i} className="flex gap-3" style={{ fontSize: 11 }}>
                                      <span
                                        className="shrink-0 w-28"
                                        style={{ color: "#B05038", fontWeight: 500 }}
                                      >
                                        {d.label}
                                      </span>
                                      <span style={{ color: "#5C1713", wordBreak: "break-word" }}>{d.value}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {payment?.transaction_id && (
                                <p
                                  className="mt-2 font-mono"
                                  style={{ fontSize: 10, color: "#B05038" }}
                                >
                                  txn: {payment.transaction_id}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Items table */}
                      {lineItems.length > 0 && (
                        <table className="w-full mb-3 border-collapse" style={{ fontSize: 12 }}>
                          <thead>
                            <tr>
                              {(["Item", "Qty", "Amt"] as const).map((h, i) => (
                                <th
                                  key={h}
                                  className="pb-2"
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.05em",
                                    color: "var(--admin-text-faint)",
                                    textAlign: i === 0 ? "left" : i === 1 ? "center" : "right",
                                    width: i === 1 ? 40 : undefined,
                                  }}
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {lineItems.map((item, idx) => (
                              <tr key={idx} style={{ borderTop: "0.5px solid var(--admin-border-sub)" }}>
                                <td className="py-1.5" style={{ color: "var(--admin-text)" }}>
                                  <span className="inline-flex items-center gap-1.5">
                                    <span
                                      style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: "50%",
                                        background: typeDotColor(item.type),
                                        flexShrink: 0,
                                        display: "inline-block",
                                      }}
                                    />
                                    {item.desc}
                                  </span>
                                </td>
                                <td className="py-1.5 text-center" style={{ color: "var(--admin-text-muted)" }}>
                                  {item.qty > 1 ? `×${item.qty}` : "—"}
                                </td>
                                <td
                                  className="py-1.5 text-right font-medium"
                                  style={{ color: item.type === "discount" ? "#0A5A50" : "var(--admin-text)" }}
                                >
                                  {item.type === "discount" ? "−" : ""}${Math.abs(item.price * item.qty).toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {/* Totals strip */}
                      <div
                        className="flex gap-6 py-2.5 mb-3"
                        style={{
                          borderTop: "0.5px solid var(--admin-border)",
                          borderBottom: "0.5px solid var(--admin-border)",
                        }}
                      >
                        {subtotal > 0 && (
                          <div className="flex flex-col gap-0.5">
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 500,
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                color: "var(--admin-text-faint)",
                              }}
                            >
                              Subtotal
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-text)" }}>
                              {formatCurrency(subtotal)}
                            </span>
                          </div>
                        )}
                        {discountAmt > 0 && (
                          <div className="flex flex-col gap-0.5">
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 500,
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                color: "var(--admin-text-faint)",
                              }}
                            >
                              Discount
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#0A5A50" }}>
                              −{formatCurrency(discountAmt)}
                            </span>
                          </div>
                        )}
                        {batch.grand_total != null && (
                          <div className="flex flex-col gap-0.5">
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 500,
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                color: "var(--admin-text-faint)",
                              }}
                            >
                              Total Due
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-sidebar-active)" }}>
                              {formatCurrency(batch.grand_total)}
                            </span>
                          </div>
                        )}
                        {batch.amount_due_now != null && batch.payment_plan_type !== "pay_in_full" && (
                          <div className="flex flex-col gap-0.5">
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 500,
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                color: "var(--admin-text-faint)",
                              }}
                            >
                              Due Now
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-sidebar-active)" }}>
                              {formatCurrency(batch.amount_due_now)}
                            </span>
                          </div>
                        )}
                        {/* Meeting-plan #19: collected vs outstanding for partial orders */}
                        {isPartialOrder && (
                          <>
                            <div className="flex flex-col gap-0.5">
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 500,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.04em",
                                  color: "var(--admin-text-faint)",
                                }}
                              >
                                Collected
                              </span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: "#0A5A50" }}>
                                {formatCurrency(amountCollected)}
                              </span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 500,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.04em",
                                  color: "var(--admin-text-faint)",
                                }}
                              >
                                Balance
                              </span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: "#802818" }}>
                                {formatCurrency(outstanding)}
                              </span>
                            </div>
                          </>
                        )}
                      </div>

                      {/* EPG Transaction details (non-failed) */}
                      {payment && !isFailed && (() => {
                        const card = (payment.raw_transaction as any)?.card ?? null;
                        const cardLabel = card ? `${card.scheme ?? "Card"} ····${card.last4 ?? ""}` : null;
                        return (
                          <div
                            className="rounded-xl px-3 py-2.5 mb-3"
                            style={{
                              background: "var(--admin-surface-sub)",
                              border: "0.5px solid var(--admin-border)",
                            }}
                          >
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1" style={{ fontSize: 11 }}>
                              <span
                                className={`px-2 py-0.5 rounded-full font-medium ${
                                  EPG_STATE_BADGE[payment.state] ?? "bg-neutral-100 text-neutral-600"
                                }`}
                                style={{ fontSize: 10 }}
                              >
                                {payment.state.replace(/_/g, " ")}
                              </span>
                              {payment.event_type && (
                                <span style={{ color: "var(--admin-text-faint)" }}>{payment.event_type}</span>
                              )}
                              {cardLabel && (
                                <span className="font-medium" style={{ color: "var(--admin-text)" }}>
                                  {cardLabel}
                                </span>
                              )}
                              {payment.transaction_id && (
                                <span
                                  className="font-mono truncate max-w-40"
                                  style={{ fontSize: 10, color: "var(--admin-text-faint)" }}
                                  title={payment.transaction_id}
                                >
                                  txn: {payment.transaction_id}
                                </span>
                              )}
                              <span className="ml-auto" style={{ color: "var(--admin-text-faint)" }}>
                                {new Date(payment.updated_at).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Payment schedule */}
                      {installments.length > 0 && (
                        <div className="mb-3">
                          <p
                            className="mb-1.5"
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              color: "var(--admin-text-faint)",
                            }}
                          >
                            Payment Schedule
                          </p>
                          <div className="flex flex-col">
                            {installments.map((inst, i) => {
                              const isInstOverdue = inst.status === "overdue";
                              return (
                                <div
                                  key={inst.id}
                                  className="flex items-center justify-between py-1.5"
                                  style={{
                                    borderTop: i > 0 ? "0.5px solid var(--admin-border-sub)" : undefined,
                                    fontSize: 12,
                                    background: isInstOverdue ? "rgba(254,202,202,0.12)" : undefined,
                                    borderRadius: isInstOverdue ? 6 : undefined,
                                    padding: isInstOverdue ? "6px 6px" : undefined,
                                  }}
                                >
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`px-1.5 py-0.5 rounded-full font-semibold ${
                                        INSTALLMENT_BADGE[inst.status] ?? "bg-neutral-100 text-neutral-600"
                                      }`}
                                      style={{ fontSize: 10 }}
                                    >
                                      {inst.status}
                                    </span>
                                    <span style={{ color: "var(--admin-text)" }}>
                                      Payment {inst.installment_number}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap justify-end">
                                    <span className="font-medium" style={{ color: "var(--admin-text)" }}>
                                      {formatCurrency(inst.amount_due)}
                                    </span>
                                    {inst.status !== "paid" &&
                                      inst.paid_amount != null &&
                                      Number(inst.paid_amount) > 0 && (
                                        <span style={{ fontSize: 11, fontWeight: 600, color: "#0A5A50" }}>
                                          {formatCurrency(Number(inst.paid_amount))} collected
                                        </span>
                                      )}
                                    <span style={{ fontSize: 11, color: "var(--admin-text-faint)" }}>
                                      {inst.status === "paid" && inst.paid_at
                                        ? `Paid ${new Date(inst.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                                        : `Due ${formatDate(inst.due_date)}`}
                                    </span>
                                    {(inst.status === "scheduled" || inst.status === "overdue") && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); handleMarkPaid(inst.id); }}
                                          disabled={markingPaid === inst.id}
                                          className="text-[10px] text-white px-2 py-1 rounded hover:opacity-80 transition-opacity disabled:opacity-50"
                                          style={{ background: "#16A34A" }}
                                        >
                                          {markingPaid === inst.id ? "Saving…" : "Mark Paid"}
                                        </button>
                                        {isInstOverdue && (
                                          <>
                                            <button
                                              type="button"
                                              onClick={(e) => { e.stopPropagation(); handleWaive(inst.id); }}
                                              disabled={waivingId === inst.id}
                                              className="text-[10px] px-2 py-1 rounded hover:opacity-80 transition-opacity disabled:opacity-50"
                                              style={{
                                                background: "transparent",
                                                color: "var(--admin-text-muted)",
                                                border: "0.5px solid var(--admin-border)",
                                              }}
                                            >
                                              {waivingId === inst.id ? "Waiving…" : "Waive"}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={(e) => { e.stopPropagation(); openContactModal(batch, inst); }}
                                              className="text-[10px] px-2 py-1 rounded hover:opacity-80 transition-opacity"
                                              style={{
                                                background: "transparent",
                                                color: "var(--admin-sidebar-active)",
                                                border: "1px solid var(--admin-sidebar-active)",
                                              }}
                                            >
                                              Contact
                                            </button>
                                          </>
                                        )}
                                      </>
                                    )}
                                    {inst.status === "paid" && inst.paid_at && (
                                      <span className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
                                        {new Date(inst.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Void/Refund history */}
                      <div className="mb-3">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleHistory(batch.id); }}
                          className="flex items-center gap-1.5 transition-colors"
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            color: expandedHistory.has(batch.id) ? "var(--admin-text)" : "var(--admin-text-muted)",
                          }}
                        >
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            style={{
                              transition: "transform 0.15s",
                              transform: expandedHistory.has(batch.id) ? "rotate(90deg)" : "rotate(0deg)",
                            }}
                          >
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                          Void / Refund History
                        </button>

                        {expandedHistory.has(batch.id) && (
                          <div className="mt-2 space-y-1.5">
                            {!refundHistory[batch.id] ? (
                              <p style={{ fontSize: 11, color: "var(--admin-text-faint)" }}>Loading…</p>
                            ) : refundHistory[batch.id].length === 0 ? (
                              <p style={{ fontSize: 11, color: "var(--admin-text-faint)" }}>No voids or refunds on record.</p>
                            ) : (
                              refundHistory[batch.id].map((r) => (
                                <div
                                  key={r.id}
                                  className="rounded-xl px-3 py-2 space-y-0.5"
                                  style={{ border: "0.5px solid var(--admin-border)", fontSize: 11 }}
                                >
                                  <div className="flex items-center justify-between flex-wrap gap-1.5">
                                    <div className="flex items-center gap-1.5">
                                      <span
                                        className={`px-1.5 py-0.5 rounded-full font-medium capitalize ${
                                          r.status === "succeeded"
                                            ? "bg-mint/20 text-mint-text"
                                            : r.status === "failed"
                                              ? "bg-pale-rose/30 text-pale-rose-text"
                                              : "bg-mauve/20 text-mauve-text"
                                        }`}
                                        style={{ fontSize: 10 }}
                                      >
                                        {r.status}
                                      </span>
                                      <span className="font-semibold capitalize" style={{ color: "var(--admin-text-muted)" }}>
                                        {r.type}
                                      </span>
                                      {r.amount != null && (
                                        <span style={{ color: "var(--admin-text-muted)" }}>{formatCurrency(r.amount)}</span>
                                      )}
                                    </div>
                                    <span style={{ color: "var(--admin-text-faint)" }}>
                                      {new Date(r.created_at).toLocaleDateString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric",
                                      })}
                                      {r.initiated_by_name && ` · ${r.initiated_by_name}`}
                                    </span>
                                  </div>
                                  <p style={{ color: "var(--admin-text-muted)" }}>{r.reason}</p>
                                  {r.failure_reason && <p className="text-red-600">{r.failure_reason}</p>}
                                  {r.epg_transaction_id && (
                                    <p className="font-mono" style={{ fontSize: 10, color: "var(--admin-text-faint)" }}>
                                      txn: {r.epg_transaction_id}
                                    </p>
                                  )}
                                  {r.line_items && r.line_items.length > 0 && (
                                    <div className="mt-1 space-y-0.5 pl-2" style={{ borderLeft: "2px solid var(--admin-border)" }}>
                                      {r.line_items.map((li, i) => (
                                        <div key={i} className="flex justify-between" style={{ color: "var(--admin-text-faint)" }}>
                                          <span>{li.className}</span>
                                          <span>{formatCurrency(li.amount)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>

                      {/* Actions row */}
                      <div
                        className="flex items-center gap-2 flex-wrap pt-2.5"
                        style={{ borderTop: "0.5px solid var(--admin-border-sub)" }}
                      >
                        <span style={{ fontSize: 11, color: "var(--admin-text-faint)" }}>{parent?.email ?? "—"}</span>
                        <div className="flex-1" />
                        {canRefund && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openVoidRefundModal(batch, "refund"); }}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-[12px] font-semibold transition-colors hover:bg-red-50"
                            style={{
                              background: "transparent",
                              color: "#802818",
                              border: "1px solid rgba(232,184,176,0.6)",
                            }}
                          >
                            ↩ Refund
                          </button>
                        )}
                        {canVoid && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openVoidRefundModal(batch, "void"); }}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-[12px] font-semibold transition-colors"
                            style={{
                              background: "var(--admin-surface-sub)",
                              color: "var(--admin-text-muted)",
                              border: "0.5px solid var(--admin-border)",
                            }}
                          >
                            ✕ Void
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openCreditModal(batch); }}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-[12px] font-semibold transition-colors"
                          style={{
                            background: "transparent",
                            color: "var(--admin-sidebar-active)",
                            border: "1px solid var(--admin-sidebar-active)",
                          }}
                        >
                          Issue Credit
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        )}
    </div>
  );
}
