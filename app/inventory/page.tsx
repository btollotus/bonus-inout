// app/inventory/page.tsx

import type { Metadata } from "next";
export const metadata: Metadata = { title: "재고관리" };
// → 브라우저 탭: "재고관리 | BONUSMATE ERP"

import AuthGate from "@/components/AuthGate";
import InventoryClient from "./inventory-client";

export default function InventoryPage() {
  return (
    <AuthGate>
      <InventoryClient />
    </AuthGate>
  );
}
