"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/app/providers/CartProvider";

interface CartRestoreGuardProps {
  semesterId: string;
  children: React.ReactNode;
}

export function CartRestoreGuard({
  semesterId,
  children,
}: CartRestoreGuardProps) {
  const router = useRouter();
  const { hydrated, itemCount, isExpired } = useCart();

  useEffect(() => {
    if (!hydrated) {
      console.log("[CartRestoreGuard] Waiting for cart hydration");
      return;
    }

    console.log("[CartRestoreGuard] Cart state", { itemCount, isExpired });

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
