"use client";

export function ConfirmModal({
  title,
  message,
  confirmLabel,
  destructive,
  onConfirm,
  onClose,
  error,
  isPending,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  error: string | null;
  isPending: boolean;
}) {
  return (
    <div className="p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
        <p className="text-sm text-neutral-600 mt-1">{message}</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="px-4 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 rounded-xl hover:bg-neutral-200 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isPending}
          className={`px-4 py-2 text-sm font-medium text-white rounded-xl disabled:opacity-50 ${
            destructive
              ? "bg-red-600 hover:bg-red-700"
              : "bg-primary-600 hover:bg-primary-700"
          }`}
        >
          {isPending ? "Working..." : confirmLabel}
        </button>
      </div>
    </div>
  );
}
