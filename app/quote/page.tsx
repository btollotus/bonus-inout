import type { Metadata } from "next";
export const metadata: Metadata = { title: "견적서 | BONUSMATE ERP" };

// app/quote/page.tsx
import QuoteClient from "./QuoteClient";

export default function QuotePage() {
  return <QuoteClient />;
}