import type { Metadata } from "next";
import { CartRestorer } from "./CartRestorer";

export const metadata: Metadata = {
  title: "Cart — AYDT Registration",
};

export default function CartPage() {
  return <CartRestorer />;
}
