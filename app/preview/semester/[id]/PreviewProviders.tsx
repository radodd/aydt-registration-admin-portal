"use client";

import { AuthProvider } from "@/app/providers/AuthProvider";
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
    // AuthProvider mirrors the (user-facing) layout. Reused registration steps
    // (ParticipantsContent, FormContent) call useAuth(), which throws without a
    // provider in the tree. The previewing admin is authenticated, so this
    // hydrates cleanly with their session.
    <AuthProvider>
      <CartProvider semesterId={semesterId} preview>
        <RegistrationProvider semesterId={semesterId} preview>
          {children}
        </RegistrationProvider>
      </CartProvider>
    </AuthProvider>
  );
}
