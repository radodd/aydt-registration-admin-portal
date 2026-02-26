import { Suspense } from "react";
import UnsubscribeContent from "./UnsubscribeContent";

export const metadata = { title: "Unsubscribe — AYDT" };

export default function UnsubscribePage() {
  return (
    <Suspense>
      <UnsubscribeContent />
    </Suspense>
  );
}
