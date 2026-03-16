"use client";

import { useEffect, useRef, HTMLAttributes } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** sm=400px  md=560px  lg=720px  xl=900px */
  size?: "sm" | "md" | "lg" | "xl";
  children: React.ReactNode;
}

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

function Modal({ open, onClose, size = "md", children }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === overlayRef.current && onClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className={[
          "relative z-10 w-full bg-white rounded-2xl shadow-dropdown",
          "flex flex-col max-h-[90vh] overflow-hidden",
          sizeClasses[size],
        ].join(" ")}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement> & { onClose?: () => void }) {
  const { onClose, ...rest } = props as HTMLAttributes<HTMLDivElement> & { onClose?: () => void };
  return (
    <div
      className={["flex items-center justify-between px-6 py-4 border-b border-neutral-100 shrink-0", className].join(" ")}
      {...rest}
    >
      <div className="flex-1">{children}</div>
      {onClose && (
        <button
          onClick={onClose}
          className="ml-4 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

function ModalBody({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["flex-1 overflow-y-auto px-6 py-5", className].join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

function ModalFooter({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={[
        "flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-100 shrink-0",
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

export { Modal, ModalHeader, ModalBody, ModalFooter };
export type { ModalProps };
