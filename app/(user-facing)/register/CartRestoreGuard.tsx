"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CartProvider, useCart } from "@/app/providers/CartProvider";

interface CartRestoreGuardProps {
  semesterId: string;
  children: React.ReactNode;
}

/* -------------------------------------------------------------------------- */
/* Internal Guard                                                              */
/* -------------------------------------------------------------------------- */

function Guard({ semesterId, children }: CartRestoreGuardProps) {
  const router = useRouter();
  const { hydrated, itemCount, isExpired } = useCart();

  useEffect(() => {
    if (!hydrated) {
      console.log("[CartRestoreGuard] Waiting for cart hydration");
      return;
    }

    console.log("[CartRestoreGuard] Cart state", {
      itemCount,
      isExpired,
    });

    if (itemCount === 0 || isExpired) {
      console.warn(
        "[CartRestoreGuard] Cart invalid — redirecting to semester page",
      );
      router.replace(`/semester/${semesterId}`);
    }
  }, [hydrated, itemCount, isExpired, semesterId, router]);

  if (!hydrated) {
    return null;
  }

  if (itemCount === 0 || isExpired) {
    return null;
  }

  return <>{children}</>;
}

/* -------------------------------------------------------------------------- */
/* Public Guard                                                                */
/* -------------------------------------------------------------------------- */

export function CartRestoreGuard({
  semesterId,
  children,
}: CartRestoreGuardProps) {
  return (
    <CartProvider semesterId={semesterId}>
      <Guard semesterId={semesterId}>{children}</Guard>
    </CartProvider>
  );
}
