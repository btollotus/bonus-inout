
import type { Metadata } from "next";
export const metadata: Metadata = { title: "품목/바코드 | BONUSMATE ERP" };

import AuthGate from "@/components/AuthGate";
import ProductsClient from "./products-client";

export default function ProductsPage() {
  return (
    <AuthGate>
      <ProductsClient />
    </AuthGate>
  );
}
