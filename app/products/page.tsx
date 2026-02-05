import AuthGate from "@/components/AuthGate";
import ProductsClient from "./products-client";

export default function ProductsPage() {
  return (
    <AuthGate>
      <ProductsClient />
    </AuthGate>
  );
}
