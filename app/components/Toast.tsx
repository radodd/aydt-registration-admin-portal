"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CheckCircle2,
  AlertCircle,
  Info,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";

/* ──────────────────────────────────────────────────────────────────────────
 * Shared toast primitive.
 *
 * One <ToastProvider> is mounted in the admin layout; any admin client
 * component calls useToast() to surface success/error/info/warning toasts.
 * Reuses the --shared-toast-* CSS vars from globals.css. Toasts stack in the
 * bottom-right (above the mobile tab bar), auto-dismiss after 5s, and can be
 * dismissed early by clicking.
 * ────────────────────────────────────────────────────────────────────────── */

export type ToastType = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  msg: string;
  type: ToastType;
}

interface ToastApi {
  show: (msg: string, type?: ToastType) => void;
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
  warning: (msg: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DURATION_MS = 5000;

const STYLES: Record<
  ToastType,
  { bg: string; text: string; border: string; Icon: LucideIcon }
> = {
  success: {
    bg: "var(--shared-toast-success-bg)",
    text: "var(--shared-toast-success-text)",
    border: "var(--shared-toast-success-border)",
    Icon: CheckCircle2,
  },
  error: {
    bg: "var(--shared-toast-error-bg)",
    text: "var(--shared-toast-error-text)",
    border: "var(--shared-toast-error-border)",
    Icon: AlertCircle,
  },
  warning: {
    bg: "var(--shared-toast-warning-bg)",
    text: "var(--shared-toast-warning-text)",
    border: "var(--shared-toast-warning-border)",
    Icon: AlertTriangle,
  },
  info: {
    bg: "var(--shared-toast-info-bg)",
    text: "var(--shared-toast-info-text)",
    border: "var(--shared-toast-info-border)",
    Icon: Info,
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (msg: string, type: ToastType = "success") => {
      const id = ++counter.current;
      setToasts((prev) => [...prev, { id, msg, type }]);
      setTimeout(() => remove(id), DURATION_MS);
    },
    [remove],
  );

  // `show` is stable (memoized), so this API object is stable across renders —
  // callers can safely depend on the value returned by useToast().
  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m) => show(m, "success"),
      error: (m) => show(m, "error"),
      info: (m) => show(m, "info"),
      warning: (m) => show(m, "warning"),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-100 flex flex-col gap-2 pointer-events-none">
          {toasts.map((t) => (
            <ToastCard key={t.id} toast={t} onDismiss={() => remove(t.id)} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: () => void;
}) {
  const { bg, text, border, Icon } = STYLES[toast.type];
  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onDismiss}
      className="pointer-events-auto flex items-start gap-2.5 max-w-sm text-sm px-4 py-3 rounded-lg shadow-lg cursor-pointer"
      style={{ background: bg, color: text, border: `1px solid ${border}` }}
    >
      <Icon size={16} strokeWidth={2} className="mt-px shrink-0" />
      <span className="leading-snug">{toast.msg}</span>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return ctx;
}
