import AuthGate from "@/components/AuthGate";
import LedgerClient from "./ledger-client";

export default function LedgerPage() {
  return (
    <AuthGate>
      <main className="min-h-screen bg-black text-white">
        <LedgerClient />
      </main>
    </AuthGate>
  );
}