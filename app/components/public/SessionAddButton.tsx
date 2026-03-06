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
        className="text-xs bg-gray-200 text-gray-500 px-3 py-1.5 rounded-lg cursor-not-allowed"
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
        className="text-xs bg-yellow-50 text-yellow-700 px-3 py-1.5 rounded-lg"
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
        className="text-xs bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg"
      >
        In Cart ✓
      </button>
    );
  }

  // DEFAULT ADD
  return (
    <button
      onClick={handleAdd}
      className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700"
    >
      Add
    </button>
  );
}
