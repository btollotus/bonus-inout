import type { Metadata } from "next";
export const metadata: Metadata = { title: "스캔 | BONUSMATE ERP" };

import AuthGate from "@/components/AuthGate";
import ScanClient from "./scan-client";

export default function ScanPage() {
  return (
    <AuthGate>
      <ScanClient />
    </AuthGate>
  );
}
