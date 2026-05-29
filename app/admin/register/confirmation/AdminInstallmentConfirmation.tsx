"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle, Clock, AlertTriangle, ExternalLink } from "lucide-react";

type Phase = "checking" | "confirmed" | "pending" | "failed";

/**
 * Polls /api/register/batch-status after the admin returns from the Elavon
 * hosted page. The webhook stores the card, charges installment 1, and confirms
 * the order — this surfaces that outcome to the admin:
 *   - confirmed → plan active, card stored, installment 1 charged
 *   - failed    → order was failed (e.g. abandoned / grace window elapsed)
 *   - timed out while pending → likely a declined card; point to the dashboard
 *
 * Real-time decline detection is intentionally out of scope: a declined
 * installment-1 charge leaves the order 'pending' (webhook links the stored
 * method for manual retry), so within the poll window it reads as "processing"
 * and we route the admin to the payments dashboard to retry.
 */
export default function AdminInstallmentConfirmation({
  batchId,
  dancerId,
}: {
  batchId: string | null;
  dancerId: string | null;
}) {
  const [phase, setPhase] = useState<Phase>(batchId ? "checking" : "failed");
  const [timedOut, setTimedOut] = useState(false);
  const pollCount = useRef(0);
  const MAX_POLLS = 15; // 15 × 2s = 30s

  useEffect(() => {
    if (!batchId) return;

    let cancelled = false;
    const tick = async () => {
      pollCount.current++;
      try {
        const res = await fetch(`/api/register/batch-status?id=${batchId}`);
        if (res.ok) {
          const data = (await res.json()) as { status?: string };
          if (cancelled) return;
          if (data.status === "confirmed") {
            setPhase("confirmed");
            return;
          }
          if (data.status === "failed") {
            setPhase("failed");
            return;
          }
        }
      } catch {
        /* transient — keep polling */
      }
      if (cancelled) return;
      if (pollCount.current >= MAX_POLLS) {
        setTimedOut(true);
        setPhase("pending");
        return;
      }
      setPhase("pending");
      timer = setTimeout(tick, 2000);
    };

    let timer = setTimeout(tick, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [batchId]);

  if (phase === "confirmed") {
    return (
      <Shell
        icon={<CheckCircle className="w-14 h-14 text-green-500" />}
        title="Installment plan active"
        body="The card was stored, installment 1 was charged, and the remaining installments will auto-charge on schedule."
      >
        <Actions dancerId={dancerId} />
      </Shell>
    );
  }

  if (phase === "failed") {
    return (
      <Shell
        icon={<AlertTriangle className="w-14 h-14 text-[#8E2A23]" />}
        title={batchId ? "This registration didn’t complete" : "Missing registration reference"}
        body={
          batchId
            ? "The order was not confirmed — the card may have been declined or the session was abandoned. Open the payments dashboard to review and retry the charge."
            : "No batch was provided in the return URL. Check the payments dashboard for the most recent registration."
        }
      >
        <Actions dancerId={dancerId} emphasizePayments />
      </Shell>
    );
  }

  // checking / pending
  return (
    <Shell
      icon={
        timedOut ? (
          <Clock className="w-14 h-14 text-[#B45309]" />
        ) : (
          <div className="w-12 h-12 rounded-full border-4 border-[#EDE9E4] border-t-[#8E2A23] animate-spin" />
        )
      }
      title={timedOut ? "Still confirming…" : "Confirming the installment plan…"}
      body={
        timedOut
          ? "This is taking longer than usual. If it doesn’t confirm shortly, the card may have been declined — check the payments dashboard to review and retry."
          : "The card is being stored and installment 1 charged. This usually takes a few seconds."
      }
    >
      {timedOut && <Actions dancerId={dancerId} emphasizePayments />}
    </Shell>
  );
}

function Shell({
  icon,
  title,
  body,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="py-12 text-center space-y-4">
      <div className="flex justify-center">{icon}</div>
      <h1 className="text-xl font-semibold text-[#201D18]">{title}</h1>
      <p className="text-sm text-[#736D65] max-w-md mx-auto leading-relaxed">{body}</p>
      {children}
    </div>
  );
}

function Actions({
  dancerId,
  emphasizePayments,
}: {
  dancerId: string | null;
  emphasizePayments?: boolean;
}) {
  const primary =
    "flex items-center justify-center gap-2 px-4 py-2.5 bg-[#8E2A23] text-white rounded-xl text-sm font-medium hover:bg-[#7A2420] transition";
  const secondary =
    "flex items-center justify-center gap-2 px-4 py-2.5 border border-[#DDD9D2] text-[#736D65] rounded-xl text-sm hover:bg-[#F7F5F2] transition";

  return (
    <div className="flex flex-col gap-2 pt-4 max-w-xs mx-auto">
      <Link href="/admin/payments" className={emphasizePayments ? primary : secondary}>
        Go to payment dashboard
        {emphasizePayments && <ExternalLink className="w-3.5 h-3.5" />}
      </Link>
      {dancerId && (
        <Link href={`/admin/dancers/${dancerId}`} className={emphasizePayments ? secondary : primary}>
          View dancer profile
          {!emphasizePayments && <ExternalLink className="w-3.5 h-3.5" />}
        </Link>
      )}
      <Link href="/admin/register" className="text-sm text-[#9E9890] hover:text-[#736D65] mt-1">
        Register another
      </Link>
    </div>
  );
}
