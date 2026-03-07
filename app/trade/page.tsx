import type { Metadata } from "next";
export const metadata: Metadata = { title: "거래내역(통합) | BONUSMATE ERP" };

// app/trade/page.tsx
import TradeClient from "./trade-client";

export default function TradePage() {
  return <TradeClient />;
}