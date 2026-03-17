"use client";

import React from "react";

export const inputCls =
  "w-full px-3 py-2 text-sm border border-neutral-300 rounded-xl text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-600";

export function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-neutral-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

export function ModalActions({
  onClose,
  isPending,
  submitLabel,
}: {
  onClose: () => void;
  isPending: boolean;
  submitLabel: string;
}) {
  return (
    <div className="flex gap-3 justify-end pt-1">
      <button
        type="button"
        onClick={onClose}
        disabled={isPending}
        className="px-4 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 rounded-xl hover:bg-neutral-200 disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-xl hover:bg-primary-700 disabled:opacity-50"
      >
        {isPending ? "Saving..." : submitLabel}
      </button>
    </div>
  );
}
