import type { Metadata } from "next";
export const metadata: Metadata = { title: "인사/급여 | BONUSMATE ERP" };
import AuthGate from "@/components/AuthGate";
import HRClient from "./hr-client";

export default function HRPage() {
  return (
    <AuthGate>
      <HRClient />
    </AuthGate>
  );
}