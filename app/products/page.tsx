import AuthGate from "@/components/AuthGate";
import ProductsClient from "./products-client";

export const metadata = {
  title: "품목/바코드",
};

export default function ProductsPage() {
  return (
    <AuthGate>
      <ProductsClient />
    </AuthGate>
  );
}
