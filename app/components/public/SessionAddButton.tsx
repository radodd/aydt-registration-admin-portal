"use client";

import { useCart } from "@/app/providers/CartProvider";
import type { PublicSession } from "@/types/public";

interface Props {
  session: PublicSession;
}

export function SessionAddButton({ session }: Props) {
  const { add, remove, sessionIds } = useCart();

  const inCart = sessionIds.includes(session.id);
  const isFull = session.spotsRemaining <= 0;

  const handleAdd = () => {
    add(session.id);
  };

  const handleRemove = () => {
    remove(session.id);
  };

  // FULL + NO WAITLIST
  if (isFull && !session.waitlistEnabled) {
    return (
      <button
        disabled
        className="text-xs bg-neutral-200 text-neutral-500 px-3 py-1.5 rounded-lg cursor-not-allowed"
      >
        Full
      </button>
    );
  }

  // FULL + WAITLIST
  if (isFull && session.waitlistEnabled) {
    return (
      <button
        onClick={() => add(session.id)} // or separate waitlist handler
        className="text-xs bg-mauve/10 text-mauve-text px-3 py-1.5 rounded-lg"
      >
        Join Waitlist
      </button>
    );
  }

  // IN CART
  if (inCart) {
    return (
      <button
        onClick={handleRemove}
        className="text-xs bg-primary-100 text-primary-700 px-3 py-1.5 rounded-lg"
      >
        In Cart ✓
      </button>
    );
  }

  // DEFAULT ADD
  return (
    <button
      onClick={handleAdd}
      className="text-xs bg-primary-600 text-white px-3 py-1.5 rounded-lg hover:bg-primary-700"
    >
      Add
    </button>
  );
}
