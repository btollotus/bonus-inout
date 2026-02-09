import AuthGate from "@/components/AuthGate";
import OrdersClient from "./orders-client";

export default function OrdersPage() {
  return (
    <AuthGate>
      <main className="min-h-screen bg-black text-white">
        <OrdersClient />
      </main>
    </AuthGate>
  );
}