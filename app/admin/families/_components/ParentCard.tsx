"use client";

interface ParentLike {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string | null;
  is_primary_parent: boolean;
}

function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

export function ParentCard({
  parent,
  isSelected,
  onClick,
  onEdit,
  onMakePrimary,
  onRemove,
  isPending,
}: {
  parent: ParentLike;
  isSelected?: boolean;
  onClick?: () => void;
  onEdit?: () => void;
  onMakePrimary?: () => void;
  onRemove?: () => void;
  isPending?: boolean;
}) {
  const isPrimary = parent.is_primary_parent;

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all ${
        onClick ? "cursor-pointer" : ""
      } ${
        isSelected
          ? "border-primary-600 ring-2 ring-primary-600 bg-white"
          : "border-neutral-200 bg-neutral-50 hover:bg-white"
      }`}
    >
      {/* Avatar */}
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
          isPrimary
            ? "bg-primary-100 text-primary-700"
            : "bg-neutral-200 text-neutral-600"
        }`}
      >
        {initials(parent.first_name, parent.last_name)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-neutral-900 text-sm truncate">
          {parent.first_name} {parent.last_name}
        </p>
        <p className="text-xs text-neutral-500 truncate">{parent.email}</p>
      </div>

      {/* Role badge */}
      <span
        className={`text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
          isPrimary
            ? "bg-primary-100 text-primary-700"
            : "bg-neutral-100 text-neutral-600"
        }`}
      >
        {isPrimary ? "Primary parent" : "Guardian"}
      </span>

      {/* Action buttons — stop propagation so clicks don't trigger card selection */}
      {(onMakePrimary || onRemove || onEdit) && (
        <div
          className="flex items-center gap-2 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {onMakePrimary && (
            <button
              onClick={onMakePrimary}
              disabled={isPending}
              className="text-[11px] text-neutral-400 hover:text-primary-600 font-medium disabled:opacity-50"
            >
              Make primary
            </button>
          )}
          {onRemove && (
            <button
              onClick={onRemove}
              className="text-[11px] text-neutral-400 hover:text-red-600 font-medium"
            >
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}
