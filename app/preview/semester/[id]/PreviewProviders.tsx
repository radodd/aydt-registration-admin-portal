"use client";

import { CartProvider } from "@/app/providers/CartProvider";
import { RegistrationProvider } from "@/app/providers/RegistrationProvider";

export function PreviewProviders({
  semesterId,
  children,
}: {
  semesterId: string;
  children: React.ReactNode;
}) {
  return (
    <CartProvider semesterId={semesterId} preview>
      <RegistrationProvider semesterId={semesterId} preview>
        {children}
      </RegistrationProvider>
    </CartProvider>
  );
}
