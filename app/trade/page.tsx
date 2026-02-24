// app/trade/page.tsx
import TradeClient from "./trade-client";

export const metadata = {
  title: "거래내역(통합)",
};

export default function TradePage() {
  return <TradeClient />;
}