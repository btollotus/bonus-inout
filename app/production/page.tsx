import type { Metadata } from "next";
export const metadata: Metadata = { title: "작업지시서 | BONUSMATE ERP" };

// app/production/page.tsx
import ProductionClient from "./production-client";

export default function ProductionPage() {
  return <ProductionClient />;
}
